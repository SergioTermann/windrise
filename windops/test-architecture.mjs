#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  buildWindOpsArchitecturePayload,
  detectWindOpsWorkPhase,
  isWindOpsDomainQuery,
  validateToolCall,
  routeWindOpsModel,
  gradeEvidence,
  routeWindOpsIntent,
  buildWindOpsCase,
} from './index.mjs'

function assertCase(query, expected) {
  const payload = buildWindOpsArchitecturePayload(query)
  assert.equal(payload.case.turbineId, expected.turbineId, query)
  assert.equal(payload.case.system, expected.system, query)
  assert.equal(payload.safety_gate.decision, expected.safety, query)
  assert.equal(
    payload.planner.steps.find(step => step.id === 'safety_gate')?.status,
    expected.safetyGateStatus,
    query,
  )
  assert.equal(payload.layers.length, 7, query)
  return payload
}

async function postJson(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  assert.equal(response.status, 200, `${body.message}: ${text}`)
  return data
}

async function runArchitectureAssertions() {
  assert.equal(isWindOpsDomainQuery('你好'), false)
  assert.equal(isWindOpsDomainQuery('3号机变桨24V低压'), true)

  const pitch = assertCase('3号机变桨24V低压，想复位，近30分钟SCADA电压跳变', {
    turbineId: 'WTG-003',
    system: '变桨系统',
    safety: 'advice_only_human_confirm_required',
    safetyGateStatus: 'blocking',
  })
  assert.ok(pitch.case.missing.includes('安全前置条件'))
  assert.ok(pitch.case.operatingSignals.includes('电压/电流'))

  // Slide 8: 四层运维记忆融合 + Memory Router 按作业阶段裁剪 Token
  assert.equal(pitch.memory_router.layers.length, 4)
  assert.deepEqual(
    pitch.memory_router.layers.map(layer => layer.id),
    ['L4', 'L3', 'L2', 'L1'],
  )
  assert.equal(pitch.memory_router.workPhase, 'safety')
  assert.equal(pitch.memory_router.workPhaseLabel, '安全作业阶段')
  assert.ok(pitch.memory_router.tokenBudgetPolicy.keep.includes('SOP 强约束与安全红线'))
  assert.match(pitch.memory_router.routerKey, /WTG-003/)

  assert.equal(detectWindOpsWorkPhase('WTG-12 齿轮箱油温高，昨天SCADA趋势持续升高'), 'diagnosis')
  assert.equal(detectWindOpsWorkPhase('这次齿轮箱故障复盘一下，工单验收后要更新画像'), 'review')
  assert.equal(detectWindOpsWorkPhase('3号机想远程复位'), 'safety')

  const review = buildWindOpsArchitecturePayload('WTG-12 齿轮箱油温高故障复盘，工单验收根因确认')
  assert.equal(review.memory_router.workPhase, 'review')
  assert.ok(review.memory_router.tokenBudgetPolicy.keep.includes('完整诊断轨迹'))

  // ⑤ 工具层：高风险工具只给建议、必填参数校验
  const highRisk = validateToolCall({
    name: 'build_remote_reset_suggestion',
    arguments: { turbine_id: 'WTG-003', fault_code: '24V' },
  })
  assert.equal(highRisk.ok, true)
  assert.equal(highRisk.mode, 'advice_only')
  assert.ok(highRisk.requiredSafetyChecks.includes('work_ticket'))
  const missingArgs = validateToolCall({ name: 'get_operating_timeseries', arguments: { turbine_id: 'WTG-003' } })
  assert.equal(missingArgs.ok, false)
  assert.equal(validateToolCall({ name: 'unknown_tool' }).ok, false)

  // ⑥ 模型层：任务路由 + 证据分级
  assert.equal(routeWindOpsModel('303804 是什么故障').task, 'faq')
  assert.equal(routeWindOpsModel('叶片有裂纹，发张巡检图').task, 'multimodal')
  const pitchCase = buildWindOpsCase('3号机变桨24V低压，近30分钟SCADA电压跳变')
  assert.equal(routeWindOpsModel('3号机变桨24V低压，近30分钟SCADA电压跳变', pitchCase).task, 'diagnosis')
  const graded = gradeEvidence([
    { source: 'unverified', score: 0.9, text: '师傅经验' },
    { source: 'manual', score: 0.6, text: '手册条目' },
  ])
  assert.equal(graded[0].source, 'manual')

  // ① 业务层：意图路由
  assert.equal(routeWindOpsIntent('你好').intent, 'chitchat')
  assert.equal(routeWindOpsIntent('变桨24V低压是什么故障', buildWindOpsCase('变桨24V低压是什么故障')).intent, 'knowledge')
  assert.equal(routeWindOpsIntent('3号机变桨24V低压，想远程复位', pitchCase).intent, 'diagnosis')

  assertCase('WTG-12 齿轮箱油温高，昨天SCADA趋势持续升高', {
    turbineId: 'WTG-012',
    system: '齿轮箱系统',
    safety: 'read_only_diagnosis_allowed',
    safetyGateStatus: 'ready',
  })

  assertCase('8号机安全链断开，能不能短接试运行', {
    turbineId: 'WTG-008',
    system: '安全链系统',
    safety: 'advice_only_human_confirm_required',
    safetyGateStatus: 'blocking',
  })

  assertCase('风机通信掉线，Profibus节点丢失，近2小时反复报警', {
    turbineId: '待补充',
    system: '通信系统',
    safety: 'read_only_diagnosis_allowed',
    safetyGateStatus: 'ready',
  })
}

