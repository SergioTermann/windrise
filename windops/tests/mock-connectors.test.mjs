// ⑤ 工具层 —— 模拟连接器 + Executor 端到端
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMockConnectors, runTool } from '../index.mjs'

test('get_operating_timeseries 返回结构化数列且确定性', async () => {
  const conn = createMockConnectors()
  const args = { turbine_id: 'WTG-003', points: ['pitch_24v_voltage', 'charger_state'], window: 'last_30m' }
  const a = await conn.get_operating_timeseries(args)
  const b = await conn.get_operating_timeseries(args)
  assert.deepEqual(Object.keys(a.points), ['pitch_24v_voltage', 'charger_state'])
  assert.equal(a.points.pitch_24v_voltage.length, 12)
  assert.deepEqual(a, b) // 确定性：同入参同输出
})

test('Executor 挂载模拟连接器可端到端执行只读工具', async () => {
  const conn = createMockConnectors()
  const r = await runTool(
    { name: 'get_operating_timeseries', arguments: { turbine_id: 'WTG-003', points: ['pitch_24v_voltage'], window: 'last_30m' } },
    { connectors: conn },
  )
  assert.equal(r.executed, true)
  assert.equal(r.degraded, false)
  assert.equal(r.result.source, 'mock_cms')
})

test('retrieve_sop / search_work_orders / check_spare_parts 结构正确', async () => {
  const conn = createMockConnectors()
  const sop = await conn.retrieve_sop({ system: '变桨系统', component: '24V电源' })
  assert.ok(Array.isArray(sop.steps) && sop.steps.length > 0)
  const wo = await conn.search_work_orders({ turbine_id: 'WTG-003', system: '变桨系统' })
  assert.ok(wo.orders.length >= 1)
  const spare = await conn.check_spare_parts({ component: '24V电源模块' })
  assert.equal(typeof spare.available, 'boolean')
})

test('自定义点位量程生效', async () => {
  const conn = createMockConnectors({ points: { oil_temp: [60, 90] } })
  const r = await conn.get_operating_timeseries({ turbine_id: 'WTG-012', points: ['oil_temp'], window: 'last_1h' })
  for (const v of r.points.oil_temp) {
    assert.ok(v >= 60 && v <= 90, `${v} 越界`)
  }
})
