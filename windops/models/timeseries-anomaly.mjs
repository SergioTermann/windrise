// ⑥ 模型层 · 时序异常检测（规则引擎）
// 数值趋势不应完全交给 LLM，用规则引擎识别爬升/尖峰/越限/变化率/卡死。
// 对应技术细节第 18 页“时序异常识别 → 专用时序模型/规则引擎”。

// series: number[] 或 [{ v }]；返回命中的异常规则与摘要。
export function detectAnomalies(series = [], options = {}) {
  const values = series.map(p => (typeof p === 'number' ? p : Number(p?.v))).filter(Number.isFinite)
  const anomalies = []
  if (values.length < 2) {
    return { anomalies, summary: '样本不足，无法判定趋势', stats: baseStats(values) }
  }
  const stats = baseStats(values)
  const {
    high = null,
    low = null,
    spikeSigma = 3,
    slopeThreshold = stats.range ? stats.range / values.length * 0.5 : 0,
    // 变化率阈值取“若干倍标准差 / 信号量级 / 绝对下限”的较大者，
    // 避免平直信号上的正常噪声被误判为突变。
    rocThreshold = Math.max((stats.std || 0) * 4, Math.abs(stats.mean) * 0.2, 1),
    flatlineEps = 1e-9,
  } = options

  // 越限
  if (high != null) values.forEach((v, i) => { if (v > high) anomalies.push({ type: 'threshold_high', index: i, value: v, limit: high }) })
  if (low != null) values.forEach((v, i) => { if (v < low) anomalies.push({ type: 'threshold_low', index: i, value: v, limit: low }) })

  // 尖峰（偏离均值 spikeSigma 个标准差）
  if (stats.std > 0) {
    values.forEach((v, i) => {
      if (Math.abs(v - stats.mean) > spikeSigma * stats.std) anomalies.push({ type: 'spike', index: i, value: v, z: round((v - stats.mean) / stats.std) })
    })
  }

  // 趋势（线性回归斜率）
  const slope = linearSlope(values)
  if (Math.abs(slope) >= slopeThreshold && slopeThreshold > 0) {
    anomalies.push({ type: slope > 0 ? 'rising_trend' : 'falling_trend', slope: round(slope) })
  }

  // 变化率（相邻突变）
  for (let i = 1; i < values.length; i++) {
    const delta = Math.abs(values[i] - values[i - 1])
    if (delta > rocThreshold) anomalies.push({ type: 'rate_of_change', index: i, delta: round(delta) })
  }

  // 卡死（方差近零，疑似传感器冻结）
  if (stats.std <= flatlineEps) anomalies.push({ type: 'flatline', value: values[0] })

  return {
    anomalies,
    summary: anomalies.length ? summarize(anomalies) : '未检出显著异常',
    stats,
  }
}

function baseStats(values) {
  if (!values.length) return { count: 0, mean: 0, std: 0, min: 0, max: 0, range: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  const min = Math.min(...values)
  const max = Math.max(...values)
  return { count: values.length, mean: round(mean), std: round(Math.sqrt(variance)), min, max, range: round(max - min) }
}

function linearSlope(values) {
  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean)
    den += (i - xMean) ** 2
  }
  return den === 0 ? 0 : num / den
}

function summarize(anomalies) {
  const types = [...new Set(anomalies.map(a => a.type))]
  return `检出异常：${types.join('、')}（共 ${anomalies.length} 处）`
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
