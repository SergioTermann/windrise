// ③ 记忆层 · 画像动态更新（从用户行为改为工单闭环）
// 诊断 Agent 只读画像、不直写台账：一次幻觉可能污染长期设备履历。
// 事件总线 → 旁路抽取（异步）→ 短期状态缓存（实时）/ 长期风机画像（批处理）。
// 置信度由“专家确认 + 备件更换 + 复发情况”共同加权；工单未验收前只是候选结论。
// 对应技术细节第 9 页“3.2 画像动态更新”。

// 旁路抽取服务：从事件（告警/工单/专家反馈）提取故障原因/措施/备件候选。
export function extractFromEvent(event = {}) {
  const type = event.type || 'unknown'
  const realtime = type === 'alarm' || type === 'reset' || type === 'curtailment'
  return {
    turbineId: event.turbineId || '待补充',
    type,
    // 实时层：当前告警/复位/限功率秒级进入工作记忆。
    lane: realtime ? 'realtime' : 'batch',
    cause: event.cause || '',
    measure: event.measure || '',
    parts: Array.isArray(event.parts) ? event.parts : [],
    faultCode: event.faultCode || '',
    // 工单未验收前，故障原因只是候选结论。
    verified: Boolean(event.expertConfirmed || event.workOrderClosed),
    expertConfirmed: Boolean(event.expertConfirmed),
    partsReplaced: Boolean(event.partsReplaced),
    recurred: Boolean(event.recurred),
    occurredAt: event.occurredAt || '',
  }
}

// 置信度加权：专家确认、备件更换、无复发共同抬升；复发则显著削弱。
export function scoreProfileConfidence(extracted = {}) {
  let score = 0.3
  if (extracted.expertConfirmed) score += 0.35
  if (extracted.partsReplaced) score += 0.2
  if (extracted.verified) score += 0.1
  if (extracted.recurred) score -= 0.3
  return round(Math.max(0, Math.min(0.98, score)))
}

// 画像更新路由器：实时事件进短期缓存；工单闭环/专家确认后批处理更新长期画像。
// 不提供对资产台账的同步直写通道 —— 台账更新走既有 EAM 流程。
export function createProfileUpdater({ shortTerm, longTerm = new Map(), now = () => Date.now() } = {}) {
  const pendingBatch = []

  function ingest(event) {
    const extracted = extractFromEvent(event)
    if (extracted.lane === 'realtime') {
      // 实时链路不能被写库和审批拖慢：只落短期缓存（带 TTL）。
      if (shortTerm && typeof shortTerm.set === 'function') {
        shortTerm.set(`${extracted.turbineId}:${extracted.type}`, extracted, {
          ttlMs: event.ttlMs,
          confidence: scoreProfileConfidence(extracted),
        })
      }
      return { applied: 'realtime', extracted }
    }
    // 批处理：未验收的先入待处理队列，验收后才落长期画像。
    pendingBatch.push(extracted)
    return { applied: 'queued', extracted }
  }

  // 批处理落库：只有工单验收/专家确认的候选才写入长期画像。
  function flushBatch() {
    const applied = []
    const held = []
    for (const item of pendingBatch) {
      if (!item.verified) { held.push(item); continue }
      const key = `${item.turbineId}:${item.faultCode || item.type}`
      const prior = longTerm.get(key)
      const confidence = scoreProfileConfidence(item)
      longTerm.set(key, {
        turbineId: item.turbineId,
        faultCode: item.faultCode,
        cause: item.cause,
        measure: item.measure,
        parts: item.parts,
        confidence: prior ? round(Math.max(prior.confidence, confidence)) : confidence,
        occurrences: (prior?.occurrences || 0) + 1,
        updatedAt: now(),
      })
      applied.push(key)
    }
    pendingBatch.length = 0
    pendingBatch.push(...held) // 未验收的保留，等待后续闭环。
    return { applied, heldBack: held.length }
  }

  return {
    ingest,
    flushBatch,
    pendingCount: () => pendingBatch.length,
    longTermProfile: () => new Map(longTerm),
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
