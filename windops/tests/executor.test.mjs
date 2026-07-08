// ⑤ 工具层 —— Executor 真跑重试/超时/降级/安全门
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  withEnterpriseRetry,
  safetyRequired,
  applyFallbackStrategy,
  runTool,
} from '../index.mjs'

test('withEnterpriseRetry 首次成功不重试', async () => {
  let calls = 0
  const r = await withEnterpriseRetry(() => { calls++; return 'ok' }, { retries: 3 })
  assert.equal(r.ok, true)
  assert.equal(r.value, 'ok')
  assert.equal(r.attempts, 1)
  assert.equal(calls, 1)
})

test('withEnterpriseRetry 第 N 次成功', async () => {
  let calls = 0
  const r = await withEnterpriseRetry(
    () => { calls++; if (calls < 3) throw new Error('fail'); return 'late' },
    { retries: 3 },
  )
  assert.equal(r.ok, true)
  assert.equal(r.value, 'late')
  assert.equal(r.attempts, 3)
})

test('withEnterpriseRetry 全部失败后走 fallback 并标记 degraded', async () => {
  const r = await withEnterpriseRetry(() => { throw new Error('boom') }, {
    retries: 2,
    fallback: () => ({ snapshot: true }),
  })
  assert.equal(r.ok, false)
  assert.equal(r.degraded, true)
  assert.equal(r.attempts, 3)
  assert.deepEqual(r.fallback, { snapshot: true })
})

test('withEnterpriseRetry 超时被判失败并降级', async () => {
  const r = await withEnterpriseRetry(() => new Promise(() => {}), {
    timeoutMs: 20,
    retries: 1,
    fallback: 'degraded',
  })
  assert.equal(r.ok, false)
  assert.equal(r.degraded, true)
  assert.equal(r.fallback, 'degraded')
})

test('safetyRequired 缺项即阻断', () => {
  assert.deepEqual(
    safetyRequired(['work_ticket', 'wind_speed'], { work_ticket: true }),
    { allowed: false, missing: ['wind_speed'], decision: 'blocked_missing_checks' },
  )
  assert.equal(safetyRequired(['work_ticket'], { work_ticket: true }).allowed, true)
})

test('applyFallbackStrategy 快照降级标注数据时间与陈旧', () => {
  const r = applyFallbackStrategy('use_last_valid_snapshot', { snapshot: { dataTime: '10:35', data: { v: 1 } } })
  assert.equal(r.stale, true)
  assert.equal(r.dataTime, '10:35')
  assert.match(r.note, /最近快照/)
})

test('runTool 只读工具有连接器则执行', async () => {
  const r = await runTool(
    { name: 'get_operating_timeseries', arguments: { turbine_id: 'WTG-003', points: ['v'], window: 'last_30m' } },
    { connectors: { get_operating_timeseries: async () => ({ series: [1, 2, 3] }) } },
  )
  assert.equal(r.ok, true)
  assert.equal(r.executed, true)
  assert.deepEqual(r.result, { series: [1, 2, 3] })
})

test('runTool 无连接器时按声明降级（快照）', async () => {
  const r = await runTool(
    { name: 'get_operating_timeseries', arguments: { turbine_id: 'WTG-003', points: ['v'], window: 'last_30m' } },
    { snapshots: { get_operating_timeseries: { dataTime: '10:35', data: { v: 1 } } } },
  )
  assert.equal(r.executed, false)
  assert.equal(r.degraded, true)
  assert.equal(r.result.stale, true)
})

test('runTool 连接器失败则重试后降级', async () => {
  let calls = 0
  const r = await runTool(
    { name: 'check_spare_parts', arguments: { component: '24V电源模块' } },
    { connectors: { check_spare_parts: async () => { calls++; throw new Error('down') } } },
  )
  assert.equal(r.executed, false)
  assert.equal(r.degraded, true)
  assert.equal(calls, 3) // retries=2 → 3 attempts
  assert.match(r.result.note, /库存标注为未知/)
})

test('runTool 高风险工具绝不执行，只给建议+安全门', async () => {
  const r = await runTool(
    { name: 'build_remote_reset_suggestion', arguments: { turbine_id: 'WTG-003', fault_code: '24V' } },
    {
      connectors: { build_remote_reset_suggestion: async () => { throw new Error('should never run') } },
      safetyContext: { work_ticket: true, wind_speed: true },
    },
  )
  assert.equal(r.mode, 'advice_only')
  assert.equal(r.executed, false)
  assert.equal(r.safety.allowed, false) // 还缺 stop_state / permission
  assert.deepEqual(r.safety.missing, ['stop_state', 'permission'])
})

test('runTool 参数缺失被拒', async () => {
  const r = await runTool({ name: 'get_operating_timeseries', arguments: { turbine_id: 'WTG-003' } })
  assert.equal(r.ok, false)
  assert.match(r.reason, /缺少必填参数/)
})
