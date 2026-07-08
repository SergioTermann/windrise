// ④ 编排器 —— 七层串讲 payload / context
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  runWindOpsAgent,
  buildWindOpsArchitecturePayload,
  buildWindOpsArchitectureContext,
  WIND_OPS_ARCHITECTURE_LAYERS,
} from '../index.mjs'

test('WIND_OPS_ARCHITECTURE_LAYERS 恰为七层且顺序固定', () => {
  assert.equal(WIND_OPS_ARCHITECTURE_LAYERS.length, 7)
  assert.deepEqual(
    WIND_OPS_ARCHITECTURE_LAYERS.map(l => l.id),
    ['business', 'data', 'memory', 'core', 'tools', 'models', 'feedback'],
  )
  for (const l of WIND_OPS_ARCHITECTURE_LAYERS) assert.ok(l.name && l.responsibility)
})

test('buildWindOpsArchitecturePayload 暴露全部层字段', () => {
  const p = buildWindOpsArchitecturePayload('3号机变桨24V低压，想复位，近30分钟SCADA电压跳变')
  for (const key of ['layers', 'intent', 'case', 'memory_router', 'model_route', 'evidence_priority', 'planner', 'safety_gate', 'feedback_loop', 'trace']) {
    assert.ok(key in p, 'missing ' + key)
  }
  assert.equal(p.case.turbineId, 'WTG-003')
  assert.equal(p.case.system, '变桨系统')
  assert.equal(p.safety_gate.decision, 'advice_only_human_confirm_required')
  assert.equal(p.memory_router.workPhase, 'safety')
  assert.equal(p.intent, 'diagnosis')
  assert.equal(p.evidence_priority.length, 5)
})

test('runWindOpsAgent 反馈闭环填充工单草稿字段', () => {
  const r = runWindOpsAgent('WTG-7 齿轮箱油温高，昨天SCADA趋势升高', {}, '结论X。下一步只做一件事。请反馈：油温读数')
  assert.equal(r.feedback_loop.workOrderDraftFields.turbineId, 'WTG-007')
  assert.equal(r.feedback_loop.workOrderDraftFields.system, '齿轮箱系统')
  assert.ok(r.feedback_loop.workOrderDraftFields.pendingFeedback.includes('油温读数'))
})

test('runWindOpsAgent trace 进入审核池且带模型任务', () => {
  const r = runWindOpsAgent('变桨24V低压，SCADA趋势电压跳变，停机')
  assert.equal(r.trace.governance, 'pending_review_pool')
  assert.equal(r.trace.modelTask, 'diagnosis')
  assert.ok(Array.isArray(r.trace.planSteps) && r.trace.planSteps.length === 6)
})

test('buildWindOpsArchitectureContext 串起 Case/记忆/模型/Planner/SafetyGate', () => {
  const ctx = buildWindOpsArchitectureContext('3号机变桨24V低压，想复位，近30分钟SCADA电压跳变')
  assert.match(ctx, /结构化 Case/)
  assert.match(ctx, /Memory Router/)
  assert.match(ctx, /模型路由/)
  assert.match(ctx, /Planner/)
  assert.match(ctx, /Safety Gate/)
  assert.match(ctx, /证据分级/)
})

test('payload 决定论：相同输入产生相同输出', () => {
  const q = '8号机安全链断开，能不能短接试运行'
  assert.deepEqual(buildWindOpsArchitecturePayload(q), buildWindOpsArchitecturePayload(q))
})

test('非领域输入仍返回结构（intent=chitchat）', () => {
  const p = buildWindOpsArchitecturePayload('你好')
  assert.equal(p.intent, 'chitchat')
  assert.equal(p.case.system, '待识别')
})
