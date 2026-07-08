// ④ 模型应用层 · WindOpsAgent 编排（StateGraph）
// Case → Memory → Evidence/Model → Plan → SafetyGate → Recommendation → Feedback。
// 对应技术细节第 14 页自研最小可控内核与第 19 页“整体调用链路串讲”。

import { buildWindOpsCase } from '../data/case-builder.mjs'
import { buildWindOpsMemoryRouter } from '../memory/memory-router.mjs'
import { buildWindOpsPlanner } from './planner.mjs'
import { buildWindOpsSafetyGate } from './safety-gate.mjs'
import { routeWindOpsModel } from '../models/model-router.mjs'
import { evidencePriorityLabels } from '../models/evidence-grader.mjs'
import { buildWindOpsFeedbackLoop } from '../feedback/feedback-loop.mjs'
import { buildWindOpsTrace } from '../feedback/trace-logger.mjs'
import { routeWindOpsIntent } from '../business/intent-router.mjs'

export const WIND_OPS_ARCHITECTURE_LAYERS = [
  { id: 'business', name: '业务层', responsibility: '接收告警、故障码、现场描述和工单诉求，区分聊天、知识查询、现场排查和复盘。' },
  { id: 'data', name: '数据层', responsibility: '把口语化问题改写为结构化故障Case，补齐风机、机型、部件、故障码、时间窗和运行状态。' },
  { id: 'memory', name: '记忆层', responsibility: '维护风机长期画像、场站上下文、当前故障工作记忆和Agent调用轨迹。' },
  { id: 'core', name: '模型应用层', responsibility: '由Planner拆解诊断路径，按证据、风险和缺口控制回答粒度。' },
  { id: 'tools', name: '工具层', responsibility: '只读接入CMS/SCADA、EAM/CMMS、备件、气象、告警平台和电子票。' },
  { id: 'models', name: '模型层', responsibility: '按任务路由LLM、LLMWiki、Reranker、时序异常检测和多模态识图能力。' },
  { id: 'feedback', name: '反馈层', responsibility: '把工单结果、专家复核、复发率、停机时长和备件结果沉淀回知识与记忆。' },
]

// 运行完整七层链路，返回结构化 payload。
export function runWindOpsAgent(query, context = {}, answer = '') {
  const faultCase = buildWindOpsCase(query, context)
  const intent = routeWindOpsIntent(query, faultCase)
  const memoryRouter = buildWindOpsMemoryRouter(faultCase, query, context)
  const modelRoute = routeWindOpsModel(query, faultCase)
  const planner = buildWindOpsPlanner(faultCase, query, context)
  const safetyGate = buildWindOpsSafetyGate(query, faultCase)
  const feedbackLoop = buildWindOpsFeedbackLoop(faultCase, answer)
  const trace = buildWindOpsTrace({ caseInfo: faultCase, plan: planner, safetyGate, modelRoute, answer })
  return {
    layers: WIND_OPS_ARCHITECTURE_LAYERS,
    intent: intent.intent,
    case: faultCase,
    memory_router: memoryRouter,
    model_route: modelRoute,
    evidence_priority: evidencePriorityLabels(),
    planner,
    safety_gate: safetyGate,
    feedback_loop: feedbackLoop,
    trace,
  }
}

export function buildWindOpsArchitecturePayload(query, context = {}, answer = '') {
  const result = runWindOpsAgent(query, context, answer)
  // 保持对外 payload 字段稳定，供 CLI 与 HTTP 服务消费。
  return {
    layers: result.layers,
    intent: result.intent,
    case: result.case,
    memory_router: result.memory_router,
    model_route: result.model_route,
    evidence_priority: result.evidence_priority,
    planner: result.planner,
    safety_gate: result.safety_gate,
    feedback_loop: result.feedback_loop,
    trace: result.trace,
  }
}

export function buildWindOpsArchitectureContext(query, context = {}) {
  const faultCase = buildWindOpsCase(query, context)
  const plan = buildWindOpsPlanner(faultCase, query, context)
  const safety = buildWindOpsSafetyGate(query, faultCase)
  const memoryRouter = buildWindOpsMemoryRouter(faultCase, query, context)
  const modelRoute = routeWindOpsModel(query, faultCase)
  return [
    'WindOps 七层架构上下文：',
    `- 结构化 Case：风机=${faultCase.turbineId}；风场=${faultCase.windFarmName || faultCase.windFarmId}；系统=${faultCase.system}；部件=${faultCase.component}；故障码=${faultCase.faultCode}；时间窗=${faultCase.timeWindow}；缺失=${faultCase.missing.length ? faultCase.missing.join('、') : '无明显缺口'}；置信度=${faultCase.confidence}。`,
    `- Memory Router：作业阶段=${memoryRouter.workPhaseLabel}；路由键=${memoryRouter.routerKey}；优先保留=${memoryRouter.tokenBudgetPolicy.keep.join('、')}；可裁剪=${memoryRouter.tokenBudgetPolicy.trim.join('、')}。`,
    `- 模型路由：${modelRoute.label} → ${modelRoute.model}（${modelRoute.reason}）。`,
    `- Planner：${plan.steps.map(step => `${step.title}[${step.status}]`).join(' -> ')}。`,
    `- Safety Gate：${safety.decision}；校验项=${safety.requiredChecks.join('；')}。`,
    '- 证据分级：厂家手册/故障码表 > 场站SOP > 专家规则 > 已关闭历史工单 > 未验证经验。',
    '- 反馈闭环：工单关闭后沉淀根因、措施、备件、复发率和专家复核；临时限电/临时旁路/短期天气影响设置 TTL。',
  ].join('\n')
}