async function runApiAssertions(baseUrl) {
  const health = await fetch(`${baseUrl}/health`).then(response => response.json())
  assert.equal(health.ok, true)

  const normal = await postJson(baseUrl, {
    conversation_id: 'windops-test-normal',
    message: '你好',
  })
  assert.equal(normal.answer, '你好，有什么我可以帮你的吗？')
  assert.equal(normal.windops_architecture, null)

  const risk = await postJson(baseUrl, {
    conversation_id: 'windops-test-risk',
    message: '8号机安全链断开，能不能短接试运行',
  })
  assert.match(risk.answer, /不能短接安全链/)
  assert.equal(risk.windops_architecture.case.turbineId, 'WTG-008')
  assert.equal(risk.windops_architecture.case.system, '安全链系统')
  assert.equal(risk.windops_architecture.safety_gate.decision, 'advice_only_human_confirm_required')

  const diagnosis = await postJson(baseUrl, {
    conversation_id: 'windops-test-diagnosis',
    message: '3号机变桨24V低压，想复位，近30分钟SCADA电压跳变',
  })
  assert.match(diagnosis.answer, /变桨 24V 控制电源或开关反馈丢失/)
  assert.doesNotMatch(diagnosis.answer, /先按传感器测量回路异常处理/)
  assert.equal(diagnosis.windops_architecture.case.system, '变桨系统')
  assert.equal(diagnosis.windops_architecture.safety_gate.decision, 'advice_only_human_confirm_required')

  const first = await postJson(baseUrl, {
    conversation_id: 'windops-test-memory',
    message: '12号风场，WTG-7 齿轮箱油温高，昨天SCADA趋势持续升高',
  })
  assert.equal(first.windops_architecture.case.windFarmId, '12')
  assert.equal(first.windops_architecture.case.turbineId, 'WTG-007')
  assert.equal(first.windops_architecture.case.system, '齿轮箱系统')

  const followUp = await postJson(baseUrl, {
    conversation_id: 'windops-test-memory',
    message: '下一步怎么做',
  })
  assert.equal(followUp.windops_architecture.case.windFarmId, '12')
  assert.equal(followUp.windops_architecture.case.turbineId, 'WTG-007')
  assert.equal(followUp.windops_architecture.case.system, '齿轮箱系统')
  assert.equal(followUp.windops_architecture.feedback_loop.workOrderDraftFields.turbineId, 'WTG-007')
  assert.match(followUp.answer, /齿轮箱|油冷|水冷|滤芯/)
}

await runArchitectureAssertions()
if (process.env.WINDRISE_TEST_API_URL) {
  await runApiAssertions(process.env.WINDRISE_TEST_API_URL.replace(/\/$/, ''))
}

console.log('windops architecture tests passed')
