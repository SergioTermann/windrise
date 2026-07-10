// ④ 模型应用层 · LLM Wiki 三层知识组织（单一向量检索不适合故障诊断）
// L1 语义缓存（毫秒级返回）→ L2 多路召回（BM25 精确 + 向量语义 + 图谱邻接）
// → L3 Rerank + 证据分级（官方手册 > 场站SOP > 专家 > 已关闭工单 > 未验证经验）。
// 核心不是“找相似文本”，而是“组织可执行、可追溯、符合机型和安全条件的证据”。
// 对应技术细节第 15/16 页“LLM Wiki 三层知识组织”。

import { createBm25Index } from '../models/bm25-retriever.mjs'
import { createVectorIndex } from '../models/vector-retriever.mjs'
import { createKnowledgeGraph } from '../models/knowledge-graph.mjs'
import { createSemanticCache } from '../models/semantic-cache.mjs'
import { gradeEvidence } from '../models/evidence-grader.mjs'
import { SEED_WIKI_DOCUMENTS, SEED_KNOWLEDGE_GRAPH } from './knowledge-seed.mjs'

// 多路召回融合权重：命中多条通路的证据获得加成（多路一致更可信）。
const CHANNEL_WEIGHT = { bm25: 1.0, vector: 0.9, graph: 0.85 }

export function createLlmWiki({
  documents = SEED_WIKI_DOCUMENTS,
  graph = SEED_KNOWLEDGE_GRAPH,
  cache = createSemanticCache(),
  now = () => Date.now(),
} = {}) {
  const docMap = new Map(documents.map(doc => [doc.id, doc]))
  const bm25 = createBm25Index(documents)
  const vector = createVectorIndex(documents)
  const kg = createKnowledgeGraph(graph)

  // 三层查询：先探 L1，未命中走 L2 多路召回 + L3 分级重排。
  function lookup(caseInfo = {}, { query = '', topK = 5, recallK = 8 } = {}) {
    // L1 语义缓存
    const cached = cache.get(caseInfo)
    if (cached) {
      return {
        hit: 'L1',
        level: 'L1',
        answer: cached.answer,
        cached: true,
        citations: cached.answer?.citations || [],
      }
    }

    const text = [query, caseInfo.faultCode, caseInfo.component, caseInfo.system]
      .filter(v => v && v !== '待补充' && v !== '待识别')
      .join(' ')

    // L2 多路召回
    const bm25Hits = bm25.search(text, recallK).map(h => tag(h, 'bm25'))
    const vectorHits = vector.search(text, recallK).map(h => tag(h, 'vector'))
    const graphEvidence = kg.evidenceForCase(caseInfo)
    const graphNeighbors = kg.neighborsForCase(caseInfo)

    // 融合：按文档 id 合并三路，记录命中通路并叠加分数。
    const merged = mergeChannels([...bm25Hits, ...vectorHits], graphEvidence, docMap)

    // 适用条件匹配：文本相似之外，按 Case 的部件/故障码对齐证据，
    // 同码/同部件加权、跨部件冲突降权，命中在案证据时剔除明显不适用文档。
    // 对应技术细节第 15 页“版本一致性：同一故障在不同机型/控制器版本处理路径不同”。
    const gated = applyApplicability(caseInfo, merged)

    // L3 Rerank + 证据分级：先用融合分作为基础相似分，再乘证据分级权重。
    const graded = gradeEvidence(gated).slice(0, topK)
    const citations = graded.map(toCitation)

    return {
      hit: graded.length ? 'L2' : 'none',
      level: graded.length ? 'L2' : 'none',
      cached: false,
      recall: {
        bm25: bm25Hits.map(h => h.id),
        vector: vectorHits.map(h => h.id),
        graph: graphEvidence.map(h => h.id),
      },
      evidence: graded,
      citations,
      // 图谱直接产出的结构化清单：备件/工具/测点，供工单草稿与备件准备。
      partsAndPoints: {
        parts: graphNeighbors.parts.map(p => ({ key: p.key, name: p.name, note: p.note })),
        measures: graphNeighbors.measures.map(m => ({ key: m.key, name: m.name })),
        points: graphNeighbors.points.map(p => ({ key: p.key, name: p.name })),
      },
    }
  }

  // 已验证答案写入 L1 语义缓存（未识别故障签名不入缓存，见 semantic-cache）。
  function promoteToCache(caseInfo, answer) {
    return cache.set(caseInfo, answer)
  }

  return {
    lookup,
    promoteToCache,
    stats: () => ({ documents: documents.length, graphNodes: kg.size, cache: cache.stats() }),
  }
}

