// ③ 记忆层 —— 作业阶段 + 四层 Memory Router
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectWindOpsWorkPhase,
  buildWindOpsMemoryRouter,
  buildWindOpsCase,
  WORK_PHASE_BUDGET,
} from '../index.mjs'

test('detectWindOpsWorkPhase 三阶段判定', () => {
  assert.equal(detectWindOpsWorkPhase('3号机变桨低压想复位', buildWindOpsCase('3号机变桨低压想复位')), 'safety')
  assert.equal(detectWindOpsWorkPhase('齿轮箱油温高趋势'), 'diagnosis')
  assert.equal(detectWindOpsWorkPhase('这次故障复盘，工单验收根因确认'), 'review')
})

test('detectWindOpsWorkPhase 安全前置缺失也判为 safety', () => {
  const c = buildWindOpsCase('3号机变桨想复位')
  assert.ok(c.missing.includes('安全前置条件'))
  assert.equal(detectWindOpsWorkPhase('random', c), 'safety')
})

test('buildWindOpsMemoryRouter 输出 L4→L1 四层', () => {
  const r = buildWindOpsMemoryRouter(buildWindOpsCase('齿轮箱油温高'), '齿轮箱油温高')
  assert.equal(r.layers.length, 4)
  assert.deepEqual(r.layers.map(l => l.id), ['L4', 'L3', 'L2', 'L1'])
  for (const l of r.layers) {
    assert.ok(l.name && l.tier && l.content && l.writePolicy, JSON.stringify(l))
  }
})

test('buildWindOpsMemoryRouter routerKey 含故障类型+风机+作业阶段', () => {
  const c = buildWindOpsCase('3号机变桨24V低压想复位')
  const r = buildWindOpsMemoryRouter(c, '3号机变桨24V低压想复位')
  assert.match(r.routerKey, /故障类型=变桨系统/)
  assert.match(r.routerKey, /风机=WTG-003/)
  assert.match(r.routerKey, /作业阶段=安全作业阶段/)
})

test('buildWindOpsMemoryRouter Token 预算随阶段变化', () => {
  const safety = buildWindOpsMemoryRouter(buildWindOpsCase('3号机变桨想复位'), '3号机变桨想复位')
  assert.equal(safety.workPhase, 'safety')
  assert.ok(safety.tokenBudgetPolicy.keep.includes('SOP 强约束与安全红线'))
  assert.ok(safety.tokenBudgetPolicy.trim.includes('历史相似案例摘要'))

  const review = buildWindOpsMemoryRouter(buildWindOpsCase('齿轮箱复盘工单验收'), '齿轮箱复盘工单验收')
  assert.equal(review.workPhase, 'review')
  assert.ok(review.tokenBudgetPolicy.keep.includes('完整诊断轨迹'))

  const diag = buildWindOpsMemoryRouter(buildWindOpsCase('齿轮箱油温高'), '齿轮箱油温高')
  assert.equal(diag.workPhase, 'diagnosis')
  assert.ok(diag.tokenBudgetPolicy.keep.includes('故障码手册条目'))
})

test('buildWindOpsMemoryRouter 无 caseInfo 时自建 Case', () => {
  const r = buildWindOpsMemoryRouter({}, '偏航卡死')
  assert.match(r.routerKey, /偏航系统/)
})

test('WORK_PHASE_BUDGET 三阶段齐全', () => {
  assert.deepEqual(Object.keys(WORK_PHASE_BUDGET).sort(), ['diagnosis', 'review', 'safety'])
  for (const key of Object.keys(WORK_PHASE_BUDGET)) {
    assert.ok(WORK_PHASE_BUDGET[key].keep.length > 0)
    assert.ok(WORK_PHASE_BUDGET[key].trim.length > 0)
  }
})

test('buildWindOpsMemoryRouter 返回副本，修改不污染源', () => {
  const r = buildWindOpsMemoryRouter(buildWindOpsCase('齿轮箱油温高'), '齿轮箱油温高')
  r.tokenBudgetPolicy.keep.push('污染项')
  const r2 = buildWindOpsMemoryRouter(buildWindOpsCase('齿轮箱油温高'), '齿轮箱油温高')
  assert.ok(!r2.tokenBudgetPolicy.keep.includes('污染项'))
})
