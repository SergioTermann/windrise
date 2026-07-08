// ⑦ 反馈层 —— KPI 采集
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeKpi } from '../index.mjs'

const TRACES = [
  { modelTask: 'diagnosis', system: '变桨系统', safetyDecision: 'advice_only_human_confirm_required', riskActions: ['远程复位/启停机'], confidence: 0.8, governance: 'pending_review_pool' },
  { modelTask: 'faq', system: '齿轮箱系统', safetyDecision: 'read_only_diagnosis_allowed', riskActions: [], confidence: 0.6, governance: 'pending_review_pool' },
  { modelTask: 'diagnosis', system: '变桨系统', safetyDecision: 'advice_only_human_confirm_required', riskActions: ['登塔/进舱/开柜'], confidence: 0.7, governance: 'promoted_to_training' },
]

test('汇总总量与分布', () => {
  const k = summarizeKpi(TRACES)
  assert.equal(k.total, 3)
  assert.equal(k.byModelTask.diagnosis, 2)
  assert.equal(k.bySystem['变桨系统'], 2)
  assert.equal(k.byGovernance.pending_review_pool, 2)
})

test('红线：高风险直连执行为 0 时 redlineOk', () => {
  const k = summarizeKpi(TRACES)
  assert.equal(k.highRiskDirectExecutions, 0)
  assert.equal(k.redlineOk, true)
})

test('检出高风险直连执行则红线失败', () => {
  const k = summarizeKpi([...TRACES, { safetyDecision: 'executed_control_directly', riskActions: ['远程复位/启停机'] }])
  assert.equal(k.highRiskDirectExecutions, 1)
  assert.equal(k.redlineOk, false)
})

test('安全拦截率：所有高风险轨迹均被拦为仅建议', () => {
  const k = summarizeKpi(TRACES)
  assert.equal(k.highRiskTurns, 2)
  assert.equal(k.safetyInterceptRate, 1)
})

test('平均置信度与待审核数', () => {
  const k = summarizeKpi(TRACES)
  assert.equal(k.avgConfidence, 0.7)
  assert.equal(k.pendingReview, 2)
})

test('空轨迹安全兜底', () => {
  const k = summarizeKpi([])
  assert.equal(k.total, 0)
  assert.equal(k.safetyInterceptRate, null)
  assert.equal(k.avgConfidence, null)
  assert.equal(k.redlineOk, true)
})
