// ⑤ 工具层 · Executor（@enterprise_retry / @safety_required 实执行 + 柔性降级）
// 对应技术细节第 14/17 页“工具高可用与柔性降级”“权限边界”。
// 连接器可插拔：真实环境注入 CMS/SCADA/EAM 客户端，测试注入 mock。

import { TOOL_RISK, getToolSpec, validateToolCall } from './tool-registry.mjs'

class ToolTimeoutError extends Error {
  constructor(ms) {
    super(`工具超时（${ms}ms）`)
    this.name = 'ToolTimeoutError'
  }
}

function withTimeout(promise, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return promise
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ToolTimeoutError(ms)), ms)
    Promise.resolve(promise).then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

// @enterprise_retry：超时 + 重试 + 到底后走 fallback 策略。
export async function withEnterpriseRetry(fn, { timeoutMs = 2000, retries = 2, backoffMs = 0, fallback } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const value = await withTimeout(Promise.resolve().then(() => fn(attempt)), timeoutMs)
      return { ok: true, value, attempts: attempt + 1, degraded: false }
    } catch (error) {
      lastError = error
      if (attempt < retries && backoffMs > 0) await delay(backoffMs)
    }
  }
  return {
    ok: false,
    error: lastError?.message || String(lastError),
    attempts: retries + 1,
    degraded: true,
    fallback: typeof fallback === 'function' ? await fallback(lastError) : fallback ?? null,
  }
}

// @safety_required：高风险动作前置校验，缺任一项即阻断。
export function safetyRequired(checks = [], satisfied = {}) {
  const missing = checks.filter(check => !satisfied[check])
  return {
    allowed: missing.length === 0,
    missing,
    decision: missing.length === 0 ? 'checks_satisfied' : 'blocked_missing_checks',
  }
}

// 柔性降级策略：数据源不可用时给出保守、可标注的返回。
export function applyFallbackStrategy(strategy, { snapshot, spec } = {}) {
  switch (strategy) {
    case 'use_last_valid_snapshot':
      return snapshot
        ? { source: 'snapshot', stale: true, dataTime: snapshot.dataTime, data: snapshot.data, note: '实时源不可用，使用最近快照并标注数据时间' }
        : { source: 'none', stale: true, data: null, note: '实时源不可用且无可用快照，请人工核实' }
    case 'degrade_to_manual_reference':
      return { source: 'manual_reference', data: null, note: '知识源超时，降级为人工查阅厂家手册/SOP' }
    case 'mark_unknown_stock':
      return { source: 'unknown', data: null, note: '备件库不可用，库存标注为未知，需现场确认' }
    case 'return_local_draft':
      return { source: 'local_draft', data: null, note: '业务系统不可用，返回本地草稿，待恢复后回填' }
    case 'advice_only':
      return { source: 'advice_only', data: null, note: '高风险动作仅建议，不直连执行' }
    default:
      return { source: 'none', data: null, note: `未知降级策略：${strategy}` }
  }
}

// 运行一次结构化工具调用：校验 → 按风险等级执行/降级/仅建议。
export async function runTool(toolCall, { connectors = {}, snapshots = {}, safetyContext = {} } = {}) {
  const validation = validateToolCall(toolCall)
  if (!validation.ok) return { ok: false, reason: validation.reason }
  const spec = validation.spec

  // 高风险：绝不直连执行，只返回建议 + 安全校验结果。
  if (spec.risk === TOOL_RISK.HIGH_RISK) {
    const gate = safetyRequired(spec.safetyChecks || [], safetyContext)
    return {
      ok: true,
      mode: 'advice_only',
      executed: false,
      safety: gate,
      result: applyFallbackStrategy('advice_only', { spec }),
      note: validation.note,
    }
  }

  const connector = connectors[spec.name]
  // 无连接器（未接入真实系统）→ 直接走该工具声明的降级策略。
  if (typeof connector !== 'function') {
    return {
      ok: true,
      mode: validation.mode,
      executed: false,
      degraded: true,
      result: applyFallbackStrategy(spec.fallback, { snapshot: snapshots[spec.name], spec }),
    }
  }

  const outcome = await withEnterpriseRetry(() => connector(toolCall.arguments || {}), {
    timeoutMs: spec.timeoutMs,
    retries: spec.retries,
    fallback: () => applyFallbackStrategy(spec.fallback, { snapshot: snapshots[spec.name], spec }),
  })
  return {
    ok: true,
    mode: validation.mode,
    executed: outcome.ok,
    degraded: outcome.degraded,
    attempts: outcome.attempts,
    result: outcome.ok ? outcome.value : outcome.fallback,
    error: outcome.ok ? undefined : outcome.error,
  }
}

export { ToolTimeoutError }
