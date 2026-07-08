// ④ 模型应用层 · Planner 子智能体
// Plan-and-Execute：只输出结构化诊断路径，不直接执行高风险动作。
// 对应技术细节第 11~12 页“风电多步诊断必须拆”。

import { containsHighRiskAction } from '../domain.mjs'
import { buildWindOpsCase } from '../data/case-builder.mjs'
import { buildWindOpsMemoryRouter } from '../memory/memory-router.mjs'

export const EVIDENCE_PRIORITY = [
  '厂家手册/故障码表',
  '场站SOP',
  '专家规则',
  '已关闭历史工单',
  '未验证经验',
]

export function buildWindOpsPlanner(caseInfo, query = '', context = {}) {
  const faultCase = caseInfo || buildWindOpsCase(query, context)
  const memoryRouter = buildWindOpsMemoryRouter(faultCase, query, context)
  const shouldSearchKnowledge = faultCase.faultCode !== '待补充' || faultCase.system !== '待识别'
  const steps = [
    {
      id: 'normalize_case',
      layer: 'data',
      title: '标准化故障Case',
      action: `确认风机=${faultCase.turbineId}、系统=${faultCase.system}、部件=${faultCase.component}、时间窗=${faultCase.timeWindow}。`,
      tool: 'FaultQueryRewriter',
      status: faultCase.missing.length ? 'needs_input' : 'ready',
    },
    {
      id: 'load_memory',
      layer: 'memory',
      title: '加载四层运维记忆',
      action: `Memory Router 按「${memoryRouter.routerKey}」拼接最小必要上下文：L4 资产画像 · L3 场站上下文 · L2 当前故障工作记忆 · L1 调用轨迹；Token 超预算时优先保留${memoryRouter.tokenBudgetPolicy.keep.join('、')}，可裁剪${memoryRouter.tokenBudgetPolicy.trim.join('、')}。`,
      tool: 'Memory Router',
      status: 'ready',
    },
    {
      id: 'retrieve_evidence',
      layer: 'tools',
      title: '检索证据与实时/快照数据',
      action: shouldSearchKnowledge
        ? '检索故障码表、厂家手册、SOP、历史工单，并建议拉取CMS/SCADA趋势。'
        : '先补齐故障码、告警名或现场趋势，再进入证据检索。',
      tool: 'LLMWiki + CMS/SCADA/EAM',
      status: shouldSearchKnowledge ? 'ready' : 'needs_input',
    },
    {
      id: 'safety_gate',
      layer: 'core',
      title: 'Safety Gate硬校验',
      action: '校验作业票、风速、停机/锁定状态、权限、二次确认和高风险动作边界。',
      tool: 'Safety Gate',
      status: containsHighRiskAction(query) ? 'blocking' : 'ready',
    },
    {
      id: 'field_action',
      layer: 'business',
      title: '生成最小现场动作',
      action: '只输出一个下一步动作、合格标准和1到3项反馈结果。',
      tool: 'Plan-and-Execute',
      status: 'ready',
    },
    {
      id: 'feedback',
      layer: 'feedback',
      title: '工单闭环与复盘沉淀',
      action: '记录根因、措施、备件、复发情况、专家复核和停机时长，工单关闭后再更新长期画像。',
      tool: 'WorkOrderFeedbackLoop',
      status: 'pending_work_order',
    },
  ]
  return {
    strategy: 'plan_and_execute_with_safety_gate',
    evidencePriority: [...EVIDENCE_PRIORITY],
    steps,
  }
}
