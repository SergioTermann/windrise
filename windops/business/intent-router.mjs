// ① 业务层 · 意图路由
// 区分闲聊、知识查询、现场诊断和复盘，决定是否进入七层诊断链路。
// 对应技术细节第 2/4 页“业务层：告警研判/故障诊断/检修指导/工单闭环/复盘”。

import { isWindOpsDomainQuery, containsHighRiskAction } from '../domain.mjs'
import { detectWindOpsWorkPhase } from '../memory/work-phase.mjs'

export const WIND_OPS_INTENTS = {
  CHITCHAT: 'chitchat',
  KNOWLEDGE: 'knowledge',
  DIAGNOSIS: 'diagnosis',
  REVIEW: 'review',
}

export function routeWindOpsIntent(query, caseInfo = {}) {
  const text = String(query || '')
  if (!isWindOpsDomainQuery(text)) {
    return { intent: WIND_OPS_INTENTS.CHITCHAT, needsArchitecture: false }
  }
  const phase = detectWindOpsWorkPhase(text, caseInfo)
  if (phase === 'review') {
    return { intent: WIND_OPS_INTENTS.REVIEW, needsArchitecture: true }
  }
  // 只解释故障码/术语，不涉及具体风机与高风险动作 → 知识查询。
  const isPureExplanation = /是什么故障|什么意思|解释一下|含义|代表什么/.test(text)
  if (isPureExplanation && !containsHighRiskAction(text) && caseInfo.turbineId === '待补充') {
    return { intent: WIND_OPS_INTENTS.KNOWLEDGE, needsArchitecture: true }
  }
  return { intent: WIND_OPS_INTENTS.DIAGNOSIS, needsArchitecture: true }
}
