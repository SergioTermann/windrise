// ② 数据层 · 结构化故障 Case 装配
// 汇总 FaultQueryRewriter 的抽取结果，补齐缺失项并给出置信度。
// Case 是下游记忆层、模型应用层、工具层的统一输入。

import { SYSTEM_RULES, containsHighRiskAction, hasSymptomSignal, slugify } from '../domain.mjs'
import {
  extractFaultCode,
  extractOperatingSignals,
  extractSafetySignals,
  extractTimeWindow,
  extractTurbineId,
  extractWindFarmId,
} from './fault-query-rewriter.mjs'
import { normalizeTerms } from './term-map.mjs'

export function buildWindOpsCase(query, context = {}) {
  const text = String(query || '')
  const normalized = normalizeTerms(text)
  // 先用原文匹配系统，未命中时用术语归一后的文本兜底。
  const matchedSystem =
    SYSTEM_RULES.find(rule => rule.pattern.test(text)) ||
    SYSTEM_RULES.find(rule => rule.pattern.test(normalized.canonicalText))
  const turbineId = extractTurbineId(text)
  const faultCode = extractFaultCode(text)
  const windFarmId = extractWindFarmId(text) || context.windFarmId || ''
  const timeWindow = extractTimeWindow(text)
  const operatingSignals = extractOperatingSignals(text)
  const safetySignals = extractSafetySignals(text)
  const missing = []
  if (!turbineId) missing.push('风机ID')
  if (!windFarmId && !context.windFarmName) missing.push('风场/机型')
  if (!matchedSystem) missing.push('系统/部件')
  if (!faultCode && !hasSymptomSignal(text)) missing.push('故障码或明确现象')
  if (timeWindow === '待补充') missing.push('运行时间窗')
  if (!operatingSignals.length) missing.push('运行状态/CMS或SCADA趋势')
  if (!safetySignals.length && containsHighRiskAction(text)) missing.push('安全前置条件')

  return {
    id: faultCode
      ? `case:${faultCode}`
      : `case:${slugify([turbineId, matchedSystem?.system, matchedSystem?.component].filter(Boolean).join('-') || 'unclassified')}`,
    turbineId: turbineId || '待补充',
    windFarmId: windFarmId || '待补充',
    windFarmName: context.windFarmName || '',
    models: Array.isArray(context.models) ? context.models : [],
    system: matchedSystem?.system || '待识别',
    component: matchedSystem?.component || '待识别',
    terms: normalized.terms,
    vendors: normalized.vendors,
    faultCode: faultCode || '待补充',
    timeWindow,
    operatingSignals,
    safetySignals,
    missing,
    confidence: computeCaseConfidence({
      turbineId,
      windFarmId,
      matchedSystem,
      faultCode,
      timeWindow,
      operatingSignals,
      safetySignals,
      text,
    }),
  }
}

function computeCaseConfidence({ turbineId, windFarmId, matchedSystem, faultCode, timeWindow, operatingSignals, safetySignals, text }) {
  let score = 0.15
  if (turbineId) score += 0.15
  if (windFarmId) score += 0.1
  if (matchedSystem) score += 0.18
  if (faultCode) score += 0.2
  if (timeWindow && timeWindow !== '待补充') score += 0.1
  if (operatingSignals?.length) score += 0.12
  if (safetySignals?.length || !containsHighRiskAction(text)) score += 0.1
  return Math.min(0.98, Math.round(score * 100) / 100)
}
