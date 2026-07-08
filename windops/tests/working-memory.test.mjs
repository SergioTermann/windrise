// ③ 记忆层 —— 工作记忆 TTL + 置信度时间衰减
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkingMemory, decayConfidence } from '../index.mjs'

test('decayConfidence 一个半衰期减半', () => {
  const half = 1000
  assert.equal(decayConfidence(1, 0, { halfLifeMs: half }), 1)
  assert.equal(decayConfidence(1, half, { halfLifeMs: half }), 0.5)
  assert.equal(decayConfidence(1, 2 * half, { halfLifeMs: half }), 0.25)
})

test('decayConfidence 尊重下限 floor', () => {
  assert.equal(decayConfidence(1, 1e9, { halfLifeMs: 1000, floor: 0.1 }), 0.1)
})

test('工作记忆到期自动失效（TTL）', () => {
  let t = 0
  const wm = createWorkingMemory({ now: () => t })
  wm.set('临时限功率', { level: '80%' }, { ttlMs: 100 })
  assert.deepEqual(wm.get('临时限功率'), { level: '80%' })
  t = 99
  assert.ok(wm.has('临时限功率'))
  t = 100
  assert.equal(wm.get('临时限功率'), undefined) // 到期失效
  assert.equal(wm.has('临时限功率'), false)
})

test('getWithConfidence 随时间衰减', () => {
  let t = 0
  const wm = createWorkingMemory({ now: () => t })
  wm.set('复位结果', '成功', { ttlMs: 10000, confidence: 1 })
  t = 500
  const r = wm.getWithConfidence('复位结果', { halfLifeMs: 500 })
  assert.equal(r.value, '成功')
  assert.equal(r.confidence, 0.5)
  assert.equal(r.ageMs, 500)
})

test('prune 清理过期项并返回被清 key', () => {
  let t = 0
  const wm = createWorkingMemory({ now: () => t })
  wm.set('a', 1, { ttlMs: 10 })
  wm.set('b', 2, { ttlMs: 100 })
  t = 50
  assert.deepEqual(wm.prune(), ['a'])
  assert.deepEqual(wm.activeKeys(), ['b'])
})
