// ⑤ 工具层 · ToolRegistry
// 所有工具声明权限、超时、降级策略；高风险控制类默认禁用直连执行。
// 对应技术细节第 13/14/17 页“结构化 Tool Calling + 权限边界 + 柔性降级”。

export const TOOL_RISK = {
  READ_ONLY: 'read_only', // 只读诊断
  SUGGESTION: 'suggestion', // 生成草稿，需人工确认
  HIGH_RISK: 'high_risk', // 控制类，助手只给建议，不直连执行
}

// 工具注册表：每个工具声明风险等级、所需权限、超时与降级策略。
export const WIND_OPS_TOOL_REGISTRY = [
  {
    name: 'get_operating_timeseries',
    risk: TOOL_RISK.READ_ONLY,
    system: 'CMS/SCADA',
    requiredArgs: ['turbine_id', 'points', 'window'],
    timeoutMs: 2000,
    retries: 3,
    fallback: 'use_last_valid_snapshot',
    permissions: [],
  },
  {
    name: 'query_active_alarms',
    risk: TOOL_RISK.READ_ONLY,
    system: '告警平台',
    requiredArgs: ['turbine_id', 'window'],
    timeoutMs: 2000,
    retries: 2,
    fallback: 'use_last_valid_snapshot',
    permissions: [],
  },
  {
    name: 'retrieve_sop',
    risk: TOOL_RISK.READ_ONLY,
    system: 'LLMWiki',
    requiredArgs: ['system', 'component'],
    timeoutMs: 3000,
    retries: 2,
    fallback: 'degrade_to_manual_reference',
    permissions: [],
  },
  {
    name: 'search_work_orders',
    risk: TOOL_RISK.READ_ONLY,
    system: 'EAM/CMMS',
    requiredArgs: ['turbine_id', 'system'],
    timeoutMs: 3000,
    retries: 2,
    fallback: 'degrade_to_manual_reference',
    permissions: [],
  },
  {
    name: 'check_spare_parts',
    risk: TOOL_RISK.READ_ONLY,
    system: '备件库',
    requiredArgs: ['component'],
    timeoutMs: 2000,
    retries: 2,
    fallback: 'mark_unknown_stock',
    permissions: [],
  },
  {
    name: 'create_work_order_draft',
    risk: TOOL_RISK.SUGGESTION,
    system: 'EAM/CMMS',
    requiredArgs: ['turbine_id', 'system', 'fault_code'],
    timeoutMs: 3000,
    retries: 1,
    fallback: 'return_local_draft',
    permissions: ['work_order_write'],
  },
  {
    name: 'build_spare_parts_list',
    risk: TOOL_RISK.SUGGESTION,
    system: '备件库',
    requiredArgs: ['component'],
    timeoutMs: 2000,
    retries: 1,
    fallback: 'return_local_draft',
    permissions: [],
  },
  {
    name: 'build_remote_reset_suggestion',
    risk: TOOL_RISK.HIGH_RISK,
    system: '主控',
    requiredArgs: ['turbine_id', 'fault_code'],
    timeoutMs: 3000,
    retries: 0,
    fallback: 'advice_only',
    // 高风险动作要求的硬前置校验。
    safetyChecks: ['work_ticket', 'wind_speed', 'stop_state', 'permission'],
    permissions: ['control_suggestion'],
    directExecution: false,
  },
  {
    name: 'build_parameter_change_suggestion',
    risk: TOOL_RISK.HIGH_RISK,
    system: '主控',
    requiredArgs: ['turbine_id', 'parameter'],
    timeoutMs: 3000,
    retries: 0,
    fallback: 'advice_only',
    safetyChecks: ['approval', 'backup', 'rollback_plan', 'permission'],
    permissions: ['control_suggestion'],
    directExecution: false,
  },
]

export function getToolSpec(name) {
  return WIND_OPS_TOOL_REGISTRY.find(tool => tool.name === name) || null
}

export function listToolsByRisk(risk) {
  return WIND_OPS_TOOL_REGISTRY.filter(tool => tool.risk === risk)
}

// 结构化 Tool Call 校验：必填参数齐全、高风险工具禁止直连执行。
export function validateToolCall({ name, arguments: args = {} } = {}) {
  const spec = getToolSpec(name)
  if (!spec) return { ok: false, reason: `未注册工具：${name}` }
  const missing = spec.requiredArgs.filter(key => args[key] === undefined || args[key] === '' || args[key] === null)
  if (missing.length) return { ok: false, reason: `缺少必填参数：${missing.join('、')}`, spec }
  if (spec.risk === TOOL_RISK.HIGH_RISK) {
    return {
      ok: true,
      spec,
      mode: 'advice_only',
      note: '高风险动作仅生成建议与校验项，执行须走原控制系统权限、电子票与二次确认。',
      requiredSafetyChecks: spec.safetyChecks || [],
    }
  }
  return { ok: true, spec, mode: spec.risk === TOOL_RISK.SUGGESTION ? 'draft' : 'read' }
}
