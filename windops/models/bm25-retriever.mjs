// ⑥ 模型层 · BM25 精确/混合召回（LLM Wiki L2）
// 故障码、备件号、点位名属于精确匹配，向量相似易漏召回，用 BM25 兜住精确项。
// 中英文混合分词：ASCII 词元（故障码/点位）+ 中文一元/二元。
// 对应技术细节第 15/16 页“L2 多路召回：BM25 精确匹配”。

const K1 = 1.5
const B = 0.75

export function tokenize(text) {
  const value = String(text || '').toLowerCase()
  const tokens = []
  // 保留故障码/点位/备件号这类 ASCII 词元（含 _ . -）。
  for (const m of value.matchAll(/[a-z0-9]+(?:[._-][a-z0-9]+)*/g)) tokens.push(m[0])
  // 中文按一元 + 二元切分。
  const cjk = value.match(/[一-鿿]+/g) || []
  for (const run of cjk) {
    for (let i = 0; i < run.length; i++) {
      tokens.push(run[i])
      if (i + 1 < run.length) tokens.push(run.slice(i, i + 2))
    }
  }
  return tokens
}

// documents: [{ id, text, ...meta }]
export function createBm25Index(documents = []) {
  const docs = documents.map(doc => {
    const tokens = tokenize(doc.text)
    const tf = new Map()
    for (const tok of tokens) tf.set(tok, (tf.get(tok) || 0) + 1)
    return { ...doc, tokens, tf, length: tokens.length }
  })
  const avgdl = docs.length ? docs.reduce((sum, d) => sum + d.length, 0) / docs.length : 0
  const df = new Map()
  for (const doc of docs) {
    for (const tok of doc.tf.keys()) df.set(tok, (df.get(tok) || 0) + 1)
  }
  const N = docs.length
  const idf = new Map()
  for (const [tok, freq] of df) {
    // BM25 概率型 IDF，带 +1 平滑避免负值。
    idf.set(tok, Math.log(1 + (N - freq + 0.5) / (freq + 0.5)))
  }

  function score(queryTokens, doc) {
    let s = 0
    for (const tok of queryTokens) {
      const f = doc.tf.get(tok)
      if (!f) continue
      const termIdf = idf.get(tok) || 0
      const denom = f + K1 * (1 - B + B * (doc.length / (avgdl || 1)))
      s += termIdf * ((f * (K1 + 1)) / denom)
    }
    return s
  }

  function search(query, topK = 5) {
    const queryTokens = [...new Set(tokenize(query))]
    return docs
      .map(doc => ({ id: doc.id, score: round(score(queryTokens, doc)), doc }))
      .filter(hit => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  return { search, size: docs.length, avgdl: round(avgdl) }
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
