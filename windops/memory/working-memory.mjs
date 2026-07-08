// ③ 记忆层 · L2 工作记忆（TTL 过期 + 置信度时间衰减）
// 临时限电/复位/短期天气影响到期自动失效，不永久污染长期画像。
// 对应技术细节第 7 页“TTL 规则”与第 9 页“置信度 + 时间衰减”。

const DEFAULT_TTL_MS = 1000 * 60 * 30 // 30 分钟
const DEFAULT_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 7 // 7 天

// 指数时间衰减：每过一个半衰期，置信度减半，下限可设。
export function decayConfidence(baseConfidence, ageMs, { halfLifeMs = DEFAULT_HALF_LIFE_MS, floor = 0 } = {}) {
  const base = Number.isFinite(baseConfidence) ? baseConfidence : 0
  if (ageMs <= 0) return round(base)
  const decayed = base * Math.pow(0.5, ageMs / halfLifeMs)
  return round(Math.max(floor, decayed))
}

export function createWorkingMemory({ now = () => Date.now(), defaultTtlMs = DEFAULT_TTL_MS } = {}) {
  const store = new Map()

  function set(key, value, { ttlMs = defaultTtlMs, confidence = 1 } = {}) {
    const t = now()
    store.set(key, { value, confidence, createdAt: t, expiresAt: t + ttlMs })
    return key
  }

  function getEntry(key) {
    const entry = store.get(key)
    if (!entry) return null
    if (now() >= entry.expiresAt) {
      store.delete(key)
      return null
    }
    return entry
  }

  function get(key) {
    return getEntry(key)?.value
  }

  // 取值并返回随时间衰减后的置信度。
  function getWithConfidence(key, decayOptions = {}) {
    const entry = getEntry(key)
    if (!entry) return null
    return {
      value: entry.value,
      confidence: decayConfidence(entry.confidence, now() - entry.createdAt, decayOptions),
      ageMs: now() - entry.createdAt,
    }
  }

  // 清理所有过期项，返回被清理的 key 列表。
  function prune() {
    const t = now()
    const removed = []
    for (const [key, entry] of store) {
      if (t >= entry.expiresAt) {
        store.delete(key)
        removed.push(key)
      }
    }
    return removed
  }

  function activeKeys() {
    prune()
    return [...store.keys()]
  }

  return { set, get, getWithConfidence, prune, activeKeys, has: key => getEntry(key) != null }
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
