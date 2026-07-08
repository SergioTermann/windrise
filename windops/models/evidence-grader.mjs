// ⑥ 模型层 · 证据分级（LLM Wiki L3 Rerank + 证据分级）
// 官方手册 > 场站 SOP > 专家知识 > 已关闭工单 > 未验证经验。
// 对应技术细节第 15/16 页“证据优先级与可审计输出”。

export const EVIDENCE_TIERS = [
  { source: 'manual', label: '厂家手册/故障码表', weight: 1.0, usage: '作为诊断与操作步骤主证据' },
  { source: 'sop', label: '场站SOP/安全规程', weight: 0.85, usage: '作为作业约束和安全提醒' },
  { source: 'expert', label: '专家知识/规则', weight: 0.7, usage: '作为判断参考' },
  { source: 'closed_work_order', label: '已关闭历史工单', weight: 0.5, usage: '作为经验参考，必须标注“历史案例”' },
  { source: 'unverified', label: '未验证经验', weight: 0.25, usage: '仅提示，不作为结论依据' },
]

const TIER_INDEX = new Map(EVIDENCE_TIERS.map((tier, index) => [tier.source, index]))

// 对候选证据按分级重排：同分时官方手册优先。
export function gradeEvidence(candidates = []) {
  return [...candidates]
    .map(item => {
      const tier = EVIDENCE_TIERS.find(t => t.source === item.source) || EVIDENCE_TIERS[EVIDENCE_TIERS.length - 1]
      const score = (item.score ?? 0.5) * tier.weight
      return { ...item, tier: tier.label, tierWeight: tier.weight, gradedScore: Math.round(score * 1000) / 1000 }
    })
    .sort((a, b) => {
      if (b.gradedScore !== a.gradedScore) return b.gradedScore - a.gradedScore
      return (TIER_INDEX.get(a.source) ?? 99) - (TIER_INDEX.get(b.source) ?? 99)
    })
}

export function evidencePriorityLabels() {
  return EVIDENCE_TIERS.map(tier => tier.label)
}
