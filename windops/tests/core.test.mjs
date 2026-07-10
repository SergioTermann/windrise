// ④ 模型应用层 —— Planner + Safety Gate
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWindOpsPlanner,
  buildWindOpsSafetyGate,
  buildWindOpsCase,
  EVIDENCE_PRIORITY,
} from '../index.mjs'

test('buildWindOpsPlanner 生成六步覆盖各层', () => {
  const plan = buildWindOpsPlanner(buildWindOpsCase('3号机变桨24V低压'), '3号机变桨24V低压')
  assert.equal(plan.strategy, 'plan_and_execute_with_safety_gate')
  const ids = plan.steps.map(s => s.id)
  assert.deepEqual(ids, ['normalize_case', 'load_memory', 'retrieve_evidence', 'safety_gate', 'field_action', 'feedback'])
  const layers = new Set(plan.steps.map(s => s.layer))
  for (const l of ['data', 'memory', 'tools', 'core', 'business', 'feedback']) assert.ok(layers.has(l), l)
})

test('buildWindOpsPlanner 高风险时 safety_gate 步骤 blocking', () => {
  const plan = buildWindOpsPlanner(buildWindOpsCase('3号机变桨想复位'), '3号机变桨想复位')
  assert.equal(plan.steps.find(s => s.id === 'safety_gate').status, 'blocking')
})

test('buildWindOpsPlanner 无高风险时 safety_gate ready', () => {
  const plan = buildWindOpsPlanner(buildWindOpsCase('齿轮箱油温高趋势'), '齿轮箱油温高趋势')
  assert.equal(plan.steps.find(s => s.id === 'safety_gate').status, 'ready')
})

test('buildWindOpsPlanner 缺实体时 normalize_case needs_input', () => {
  const plan = buildWindOpsPlanner(buildWindOpsCase('随便说'), '随便说')
  assert.equal(plan.steps.find(s => s.id === 'normalize_case').status, 'needs_input')
})

test('buildWindOpsPlanner load_memory 步骤带 Memory Router 摘要', () => {
  const plan = buildWindOpsPlanner(buildWindOpsCase('3号机变桨低压'), '3号机变桨低压')
  const step = plan.steps.find(s => s.id === 'load_memory')
  assert.match(step.action, /Memory Router/)
  assert.match(step.action, /L4 资产画像/)
})

test('buildWindOpsPlanner evidencePriority 与 EVIDENCE_PRIORITY 一致', () => {
  const plan = buildWindOpsPlanner(buildWindOpsCase('变桨低压'), '变桨低压')
  assert.deepEqual(plan.evidencePriority, EVIDENCE_PRIORITY)
  assert.equal(EVIDENCE_PRIORITY[0], '厂家手册/故障码表')
})

test('buildWindOpsPlanner 传入证据时 retrieve_evidence 落地引用与备件', () => {
  const evidence = {
    citations: [{ tier: '厂家手册/故障码表', snippet: '变桨24V低压：查充电器与保险' }],
    partsAndPoints: { parts: [{ name: '24V电源模块' }], points: [{ name: '变桨24V电压点位' }] },
  }
  const plan = buildWindOpsPlanner(buildWindOpsCase('变桨低压'), '变桨低压', {}, evidence)
  const step = plan.steps.find(s => s.id === 'retrieve_evidence')
  assert.match(step.action, /已检索命中 1 条证据/)
  assert.match(step.action, /24V电源模块/)
  assert.match(step.action, /变桨24V电压点位/)
  assert.equal(step.status, 'ready')
})

test('buildWindOpsPlanner 巡检高危缺陷插入 inspection_review[blocking] 步骤', () => {
  const evidence = { inspection: { defects: [{ component: '叶片', defect: '叶片裂纹', severity: 'high' }], highestSeverity: 'high', needsExpertReview: true } }
  const plan = buildWindOpsPlanner(buildWindOpsCase('叶片裂纹巡检'), '叶片裂纹巡检', {}, evidence)
  const step = plan.steps.find(s => s.id === 'inspection_review')
  assert.ok(step, '应插入巡检研判步骤')
  assert.equal(step.status, 'blocking')
  assert.match(step.action, /叶片裂纹/)
  assert.ok(!step.action.includes('叶片叶片')) // 部件/缺陷去重
})

test('buildWindOpsPlanner 无证据时保持六步且无 inspection 步骤', () => {
  const plan = buildWindOpsPlanner(buildWindOpsCase('变桨低压'), '变桨低压')
  assert.equal(plan.steps.length, 6)
  assert.ok(!plan.steps.some(s => s.id === 'inspection_review'))
})

test('buildWindOpsSafetyGate 六类高风险各自校验项', () => {
  const cases = [
    ['3号机远程复位', '远程复位/启停机', /复位权限/],
    ['短接安全链试运行', '参数调整/屏蔽保护', /禁止屏蔽安全保护/],
    ['登塔进舱开柜', '登塔/进舱/开柜', /作业票/],
    ['母线验电放电', '带电/高压/母线作业', /验电/],
    ['蓄能器泄压拆管', '液压带压作业', /泄压/],
    ['转子锁定防转', '传动链/转子作业', /机械锁定/],
  ]
  for (const [q, label, re] of cases) {
    const gate = buildWindOpsSafetyGate(q)
    assert.equal(gate.decision, 'advice_only_human_confirm_required', q)
    assert.equal(gate.canExecuteControl, false, q)
    assert.ok(gate.riskActions.includes(label), q)
    assert.ok(gate.requiredChecks.some(c => re.test(c)), q + ' checks=' + gate.requiredChecks.join('|'))
  }
})

test('buildWindOpsSafetyGate 无高风险时只读诊断放行', () => {
  const gate = buildWindOpsSafetyGate('查询齿轮箱油温趋势')
  assert.equal(gate.decision, 'read_only_diagnosis_allowed')
  assert.equal(gate.riskActions.length, 0)
  assert.equal(gate.canExecuteControl, false)
})

test('buildWindOpsSafetyGate 校验项去重', () => {
  const gate = buildWindOpsSafetyGate('远程复位并再次复位启机')
  assert.equal(new Set(gate.requiredChecks).size, gate.requiredChecks.length)
})
