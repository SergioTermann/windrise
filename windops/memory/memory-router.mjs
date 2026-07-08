// ③ 记忆层 · 四层运维记忆融合 + Memory Router
// L4 资产长期画像 / L3 场站上下文 / L2 当前故障工作记忆 / L1 调用轨迹。
// Memory Router 按“故障类型 + 风机 + 作业阶段”拼接最小必要上下文。
// 对应技术细节第 8 页“四层运维记忆融合架构”。

import { buildWindOpsCase } from '../data/case-builder.mjs'
import { WORK_PHASE_BUDGET, detectWindOpsWorkPhase } from './work-phase.mjs'

const MEMORY_LAYERS = [
  {
    id: 'L4',
    name: '资产长期画像',
    tier: '永久层',
    content: '风机台账、改造记录、历史缺陷、高风险部件、厂家版本差异',
    writePolicy: '仅工单验收/专家确认后更新，禁止 Agent 直写台账',
  },
  {
    id: 'L3',
    name: '场站/项目上下文',
    tier: '场景层',
    content: '风场地形、季节风况、班组能力、常用备件、场站 SOP 与安全红线',
    writePolicy: '按场站运营节奏批量维护',
  },
  {
    id: 'L2',
    name: '当前故障工作记忆',
    tier: '短期层',
    content: '告警窗口、实时曲线、当前作业票、控制建议审批状态、班组交接备注',
    writePolicy: '秒级更新，临时限电/旁路/天气影响设 TTL 到期失效',
  },
  {
    id: 'L1',
    name: 'Agent 调用轨迹',
    tier: '数据飞轮层',
    content: '诊断 plan、工具调用、观察结果、专家改判、工单闭环标签',
    writePolicy: '进入复盘/质检池，治理后再进入训练集',
  },
]

export function buildWindOpsMemoryRouter(caseInfo = {}, query = '', context = {}) {
  const faultCase = caseInfo && caseInfo.turbineId ? caseInfo : buildWindOpsCase(query, context)
  const phase = detectWindOpsWorkPhase(query, faultCase)
  const budget = WORK_PHASE_BUDGET[phase]
  const routerKey = [
    `故障类型=${faultCase.system}/${faultCase.component}`,
    `风机=${faultCase.turbineId}`,
    `作业阶段=${budget.phase}`,
  ].join(' + ')
  return {
    routerKey,
    workPhase: phase,
    workPhaseLabel: budget.phase,
    layers: MEMORY_LAYERS.map(layer => ({ ...layer })),
    tokenBudgetPolicy: {
      keep: [...budget.keep],
      trim: [...budget.trim],
    },
  }
}
