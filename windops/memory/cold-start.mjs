// ③ 记忆层 · 冷启动（新风场 / 新机型 / 新故障）
// ① 台账 Onboarding：最小可用画像来自 CMDB/EAM，而非靠聊天慢慢积累。
// ② Look-alike 机群迁移：按机型/部件批次/地形风况/运行年限匹配相似风机群借鉴经验。
// ③ 专家规则兜底：高风险/新型故障不自动下确定结论，输出“排查路径 + 证据缺口”。
// 对应技术细节第 10 页“3.3 冷启动”。

// 从台账（CMDB/EAM）装配最小可用风机画像，无历史也能启动。
export function onboardTurbineProfile(ledger = {}) {
  const model = ledger.model || '待补充'
  const missing = []
  if (!ledger.turbineId) missing.push('风机ID')
  if (!ledger.model) missing.push('机型')
  if (!ledger.bom || !ledger.bom.length) missing.push('部件BOM')
  if (!ledger.controllerVersion) missing.push('控制器版本')
  return {
    source: 'ledger_onboarding',
    turbineId: ledger.turbineId || '待补充',
    model,
    vendor: ledger.vendor || '待补充',
    controllerVersion: ledger.controllerVersion || '待补充',
    commissionedAt: ledger.commissionedAt || '',
    warrantyBoundary: ledger.warrantyBoundary || '',
    bom: Array.isArray(ledger.bom) ? ledger.bom : [],
    highRiskParts: Array.isArray(ledger.highRiskParts) ? ledger.highRiskParts : [],
    // 冷启动画像标注为 provisional，须随工单闭环逐步固化。
    status: missing.length ? 'provisional' : 'ready',
    missing,
    confidence: round(0.4 + 0.15 * (4 - Math.min(4, missing.length))),
  }
}

// Look-alike 机群迁移：按机型/部件批次/地形风况/运行年限匹配相似风机。
export function findLookAlikeFleet(target = {}, fleet = [], { topK = 5 } = {}) {
  return fleet
    .filter(t => t.turbineId !== target.turbineId)
    .map(t => {
      let score = 0
      const reasons = []
      if (t.model && t.model === target.model) { score += 0.4; reasons.push('同机型') }
      if (t.partBatch && t.partBatch === target.partBatch) { score += 0.25; reasons.push('同部件批次') }
      if (t.terrain && t.terrain === target.terrain) { score += 0.15; reasons.push('同地形风况') }
      if (Number.isFinite(t.serviceYears) && Number.isFinite(target.serviceYears)) {
        const near = 1 - Math.min(1, Math.abs(t.serviceYears - target.serviceYears) / 10)
        score += 0.2 * near
        if (near > 0.7) reasons.push('运行年限相近')
      }
      return { turbineId: t.turbineId, similarity: round(score), reasons }
    })
    .filter(t => t.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}

// 专家规则兜底：证据不足或高风险时，只给排查路径与证据缺口，不给确定结论。
export function expertRuleFallback(caseInfo = {}, { evidenceCount = 0, highRisk = false } = {}) {
  const gaps = [...(caseInfo.missing || [])]
  if (evidenceCount === 0) gaps.push('缺少手册/SOP/工单证据命中')
  const engage = highRisk || evidenceCount === 0 || (caseInfo.confidence ?? 0) < 0.5
  return {
    engaged: engage,
    conclusion: engage ? 'inconclusive' : 'evidence_backed',
    // 新型/高风险故障：优先厂家手册、SOP 和专家审核路径。
    investigationPath: engage
      ? [
          '按厂家手册与场站 SOP 核对故障码适用条件',
          '拉取相关点位实时/快照趋势确认现象',
          '匹配 Look-alike 机群历史处置经验',
          '缺口补齐前仅输出排查清单与证据缺口，转专家审核',
        ]
      : [],
    evidenceGaps: [...new Set(gaps)],
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
