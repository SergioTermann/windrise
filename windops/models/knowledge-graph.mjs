// ⑥ 模型层 · LLM Wiki L2 图谱邻接召回
// 部件 → 故障 → 措施 → 备件 的邻接关系：从结构化 Case 出发，沿边生成
// 处置措施、备件、工具、测点清单。故障码/备件号是精确节点，向量易漏、图谱能补。
// 对应技术细节第 15/16 页“图谱：部件-故障-措施-备件”“图纸/BOM/备件库→生成备件、工具、测点清单”。

const NODE_TYPES = ['component', 'fault', 'measure', 'part', 'point']

// edges: [{ from, to }]，节点用 `${type}:${key}` 表示。
export function createKnowledgeGraph({ nodes = [], edges = [] } = {}) {
  const nodeMap = new Map()
  for (const node of nodes) {
    if (!node || !node.type || !node.key) continue
    nodeMap.set(nodeId(node.type, node.key), { ...node, id: nodeId(node.type, node.key) })
  }
  // 邻接表（有向），同时保留反向以便按部件/故障双向检索。
  const adj = new Map()
  const radj = new Map()
  for (const edge of edges) {
    if (!edge?.from || !edge?.to) continue
    pushEdge(adj, edge.from, edge.to)
    pushEdge(radj, edge.to, edge.from)
  }

  // 从 Case 出发，广度优先收集关联的措施/备件/工具/测点。
  function neighborsForCase(caseInfo = {}, { maxHops = 3 } = {}) {
    const seeds = seedNodes(caseInfo)
    const visited = new Set(seeds)
    const buckets = { measure: [], part: [], point: [], fault: [] }
    let frontier = [...seeds]
    let hops = 0
    while (frontier.length && hops < maxHops) {
      const next = []
      for (const id of frontier) {
        for (const to of adj.get(id) || []) {
          if (visited.has(to)) continue
          visited.add(to)
          next.push(to)
          collect(buckets, to)
        }
      }
      frontier = next
      hops += 1
    }
    return {
      seeds: seeds.filter(id => nodeMap.has(id)),
      measures: buckets.measure,
      parts: buckets.part,
      points: buckets.point,
      relatedFaults: buckets.fault,
    }
  }

  // 图谱命中转成候选证据（供 L3 证据分级），备件/BOM 归为手册级、经验措施归为专家级。
  function evidenceForCase(caseInfo = {}, options = {}) {
    const n = neighborsForCase(caseInfo, options)
    const evidence = []
    for (const m of n.measures) {
      evidence.push({ id: m.id, source: m.source || 'expert', text: label('处置措施', m), score: m.weight ?? 0.6, via: ['graph'] })
    }
    for (const p of n.parts) {
      evidence.push({ id: p.id, source: p.source || 'manual', text: label('备件/BOM', p), score: p.weight ?? 0.55, via: ['graph'] })
    }
    return evidence
  }

  function seedNodes(caseInfo) {
    const seeds = []
    if (caseInfo.component && caseInfo.component !== '待识别') seeds.push(nodeId('component', caseInfo.component))
    if (caseInfo.system && caseInfo.system !== '待识别') seeds.push(nodeId('component', caseInfo.system))
    if (caseInfo.faultCode && caseInfo.faultCode !== '待补充') seeds.push(nodeId('fault', caseInfo.faultCode))
    return [...new Set(seeds)]
  }

  function collect(buckets, id) {
    const node = nodeMap.get(id)
    if (!node) return
    if (node.type === 'measure') buckets.measure.push(node)
    else if (node.type === 'part') buckets.part.push(node)
    else if (node.type === 'point') buckets.point.push(node)
    else if (node.type === 'fault') buckets.fault.push(node)
  }

  return {
    neighborsForCase,
    evidenceForCase,
    size: nodeMap.size,
    edgeCount: edges.length,
    hasNode: (type, key) => nodeMap.has(nodeId(type, key)),
  }
}

export function nodeId(type, key) {
  return `${type}:${key}`
}

export { NODE_TYPES }

function pushEdge(map, from, to) {
  if (!map.has(from)) map.set(from, [])
  map.get(from).push(to)
}

function label(prefix, node) {
  return `${prefix}：${node.name || node.key}${node.note ? `（${node.note}）` : ''}`
}
