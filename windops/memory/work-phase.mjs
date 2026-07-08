// ③ 记忆层 · 作业阶段判定
// 安全作业 / 故障诊断 / 复盘 三个阶段决定 Memory Router 的 Token 预算裁剪策略。
// 对应技术细节第 8 页“Token 超预算时优先保留/可裁剪”表。

import { containsHighRiskAction } from '../domain.mjs'

export const WORK_PHASE_BUDGET = {
  safety: {
    phase: '安全作业阶段',
    keep: ['安全票/作业票', '风速与作业窗口', '停机/锁定作业状态', 'SOP 强约束与安全红线'],
    trim: ['历史相似案例摘要'],
  },
  diagnosis: {
    phase: '故障诊断阶段',
    keep: ['当前故障窗口', '机型/控制器版本', '故障码手册条目'],
    trim: ['低相似度历史工单'],
  },
  review: {
    phase: '复盘阶段',
    keep: ['完整诊断轨迹', '专家修正', '停机时长', '备件更换结果'],
    trim: ['实时曲线原始点位（仅保留特征）'],
  },
}

export function detectWindOpsWorkPhase(query, caseInfo = {}) {
  const text = String(query || '')
  if (containsHighRiskAction(text) || caseInfo?.missing?.includes('安全前置条件')) return 'safety'
  if (/复盘|总结|关闭工单|工单验收|验收|根因|闭环|处置结果|回顾|事后/i.test(text)) return 'review'
  return 'diagnosis'
}
