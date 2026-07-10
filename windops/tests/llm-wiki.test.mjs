// ④ 模型应用层 —— LLM Wiki 三层知识组织（L1缓存 / L2多路召回 / L3分级重排）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createLlmWiki,
  createVectorIndex,
  createKnowledgeGraph,
  createSemanticCache,
  buildWindOpsCase,
  SEED_KNOWLEDGE_GRAPH,
} from '../index.mjs'

test('createVectorIndex 语义相近召回，非零分且降序', () => {
  const idx = createVectorIndex([
    { id: 'a', text: '变桨系统 24V 电源模块低压 充电器 保险' },
    { id: 'b', text: '齿轮箱 油温高 冷却风扇 滤芯' },
  ])
  const hits = idx.search('变桨柜 24V 电压低', 5)
  assert.equal(hits[0].id, 'a')
  assert.ok(hits[0].score > 0)
  if (hits[1]) assert.ok(hits[0].score >= hits[1].score)
})

test('createVectorIndex 空查询返回空', () => {
  const idx = createVectorIndex([{ id: 'a', text: '变桨 24V' }])
  assert.deepEqual(idx.search('', 5), [])
})

test('createKnowledgeGraph 沿部件-故障-措施-备件邻接产出清单', () => {
  const kg = createKnowledgeGraph(SEED_KNOWLEDGE_GRAPH)
  const n = kg.neighborsForCase({ component: '变桨系统', faultCode: '303804' })
  assert.ok(n.parts.some(p => p.key === 'PS-24V-01'))
  assert.ok(n.measures.length >= 1)
  assert.ok(n.points.some(p => p.key === 'pitch_24v_voltage'))
})

test('createKnowledgeGraph evidenceForCase 标注 via=graph 与来源分级', () => {
  const kg = createKnowledgeGraph(SEED_KNOWLEDGE_GRAPH)
  const ev = kg.evidenceForCase({ component: '变桨系统', faultCode: '303804' })
  assert.ok(ev.length > 0)
  assert.ok(ev.every(e => e.via.includes('graph')))
  assert.ok(ev.some(e => e.source === 'manual'))
})

test('createKnowledgeGraph 未命中部件返回空清单', () => {
  const kg = createKnowledgeGraph(SEED_KNOWLEDGE_GRAPH)
  const n = kg.neighborsForCase({ component: '不存在部件' })
  assert.equal(n.parts.length, 0)
  assert.equal(n.measures.length, 0)
})

test('LLM Wiki L2 命中：多路召回 + 官方手册优先 + 历史工单标注', () => {
  const wiki = createLlmWiki()
  const c = buildWindOpsCase('3号机变桨24V低压 303804')
  const r = wiki.lookup(c, { query: '变桨24V低压怎么处理' })
  assert.equal(r.hit, 'L2')
  assert.ok(r.citations.length > 0)
  // 官方手册排在最前。
  assert.equal(r.citations[0].source, 'manual')
  // 历史工单必须标注“历史案例”。
  const wo = r.citations.find(ci => ci.source === 'closed_work_order')
  if (wo) assert.match(wo.note, /历史案例/)
  // 图谱同步产出备件清单。
  assert.ok(r.partsAndPoints.parts.some(p => p.key === 'PS-24V-01'))
})

test('LLM Wiki 多路一致的文档命中通路数 > 1', () => {
  const wiki = createLlmWiki()
  const c = buildWindOpsCase('变桨24V低压 303804')
  const r = wiki.lookup(c, { query: '变桨 24V 电源模块 充电器 保险' })
  const manual = r.evidence.find(e => e.id === 'manual-pitch-24v')
  assert.ok(manual, '应命中手册文档')
  assert.ok(manual.via.length >= 2, `多路召回应命中多个通路，实际 via=${manual.via}`)
})

test('LLM Wiki L1 语义缓存命中优先于多路召回', () => {
  const cache = createSemanticCache()
  const wiki = createLlmWiki({ cache })
  const c = buildWindOpsCase('齿轮箱油温高 512006')
  wiki.promoteToCache(c, { text: '标准处置卡：先查冷却回路', citations: [{ id: 'faq-1' }] })
  const r = wiki.lookup(c, { query: '齿轮箱油温高' })
  assert.equal(r.hit, 'L1')
  assert.equal(r.cached, true)
  assert.equal(r.answer.text, '标准处置卡：先查冷却回路')
})

test('LLM Wiki 无关查询无命中', () => {
  const wiki = createLlmWiki()
  const c = buildWindOpsCase('食堂今天吃什么')
  const r = wiki.lookup(c, { query: '食堂今天吃什么' })
  assert.equal(r.hit, 'none')
  assert.equal(r.citations.length, 0)
})
