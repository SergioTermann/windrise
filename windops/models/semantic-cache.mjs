// ⑥ 模型层 · LLM Wiki L1 语义缓存
// 高频故障解释/标准处置卡/已验证 FAQ 命中后毫秒级返回，避免重复走多路召回。
// 对应技术细节第 15/16 页“L1 语义缓存”。

const DEFAULT_MAX = 200
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 // 24 小时

// 缓存键：按故障签名归一（系统/部件/故障码），与具体口语无关。
export function buildCacheKey(caseInfo = {}) {
  return [
    caseInfo.system || '待识别',
    caseInfo.component || '待识别',
    caseInfo.faultCode || '待补充',
  ].join('|')
}

export function createSemanticCache({ max = DEFAULT_MAX, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const store = new Map() // key → { answer, expiresAt }
  let hits = 0
  let misses = 0

  function get(caseInfo) {
    const key = buildCacheKey(caseInfo)
    const entry = store.get(key)
    if (!entry || now() >= entry.expiresAt) {
      if (entry) store.delete(key)
      misses += 1
      return null
    }
    // LRU：命中后移到队尾。
    store.delete(key)
    store.set(key, entry)
    hits += 1
    return { key, answer: entry.answer, cached: true }
  }

  function set(caseInfo, answer) {
    const key = buildCacheKey(caseInfo)
    // 未识别的故障签名不入缓存，避免污染。
    if (key === '待识别|待识别|待补充') return false
    store.set(key, { answer, expiresAt: now() + ttlMs })
    while (store.size > max) {
      const oldest = store.keys().next().value
      store.delete(oldest)
    }
    return true
  }

  function stats() {
    const total = hits + misses
    return { size: store.size, hits, misses, hitRate: total ? round(hits / total) : 0 }
  }

  return { get, set, stats, clear: () => store.clear() }
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
