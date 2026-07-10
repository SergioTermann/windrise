// ⑥ 模型层 —— 多模态巡检识图（缺陷标签归一 + 分级证据进入诊断链）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeInspection } from '../index.mjs'

test('analyzeInspection 识别裂纹/烧蚀为高危并置 needsExpertReview', () => {
  const r = analyzeInspection({ findings: [{ label: '叶片有裂纹', confidence: 0.9 }, { label: '柜内烧蚀' }] })
  assert.equal(r.defects.length, 2)
  assert.equal(r.highestSeverity, 'high')
  assert.equal(r.needsExpertReview, true)
  assert.ok(r.defects.every(d => d.severity === 'high'))
})

test('analyzeInspection 按严重度排序，高危在前', () => {
  const r = analyzeInspection({ findings: ['端子松动', '叶片裂纹', '锈蚀'] })
  assert.equal(r.defects[0].defect, '叶片裂纹') // high
  assert.equal(r.defects[r.defects.length - 1].defect, '锈蚀/腐蚀') // low
})

test('analyzeInspection 评分 = 严重度 × 置信度', () => {
  const r = analyzeInspection({ findings: [{ label: '渗油', confidence: 0.5 }] })
  // medium(0.6) × 0.5 = 0.3
  assert.equal(r.defects[0].score, 0.3)
})

test('analyzeInspection 产出 via=multimodal 的诊断证据链候选', () => {
  const r = analyzeInspection({ component: '齿轮箱', findings: ['渗油'] })
  assert.equal(r.evidence.length, 1)
  assert.ok(r.evidence[0].via.includes('multimodal'))
  assert.match(r.evidence[0].text, /巡检识图/)
  assert.equal(r.evidence[0].source, 'expert')
})

test('analyzeInspection component 覆盖默认部件', () => {
  const r = analyzeInspection({ component: '主控柜', findings: ['端子松动'] })
  assert.equal(r.defects[0].component, '主控柜')
})

test('analyzeInspection 未知标签进入 unresolved，不误判', () => {
  const r = analyzeInspection({ findings: ['一切正常', '叶片裂纹'] })
  assert.deepEqual(r.unresolved, ['一切正常'])
  assert.equal(r.defects.length, 1)
})

test('analyzeInspection 接受字符串数组与空输入', () => {
  assert.equal(analyzeInspection(['叶片裂纹']).defects.length, 1)
  const empty = analyzeInspection({})
  assert.equal(empty.defects.length, 0)
  assert.equal(empty.highestSeverity, 'none')
  assert.match(empty.summary, /未识别/)
})
