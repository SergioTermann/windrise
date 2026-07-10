// ③ 记忆层 —— 冷启动（台账 Onboarding / Look-alike 机群迁移 / 专家规则兜底）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  onboardTurbineProfile,
  findLookAlikeFleet,
  expertRuleFallback,
  buildWindOpsCase,
} from '../index.mjs'

test('onboardTurbineProfile 台账齐全时 ready', () => {
  const p = onboardTurbineProfile({
    turbineId: 'WTG-003',
    model: '机型X',
    vendor: '明阳',
    controllerVersion: 'v2.3',
    bom: ['变桨柜', '主控'],
  })
  assert.equal(p.status, 'ready')
  assert.equal(p.missing.length, 0)
  assert.ok(p.confidence > 0.8)
})

test('onboardTurbineProfile 缺项时 provisional 且列出缺口', () => {
  const p = onboardTurbineProfile({ turbineId: 'WTG-009' })
  assert.equal(p.status, 'provisional')
  assert.ok(p.missing.includes('机型'))
  assert.ok(p.missing.includes('部件BOM'))
})

test('findLookAlikeFleet 同机型/批次/地形优先且排除自身', () => {
  const target = { turbineId: 'WTG-003', model: '机型X', partBatch: 'B1', terrain: '山地', serviceYears: 5 }
  const fleet = [
    { turbineId: 'WTG-003', model: '机型X' },
    { turbineId: 'WTG-004', model: '机型X', partBatch: 'B1', terrain: '山地', serviceYears: 6 },
    { turbineId: 'WTG-010', model: '机型Y', terrain: '平原', serviceYears: 2 },
  ]
  const res = findLookAlikeFleet(target, fleet)
  assert.ok(!res.some(r => r.turbineId === 'WTG-003'))
  assert.equal(res[0].turbineId, 'WTG-004')
  assert.ok(res[0].reasons.includes('同机型'))
  assert.ok(res[0].similarity > (res[1]?.similarity ?? 0))
})

test('expertRuleFallback 无证据/高风险时不下确定结论', () => {
  const c = buildWindOpsCase('新机型变桨想复位')
  const fb = expertRuleFallback(c, { evidenceCount: 0, highRisk: true })
  assert.equal(fb.engaged, true)
  assert.equal(fb.conclusion, 'inconclusive')
  assert.ok(fb.investigationPath.length > 0)
  assert.ok(fb.evidenceGaps.includes('缺少手册/SOP/工单证据命中'))
})

test('expertRuleFallback 证据充足且置信度高时不介入', () => {
  const c = buildWindOpsCase('3号机变桨24V低压 303804 近30分钟电压波动 停机')
  const fb = expertRuleFallback(c, { evidenceCount: 3, highRisk: false })
  assert.equal(fb.engaged, false)
  assert.equal(fb.conclusion, 'evidence_backed')
})
