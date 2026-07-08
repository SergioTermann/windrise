// ⑥ 模型层 —— 时序异常检测规则引擎
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectAnomalies } from '../index.mjs'

test('样本不足返回提示', () => {
  const r = detectAnomalies([1])
  assert.match(r.summary, /样本不足/)
  assert.deepEqual(r.anomalies, [])
})

test('持续升高识别为 rising_trend', () => {
  const r = detectAnomalies([20, 21, 22, 24, 27, 31])
  assert.ok(r.anomalies.some(a => a.type === 'rising_trend'))
})

test('持续下降识别为 falling_trend', () => {
  const r = detectAnomalies([31, 27, 24, 22, 21, 20])
  assert.ok(r.anomalies.some(a => a.type === 'falling_trend'))
})

test('尖峰识别为 spike', () => {
  const r = detectAnomalies([20, 20, 21, 20, 45, 20, 21], { spikeSigma: 2 })
  assert.ok(r.anomalies.some(a => a.type === 'spike'))
})

test('越上限识别为 threshold_high', () => {
  const r = detectAnomalies([20, 90, 20], { high: 80 })
  const hit = r.anomalies.find(a => a.type === 'threshold_high')
  assert.ok(hit)
  assert.equal(hit.value, 90)
  assert.equal(hit.limit, 80)
})

test('越下限识别为 threshold_low', () => {
  const r = detectAnomalies([20, 2, 20], { low: 5 })
  assert.ok(r.anomalies.some(a => a.type === 'threshold_low'))
})

test('卡死（方差为零）识别为 flatline', () => {
  const r = detectAnomalies([5, 5, 5, 5])
  assert.ok(r.anomalies.some(a => a.type === 'flatline'))
})

test('平稳序列无显著异常', () => {
  const r = detectAnomalies([20, 20.1, 19.9, 20, 20.05, 19.95])
  assert.equal(r.anomalies.length, 0)
  assert.match(r.summary, /未检出/)
})

test('stats 摘要包含均值/标准差/范围', () => {
  const r = detectAnomalies([10, 20, 30])
  assert.equal(r.stats.mean, 20)
  assert.equal(r.stats.min, 10)
  assert.equal(r.stats.max, 30)
})
