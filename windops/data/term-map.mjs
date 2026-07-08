// ② 数据层 · 机型/厂家术语映射（同义词归一）
// 把现场口语、英文缩写、厂家叫法归一到规范术语，减少检索漂移。
// 对应技术细节第 6 页“④ 机型/厂家术语映射”。

// canonical → 同义写法（正则片段）
export const TERM_SYNONYMS = [
  { canonical: '变桨', patterns: [/pitch/i, /桨距/, /变浆/] },
  { canonical: '偏航', patterns: [/yaw/i] },
  { canonical: '齿轮箱', patterns: [/gear\s*box/i, /齿轮油/] },
  { canonical: '发电机', patterns: [/generator/i, /genset/i] },
  { canonical: '变流器', patterns: [/converter/i, /变频器/, /网侧|机侧变流/] },
  { canonical: '主控', patterns: [/main\s*control/i, /主控制器/, /主控柜/] },
  { canonical: '通信', patterns: [/通讯/, /\bcomm\b/i] },
  { canonical: '24V电源', patterns: [/\b24\s*v\b/i, /24\s*伏/, /二十四伏/] },
  { canonical: '控制柜低压', patterns: [/柜内?低压/, /柜.{0,2}电压低/] },
]

// 厂家术语标签（用于机型上下文对齐，不改写原文）
export const VENDOR_TERMS = [
  { vendor: '华仪', pattern: /华仪/ },
  { vendor: '明阳', pattern: /明阳/ },
  { vendor: '金风', pattern: /金风/ },
  { vendor: '远景', pattern: /远景|envision/i },
  { vendor: '运达', pattern: /运达/ },
]

// 归一化：返回命中的规范术语、厂家标签，以及用规范术语替换后的文本（供下游兜底匹配）。
export function normalizeTerms(text) {
  const raw = String(text || '')
  const mappings = []
  let canonicalText = raw
  for (const { canonical, patterns } of TERM_SYNONYMS) {
    for (const pattern of patterns) {
      if (pattern.test(raw)) {
        mappings.push({ canonical, matched: raw.match(pattern)?.[0] ?? canonical })
        // 追加规范术语，保留原文，供 SYSTEM_RULES 兜底匹配。
        if (!canonicalText.includes(canonical)) canonicalText += ` ${canonical}`
        break
      }
    }
  }
  const vendors = VENDOR_TERMS.filter(v => v.pattern.test(raw)).map(v => v.vendor)
  return {
    canonicalText,
    terms: [...new Set(mappings.map(m => m.canonical))],
    vendors,
    mappings,
  }
}
