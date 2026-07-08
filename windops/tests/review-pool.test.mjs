// ⑦ 反馈层 —— 审核池轨迹落库
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReviewPool } from '../index.mjs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function tempPath(i) {
  return join(tmpdir(), `windops-review-pool-${process.pid}-${i}.jsonl`)
}

test('append/list 轨迹落库并可读回', async () => {
  const path = tempPath(1)
  await rm(path, { force: true })
  let t = 1000
  const pool = createReviewPool({ path, now: () => t })
  await pool.append({ caseId: 'case:A', turbineId: 'WTG-003' })
  t = 2000
  await pool.append({ caseId: 'case:B', turbineId: 'WTG-007' })
  const all = await pool.list()
  assert.equal(all.length, 2)
  assert.equal(all[0].caseId, 'case:A')
  assert.equal(all[0].governance, 'pending_review_pool')
  assert.equal(all[0].recordedAt, 1000)
  await rm(path, { force: true })
})

test('list 文件不存在时返回空数组', async () => {
  const pool = createReviewPool({ path: tempPath('missing') })
  assert.deepEqual(await pool.list(), [])
})

test('pending 仅返回待审核项', async () => {
  const path = tempPath(2)
  await rm(path, { force: true })
  const pool = createReviewPool({ path })
  await pool.append({ caseId: 'case:A', governance: 'promoted_to_training' })
  await pool.append({ caseId: 'case:B' })
  const pending = await pool.pending()
  assert.equal(pending.length, 1)
  assert.equal(pending[0].caseId, 'case:B')
  await rm(path, { force: true })
})

test('promote 治理通过后标记为 promoted_to_training', async () => {
  const path = tempPath(3)
  await rm(path, { force: true })
  const pool = createReviewPool({ path })
  await pool.append({ caseId: 'case:A' })
  await pool.append({ caseId: 'case:A' })
  await pool.append({ caseId: 'case:B' })
  const changed = await pool.promote('case:A')
  assert.equal(changed, 2)
  assert.equal((await pool.pending()).length, 1)
  const all = await pool.list()
  assert.ok(all.filter(r => r.caseId === 'case:A').every(r => r.governance === 'promoted_to_training'))
  await rm(path, { force: true })
})
