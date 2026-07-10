// ⑦ 反馈层 —— 知识飞轮（工单/专家治理通过后已验证处置卡回流 L1 语义缓存）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createKnowledgeFlywheel,
  isVerifiedForCache,
  createLlmWiki,
  buildWindOpsCase,
} from '../index.mjs'

test('isVerifiedForCache 治理通过/专家确认/工单关闭任一即已验证', () => {
  assert.equal(isVerifiedForCache({ governance: 'promoted_to_training' }), true)
  assert.equal(isVerifiedForCache({ expertConfirmed: true }), true)
  assert.equal(isVerifiedForCache({ workOrderClosed: true }), true)
  assert.equal(isVerifiedForCache({ governance: 'pending_review_pool' }), false)
  assert.equal(isVerifiedForCache({}), false)
})

test('未验证候选结论一律不入 L1（避免污染）', () => {
  const wiki = createLlmWiki()
  const flywheel = createKnowledgeFlywheel({ wiki })
  const c = buildWindOpsCase('齿轮箱油温高 512006')
  const r = flywheel.onGoverned({ caseInfo: c, answer: '先查冷却回路', governance: 'pending_review_pool' })
  assert.equal(r.promoted, false)
  assert.equal(r.reason, 'unverified_candidate')
  // L1 未写入，lookup 仍走 L2。
  assert.notEqual(wiki.lookup(c, { query: '齿轮箱油温高' }).hit, 'L1')
})

test('治理通过后已验证处置卡回流 L1，下次毫秒级命中', () => {
  const wiki = createLlmWiki()
  const flywheel = createKnowledgeFlywheel({ wiki })
  const c = buildWindOpsCase('齿轮箱油温高 512006')
  const r = flywheel.onGoverned({
    caseInfo: c,
    answer: { text: '已验证处置卡：先查冷却风扇与油泵回路，趋势爬升优先冷却' },
    citations: [{ id: 'manual-gearbox-oiltemp' }],
    workOrderClosed: true,
    expertConfirmed: true,
  })
  assert.equal(r.promoted, true)
  const hit = wiki.lookup(c, { query: '齿轮箱油温高' })
  assert.equal(hit.hit, 'L1')
  assert.equal(hit.cached, true)
  assert.match(hit.answer.text, /已验证处置卡/)
  assert.equal(hit.answer.verified, true)
  assert.equal(flywheel.stats().promoted, 1)
})

test('未识别故障签名即便已验证也不入缓存', () => {
  const wiki = createLlmWiki()
  const flywheel = createKnowledgeFlywheel({ wiki })
  const c = buildWindOpsCase('随便问问') // 无系统/部件/故障码
  const r = flywheel.onGoverned({ caseInfo: c, answer: '通用回答', expertConfirmed: true })
  assert.equal(r.promoted, false)
  assert.equal(r.reason, 'unresolved_signature')
})

test('createKnowledgeFlywheel 拒绝缺 promoteToCache 的对象', () => {
  assert.throws(() => createKnowledgeFlywheel({ wiki: {} }), /promoteToCache/)
})
