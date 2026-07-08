// ⑦ 反馈层 · TraceLogger（L1 调用轨迹）
// 每步 Case/Plan/工具调用/证据/建议全留痕，先进入复盘与质检池。
// 对应技术细节第 14 页“TraceLogger”与第 8 页 L1 数据飞轮层。

export function buildWindOpsTrace({ caseInfo = {}, plan = {}, safetyGate = {}, modelRoute = {}, answer = '' } = {}) {
  return {
    caseId: caseInfo.id || 'case:unclassified',
    turbineId: caseInfo.turbineId || '待补充',
    system: caseInfo.system || '待识别',
    confidence: caseInfo.confidence ?? null,
    modelTask: modelRoute.task || 'diagnosis',
    planSteps: Array.isArray(plan.steps) ? plan.steps.map(step => ({ id: step.id, status: step.status })) : [],
    safetyDecision: safetyGate.decision || 'read_only_diagnosis_allowed',
    riskActions: safetyGate.riskActions || [],
    answerPreview: String(answer || '').slice(0, 160),
    // 轨迹默认进入审核池，治理通过后才进入训练集。
    governance: 'pending_review_pool',
  }
}
