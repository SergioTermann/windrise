// ③ 记忆层 —— 画像动态更新（旁路抽取 / 实时短期缓存 / 工单闭环批处理落长期画像）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createProfileUpdater,
  extractFromEvent,
  scoreProfileConfidence,
  createWorkingMemory,
} from '../index.mjs'

test('extractFromEvent 实时/批处理分流', () => {
  assert.equal(extractFromEvent({ type: 'alarm' }).lane, 'realtime')
  assert.equal(extractFromEvent({ type: 'reset' }).lane, 'realtime')
  assert.equal(extractFromEvent({ type: 'work_order', workOrderClosed: true }).lane, 'batch')
})

test('extractFromEvent 未验收时 verified=false（只是候选结论）', () => {
  assert.equal(extractFromEvent({ type: 'work_order' }).verified, false)
  assert.equal(extractFromEvent({ type: 'work_order', expertConfirmed: true }).verified, true)
})

test('scoreProfileConfidence 专家确认+备件更换抬升，复发削弱', () => {
  const high = scoreProfileConfidence({ expertConfirmed: true, partsReplaced: true, verified: true })
  const low = scoreProfileConfidence({ expertConfirmed: true, recurred: true })
  assert.ok(high > 0.7)
  assert.ok(low < high)
})

test('createProfileUpdater 实时事件只落短期缓存，不入批处理队列', () => {
  const shortTerm = createWorkingMemory()
  const updater = createProfileUpdater({ shortTerm })
  const r = updater.ingest({ type: 'alarm', turbineId: 'WTG-003', faultCode: '303804' })
  assert.equal(r.applied, 'realtime')
  assert.equal(updater.pendingCount(), 0)
  assert.ok(shortTerm.has('WTG-003:alarm'))
})

test('createProfileUpdater 工单未验收不落长期画像；验收后 flush 落库', () => {
  const longTerm = new Map()
  const updater = createProfileUpdater({ longTerm })
  updater.ingest({ type: 'work_order', turbineId: 'WTG-003', faultCode: '303804', cause: '电源模块老化' })
  let res = updater.flushBatch()
  assert.equal(res.applied.length, 0)
  assert.equal(res.heldBack, 1) // 未验收保留

  updater.ingest({
    type: 'work_order',
    turbineId: 'WTG-003',
    faultCode: '303804',
    cause: '电源模块老化',
    workOrderClosed: true,
    expertConfirmed: true,
    partsReplaced: true,
  })
  res = updater.flushBatch()
  assert.ok(res.applied.includes('WTG-003:303804'))
  const profile = updater.longTermProfile().get('WTG-003:303804')
  assert.ok(profile.confidence > 0.8)
  assert.equal(profile.occurrences, 1)
})

test('createProfileUpdater 不提供资产台账同步直写通道', () => {
  const updater = createProfileUpdater({})
  assert.equal(typeof updater.ingest, 'function')
  assert.equal(updater.writeLedger, undefined)
  assert.equal(updater.syncAssetLedger, undefined)
})
