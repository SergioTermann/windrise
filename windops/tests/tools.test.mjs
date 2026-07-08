// ⑤ 工具层 —— ToolRegistry 权限/参数/降级
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  WIND_OPS_TOOL_REGISTRY,
  TOOL_RISK,
  getToolSpec,
  listToolsByRisk,
  validateToolCall,
} from '../index.mjs'

test('注册表每个工具声明必要字段', () => {
  assert.ok(WIND_OPS_TOOL_REGISTRY.length >= 8)
  for (const t of WIND_OPS_TOOL_REGISTRY) {
    assert.ok(t.name && t.system, t.name)
    assert.ok(Object.values(TOOL_RISK).includes(t.risk), t.name)
    assert.ok(Array.isArray(t.requiredArgs), t.name)
    assert.ok(Number.isFinite(t.timeoutMs) && t.timeoutMs > 0, t.name)
    assert.ok(typeof t.fallback === 'string', t.name)
  }
})

test('高风险工具默认禁止直连执行且带安全校验', () => {
  for (const t of listToolsByRisk(TOOL_RISK.HIGH_RISK)) {
    assert.equal(t.directExecution, false, t.name)
    assert.ok(Array.isArray(t.safetyChecks) && t.safetyChecks.length > 0, t.name)
  }
})

test('validateToolCall 只读工具参数齐全放行', () => {
  const r = validateToolCall({
    name: 'get_operating_timeseries',
    arguments: { turbine_id: 'WTG-003', points: ['pitch_24v_voltage'], window: 'last_30m' },
  })
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'read')
})

test('validateToolCall 缺必填参数拒绝并列出缺项', () => {
  const r = validateToolCall({ name: 'get_operating_timeseries', arguments: { turbine_id: 'WTG-003' } })
  assert.equal(r.ok, false)
  assert.match(r.reason, /缺少必填参数/)
  assert.match(r.reason, /points/)
  assert.match(r.reason, /window/)
})

test('validateToolCall 未注册工具拒绝', () => {
  const r = validateToolCall({ name: 'drop_database' })
  assert.equal(r.ok, false)
  assert.match(r.reason, /未注册工具/)
})

test('validateToolCall 建议类工具返回 draft', () => {
  const r = validateToolCall({
    name: 'create_work_order_draft',
    arguments: { turbine_id: 'WTG-003', system: '变桨系统', fault_code: 'T_1234' },
  })
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'draft')
})

test('validateToolCall 高风险工具只给建议且带安全校验清单', () => {
  const r = validateToolCall({
    name: 'build_remote_reset_suggestion',
    arguments: { turbine_id: 'WTG-003', fault_code: '24V' },
  })
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'advice_only')
  assert.deepEqual(r.requiredSafetyChecks, ['work_ticket', 'wind_speed', 'stop_state', 'permission'])
  assert.match(r.note, /二次确认/)
})

test('getToolSpec 命中与未命中', () => {
  assert.equal(getToolSpec('retrieve_sop').system, 'LLMWiki')
  assert.equal(getToolSpec('nope'), null)
})
