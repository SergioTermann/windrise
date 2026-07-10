// ⑥ 模型层 · 多模态巡检识图（图像证据进入诊断链）
// 巡检图片/视频的缺陷标签（叶片裂纹、渗油、柜内烧蚀、端子松动、锈蚀等）
// 归一为结构化缺陷 + 分级证据，进入与手册/SOP 同一条诊断证据链。
// 这里对“已识别的缺陷标签”做确定性归一与分级；真实图像推理由多模态模型产出标签后接入。
// 对应技术细节第 18 页“巡检图片/视频 → 多模态模型；图像证据进入诊断链”。

// 缺陷标签字典：label 命中正则 → 规范缺陷、默认部件、严重度、建议动作、证据来源分级。
const DEFECT_RULES = [
  {
    defect: '叶片裂纹',
    match: /裂纹|裂缝|crack|开裂/i,
    component: '叶片',
    severity: 'high',
    action: '限功率或停机复核，安排叶片专项检查与无损检测',
    source: 'expert',
  },
  {
    defect: '渗油/漏油',
    match: /渗油|漏油|油迹|oil\s*leak/i,
    component: '齿轮箱',
    severity: 'medium',
    action: '定位渗漏点，检查油位与密封，跟踪油温油压趋势',
    source: 'expert',
  },
  {
    defect: '柜内烧蚀',
    match: /烧蚀|烧焦|过热变色|电弧|burn|scorch/i,
    component: '主控',
    severity: 'high',
    action: '断电隔离后检查回路与器件，禁止带电复位',
    source: 'manual',
  },
  {
    defect: '端子松动',
    match: /端子松动|接线松动|松脱|loose\s*terminal/i,
    component: '变桨系统',
    severity: 'medium',
    action: '断电后紧固端子并复测接触电阻',
    source: 'sop',
  },
  {
    defect: '锈蚀/腐蚀',
    match: /锈蚀|腐蚀|生锈|corros|rust/i,
    component: '塔筒/结构件',
    severity: 'low',
    action: '记录锈蚀范围，评估防腐处理与复检周期',
    source: 'expert',
  },
]

const SEVERITY_SCORE = { high: 0.9, medium: 0.6, low: 0.35 }
const SEVERITY_RANK = { high: 3, medium: 2, low: 1 }

// input: { component?, findings: [{ label, confidence?, location? }] } 或直接 string[]
export function analyzeInspection(input = {}) {
  const findings = normalizeFindings(input)
  const defects = []
  const unresolved = []
  for (const finding of findings) {
    const rule = DEFECT_RULES.find(r => r.match.test(finding.label))
    if (!rule) {
      unresolved.push(finding.label)
      continue
    }
    const confidence = clamp01(finding.confidence ?? 0.7)
    defects.push({
      defect: rule.defect,
      component: input.component || rule.component,
      severity: rule.severity,
      confidence: round(confidence),
      location: finding.location || '',
      recommendedAction: rule.action,
      source: rule.source,
      // 图像证据进入诊断链的评分：严重度 × 识别置信度。
      score: round(SEVERITY_SCORE[rule.severity] * confidence),
    })
  }
  // 按严重度、其次置信度排序。
  defects.sort((a, b) => (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) || (b.confidence - a.confidence))
  const highest = defects[0]?.severity || 'none'
  return {
    defects,
    unresolved,
    highestSeverity: highest,
    // 高危缺陷需人工复核并进入安全门，不直接给控制类结论。
    needsExpertReview: defects.some(d => d.severity === 'high'),
    // 转成诊断证据链候选（via=multimodal），可与 gradeEvidence 统一分级。
    evidence: defects.map(d => ({
      id: `inspection:${d.defect}`,
      source: d.source,
      text: `巡检识图：${d.component}${d.defect}${d.location ? `（${d.location}）` : ''}，建议${d.recommendedAction}`,
      score: d.score,
      via: ['multimodal'],
    })),
    summary: defects.length
      ? `识别 ${defects.length} 项缺陷，最高严重度 ${highest}${unresolved.length ? `；${unresolved.length} 项标签未归类` : ''}`
      : '未识别到已知缺陷标签',
  }
}

function normalizeFindings(input) {
  const raw = Array.isArray(input) ? input : Array.isArray(input.findings) ? input.findings : []
  return raw
    .map(item => (typeof item === 'string' ? { label: item } : item))
    .filter(item => item && String(item.label || '').trim())
}

function clamp01(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.7
  return Math.max(0, Math.min(1, n))
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