function tag(hit, channel) {
  return { id: hit.id, source: hit.doc?.source || 'unverified', text: hit.doc?.text || '', doc: hit.doc, score: hit.score, via: [channel] }
}

// 按 Case 的部件/故障码对齐证据适用条件：
// - 同故障码强加权、同部件加权（图谱证据视为已按部件对齐，不降权）；
// - 部件冲突（双方部件已知且不同）降权；
// - 只要存在“同码/同部件”的在案证据，就剔除部件冲突且非同码的明显不适用文档。
function applyApplicability(caseInfo, candidates) {
  const knownFault = caseInfo.faultCode && caseInfo.faultCode !== '待补充' ? caseInfo.faultCode : null
  const caseComponents = [caseInfo.component, caseInfo.system].filter(v => v && v !== '待识别')
  const scored = candidates.map(item => {
    const doc = item.doc || {}
    const isGraph = item.via.includes('graph')
    const faultMatch = knownFault && doc.faultCode && doc.faultCode === knownFault
    const componentMatch = doc.component && caseComponents.some(c => c === doc.component)
    const componentConflict =
      !isGraph && doc.component && caseComponents.length > 0 && !caseComponents.some(c => c === doc.component)
    let factor = 1
    if (faultMatch) factor *= 1.6
    if (componentMatch) factor *= 1.3
    if (componentConflict && !faultMatch) factor *= 0.4
    return { ...item, score: round(item.score * factor), faultMatch, componentMatch, componentConflict }
  })
  const hasOnTopic = scored.some(item => item.faultMatch || item.componentMatch)
  const gated = hasOnTopic
    ? scored.filter(item => item.faultMatch || item.componentMatch || !item.componentConflict)
    : scored
  // 清理内部标记，保留分级所需字段。
  return gated.map(({ faultMatch, componentMatch, componentConflict, ...rest }) => rest)
}

// 合并多路召回：同一文档取各通路加权分之和，并集其命中通路。
function mergeChannels(retrievalHits, graphEvidence, docMap) {
  const byId = new Map()
  const add = item => {
    const existing = byId.get(item.id)
    const channel = item.via[0]
    const contribution = (item.score ?? 0) * (CHANNEL_WEIGHT[channel] ?? 0.5)
    if (!existing) {
      byId.set(item.id, {
        id: item.id,
        source: item.source,
        text: item.text,
        doc: item.doc || docMap.get(item.id),
        via: [...item.via],
        score: contribution,
      })
      return
    }
    if (!existing.via.includes(channel)) existing.via.push(channel)
    existing.score += contribution
    if (!existing.text && item.text) existing.text = item.text
  }
  for (const item of retrievalHits) add(item)
  for (const item of graphEvidence) add(item)
  // 多路一致加成：命中通路越多越可信。
  for (const item of byId.values()) {
    item.score = round(item.score * (1 + 0.15 * (item.via.length - 1)))
  }
  return [...byId.values()]
}

function toCitation(item) {
  const doc = item.doc || {}
  return {
    id: item.id,
    tier: item.tier,
    source: item.source,
    via: item.via,
    score: item.gradedScore,
    applicability: doc.applicability || '',
    version: doc.version || '',
    updatedAt: doc.updatedAt || '',
    snippet: truncate(item.text, 120),
    // 已关闭工单必须标注“历史案例”。
    note: item.source === 'closed_work_order' ? '历史案例，仅作经验参考' : undefined,
  }
}

function truncate(text, limit) {
  const value = String(text || '').trim()
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
