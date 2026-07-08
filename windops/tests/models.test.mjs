// ⑥ 模型层 —— 任务路由 + 证据分级
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  routeWindOpsModel,
  MODEL_ROUTES,
  gradeEvidence,
  EVIDENCE_TIERS,
  evidencePriorityLabels,
  buildWindOpsCase,
} from '../index.mjs'

test('routeWindOpsModel FAQ / 多模态 / 复盘 分流', () => {
  assert.equal(routeWindOpsModel('303804是什么故障').task, 'faq')
  assert.equal(routeWindOpsModel('叶片裂纹照片').task, 'multimodal')
  assert.equal(routeWindOpsModel('工单关闭复盘抽检').task, 'review')
})

test('routeWindOpsModel 单信号时序走时序模型', () => {
  const r = routeWindOpsModel('变桨电压曲线波动', { operatingSignals: ['电压/电流'] })
  assert.equal(r.task, 'timeseries')
})

test('routeWindOpsModel 多信号关联优先多步诊断', () => {
  const c = buildWindOpsCase('变桨24V低压，SCADA趋势电压跳变，停机')
  assert.ok(c.operatingSignals.length >= 2)
  assert.equal(routeWindOpsModel('变桨24V低压，SCADA趋势电压跳变，停机', c).task, 'diagnosis')
})

test('routeWindOpsModel 兜底为多步诊断', () => {
  assert.equal(routeWindOpsModel('变桨系统排查', {}).task, 'diagnosis')
})

test('MODEL_ROUTES 每条含 label/model/reason', () => {
  for (const r of MODEL_ROUTES) {
    assert.ok(r.task && r.label && r.model && r.reason, r.task)
  }
})

test('gradeEvidence 官方手册权重最高、未验证最低', () => {
  const graded = gradeEvidence([
    { source: 'unverified', score: 0.95, text: '师傅经验' },
    { source: 'manual', score: 0.6, text: '手册' },
    { source: 'closed_work_order', score: 0.7, text: '历史工单' },
  ])
  assert.equal(graded[0].source, 'manual')
  assert.ok(graded[0].gradedScore >= graded[1].gradedScore)
  assert.ok(graded.every(g => typeof g.tier === 'string'))
})

test('gradeEvidence 同分时官方来源优先（tie-break）', () => {
  // manual weight 1.0 * 0.5 = 0.5 ; sop weight 0.85 * (0.5/0.85≈0.588) = 0.5 → 同分
  const graded = gradeEvidence([
    { source: 'sop', score: 0.588 },
    { source: 'manual', score: 0.5 },
  ])
  assert.equal(graded[0].source, 'manual')
})

test('gradeEvidence 未知来源退化为未验证层', () => {
  const graded = gradeEvidence([{ source: 'mystery', score: 1 }])
  assert.equal(graded[0].tier, '未验证经验')
})

test('gradeEvidence 缺 score 时按 0.5 计算，不改动入参', () => {
  const input = [{ source: 'manual' }]
  const graded = gradeEvidence(input)
  assert.equal(graded[0].gradedScore, 0.5)
  assert.equal(input[0].gradedScore, undefined)
})

test('evidencePriorityLabels 五级顺序', () => {
  assert.deepEqual(evidencePriorityLabels(), EVIDENCE_TIERS.map(t => t.label))
  assert.equal(evidencePriorityLabels().length, 5)
  assert.equal(evidencePriorityLabels()[0], '厂家手册/故障码表')
})
