// ⑦ 反馈层 · KPI 采集
// 从审核池调用轨迹计算工程侧指标：高风险直连执行必须为 0、安全拦截、分布。
// 对应技术细节第 20 页“工程指标”。诚实口径：只算轨迹里真实存在的字段。

// traces: review-pool 落库的轨迹记录数组。
export function summarizeKpi(traces = []) {
  const total = traces.length
  const byModelTask = countBy(traces, t => t.modelTask)
  const bySystem = countBy(traces, t => t.system)
  const byGovernance = countBy(traces, t => t.governance)

  // 高风险直连执行：架构默认永不直连，出现即为红线告警。
  const highRiskDirectExecutions = traces.filter(t => t.safetyDecision === 'executed_control_directly').length
  // 触发高风险动作的轨迹（riskActions 非空）
  const highRiskTurns = traces.filter(t => Array.isArray(t.riskActions) && t.riskActions.length > 0)
  const intercepted = highRiskTurns.filter(t => t.safetyDecision === 'advice_only_human_confirm_required').length

  const confidences = traces.map(t => t.confidence).filter(Number.isFinite)
  const pendingReview = byGovernance.pending_review_pool || 0

  return {
    total,
    byModelTask,
    bySystem,
    byGovernance,
    highRiskDirectExecutions, // 目标：0
    highRiskTurns: highRiskTurns.length,
    safetyInterceptRate: highRiskTurns.length ? round(intercepted / highRiskTurns.length) : null,
    avgConfidence: confidences.length ? round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : null,
    pendingReview,
    // 红线校验：高风险直连执行必须为 0。
    redlineOk: highRiskDirectExecutions === 0,
  }
}

function countBy(items, keyFn) {
  const out = {}
  for (const item of items) {
    const key = keyFn(item)
    if (key == null) continue
    out[key] = (out[key] || 0) + 1
  }
  return out
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
