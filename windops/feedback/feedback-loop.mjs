// ⑦ 反馈层 · 工单闭环与画像更新策略
// 工单验收/专家确认后再更新长期画像；临时状态设 TTL。
// 对应技术细节第 9 页“从用户行为改为工单闭环”。

export function buildWindOpsFeedbackLoop(caseInfo = {}, answer = '') {
  const feedbackItems = extractFeedbackItems(answer)
  return {
    workOrderDraftFields: {
      turbineId: caseInfo.turbineId || '待补充',
      system: caseInfo.system || '待识别',
      component: caseInfo.component || '待识别',
      faultCode: caseInfo.faultCode || '待补充',
      evidenceWindow: caseInfo.timeWindow || '待补充',
      pendingFeedback: feedbackItems,
    },
    memoryUpdatePolicy: {
      realtimeTtl: ['当前告警', '复位结果', '临时限功率', '短期天气影响'],
      longTermAfterApproval: ['已验收根因', '更换部件', '参数整定', '专家复核后的SOP修正'],
    },
  }
}

export function extractFeedbackItems(answer) {
  const value = String(answer || '')
  const matches = [...value.matchAll(/(?:请反馈|做完反馈)[:：]\s*([^。\n]+)/g)]
    .map(match => match[1].trim())
    .filter(Boolean)
  return matches.slice(-3)
}
