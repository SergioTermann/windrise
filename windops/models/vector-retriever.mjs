// ⑥ 模型层 · LLM Wiki L2 向量语义召回
// 症状语义匹配：现场口语和手册用词不同，BM25 精确项之外用向量兜住语义相近。
// 这里用可离线运行的确定性向量（n-gram TF-IDF + 余弦），作为真实 embedding 服务的本地替身；
// 线上可替换为句向量模型，接口保持 search(query, topK) 不变。
// 对应技术细节第 15/16 页“L2 多路召回：向量语义召回”。

import { tokenize } from './bm25-retriever.mjs'

// documents: [{ id, text, ...meta }]
export function createVectorIndex(documents = []) {
  const docs = documents.map(doc => ({ ...doc, tf: termFrequency(doc.text) }))
  // IDF 用于给区分度高的词元加权，压低“系统/故障”这类高频词。
  const df = new Map()
  for (const doc of docs) {
    for (const tok of doc.tf.keys()) df.set(tok, (df.get(tok) || 0) + 1)
  }
  const N = docs.length || 1
  const idf = new Map()
  for (const [tok, freq] of df) idf.set(tok, Math.log(1 + N / freq))

  // 预算每篇文档的加权向量模长，供余弦归一。
  const docVectors = docs.map(doc => {
    const vec = weightedVector(doc.tf, idf)
    return { doc, vec, norm: vectorNorm(vec) }
  })

  function search(query, topK = 5) {
    const queryVec = weightedVector(termFrequency(query), idf)
    const queryNorm = vectorNorm(queryVec)
    if (queryNorm === 0) return []
    return docVectors
      .map(({ doc, vec, norm }) => ({
        id: doc.id,
        score: round(cosine(queryVec, queryNorm, vec, norm)),
        doc,
      }))
      .filter(hit => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  return { search, size: docs.length }
}

function termFrequency(text) {
  const tf = new Map()
  for (const tok of tokenize(text)) tf.set(tok, (tf.get(tok) || 0) + 1)
  return tf
}

function weightedVector(tf, idf) {
  const vec = new Map()
  for (const [tok, freq] of tf) {
    const weight = (idf.get(tok) || 0) * (1 + Math.log(freq))
    if (weight > 0) vec.set(tok, weight)
  }
  return vec
}

function vectorNorm(vec) {
  let sum = 0
  for (const w of vec.values()) sum += w * w
  return Math.sqrt(sum)
}

function cosine(a, aNorm, b, bNorm) {
  if (aNorm === 0 || bNorm === 0) return 0
  // 遍历较小的一侧点积。
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let dot = 0
  for (const [tok, w] of small) {
    const other = large.get(tok)
    if (other) dot += w * other
  }
  return dot / (aNorm * bNorm)
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
