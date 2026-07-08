// ⑦ 反馈层 · 审核池（Trace 轨迹落库 → 治理 → 训练集）
// 调用轨迹先落地到本地 JSONL 审核池，专家治理通过后才可提升。
// 对应技术细节第 8 页 L1 数据飞轮层与第 14 页 TraceLogger。

import { appendFile, readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export function createReviewPool({ path, now = () => Date.now() } = {}) {
  if (!path) throw new Error('createReviewPool 需要 path')

  async function ensureDir() {
    await mkdir(dirname(path), { recursive: true })
  }

  // 追加一条轨迹（默认 governance=pending_review_pool）。
  async function append(trace) {
    await ensureDir()
    const record = {
      ...trace,
      governance: trace.governance || 'pending_review_pool',
      recordedAt: now(),
    }
    await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8')
    return record
  }

  async function list() {
    let text
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
    return text
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  }

  async function pending() {
    return (await list()).filter(record => record.governance === 'pending_review_pool')
  }

  // 专家治理通过：把某 caseId 的轨迹标记为 promoted_to_training。
  async function promote(caseId, { governance = 'promoted_to_training' } = {}) {
    const all = await list()
    let changed = 0
    const next = all.map(record => {
      if (record.caseId === caseId && record.governance === 'pending_review_pool') {
        changed += 1
        return { ...record, governance, promotedAt: now() }
      }
      return record
    })
    await ensureDir()
    await writeFile(path, next.map(record => JSON.stringify(record)).join('\n') + (next.length ? '\n' : ''), 'utf8')
    return changed
  }

  return { append, list, pending, promote }
}
