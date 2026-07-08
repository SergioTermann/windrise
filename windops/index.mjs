// Windrise 风电运维七层架构 —— 对外统一入口。
// 目录即分层：business/ data/ memory/ core/ tools/ models/ feedback/。
// 对应《智导助手 agent 技术细节》七层技术路线。

// 领域词典与共享判定
export {
  WIND_DOMAIN_PATTERN,
  SYSTEM_RULES,
  HIGH_RISK_ACTIONS,
  isWindOpsDomainQuery,
  containsHighRiskAction,
  matchedHighRiskActions,
  hasSymptomSignal,
  slugify,
} from './domain.mjs'

// ① 业务层
export { buildWindOpsSystemInstruction } from './business/system-instruction.mjs'
export { routeWindOpsIntent, WIND_OPS_INTENTS } from './business/intent-router.mjs'

// ② 数据层
export {
  extractTurbineId,
  extractFaultCode,
  extractTimeWindow,
  extractOperatingSignals,
  extractSafetySignals,
} from './data/fault-query-rewriter.mjs'
export { buildWindOpsCase } from './data/case-builder.mjs'
export { normalizeTerms, TERM_SYNONYMS, VENDOR_TERMS } from './data/term-map.mjs'

// ③ 记忆层
export { detectWindOpsWorkPhase, WORK_PHASE_BUDGET } from './memory/work-phase.mjs'
export { buildWindOpsMemoryRouter } from './memory/memory-router.mjs'
export { createWindriseMem0Memory } from './memory/mem0-adapter.mjs'
export { createWorkingMemory, decayConfidence } from './memory/working-memory.mjs'

// ④ 模型应用层
export { buildWindOpsPlanner, EVIDENCE_PRIORITY } from './core/planner.mjs'
export { buildWindOpsSafetyGate } from './core/safety-gate.mjs'
export {
  WIND_OPS_ARCHITECTURE_LAYERS,
  runWindOpsAgent,
  buildWindOpsArchitecturePayload,
  buildWindOpsArchitectureContext,
} from './core/orchestrator.mjs'

// ⑤ 工具层
export {
  WIND_OPS_TOOL_REGISTRY,
  TOOL_RISK,
  getToolSpec,
  listToolsByRisk,
  validateToolCall,
} from './tools/tool-registry.mjs'
export {
  runTool,
  withEnterpriseRetry,
  safetyRequired,
  applyFallbackStrategy,
  ToolTimeoutError,
} from './tools/executor.mjs'

// ⑥ 模型层
export { routeWindOpsModel, MODEL_ROUTES } from './models/model-router.mjs'
export { gradeEvidence, EVIDENCE_TIERS, evidencePriorityLabels } from './models/evidence-grader.mjs'
export { createSemanticCache, buildCacheKey } from './models/semantic-cache.mjs'

// ⑦ 反馈层
export { buildWindOpsFeedbackLoop, extractFeedbackItems } from './feedback/feedback-loop.mjs'
export { buildWindOpsTrace } from './feedback/trace-logger.mjs'
export { createReviewPool } from './feedback/review-pool.mjs'
