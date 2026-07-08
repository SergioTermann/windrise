// ⑥ 模型层 —— LLM Wiki L1 语义缓存
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSemanticCache, buildCacheKey } from '../index.mjs'

const caseA = { system: '变桨系统', component: '24V电源', faultCode: 'T_1234' }
const caseAVariant = { system: '变桨系统', component: '24V电源', faultCode: 'T_1234', turbineId: 'WTG-9' }

test('buildCacheKey 与口语无关，只看故障签名', () => {
  assert.equal(buildCacheKey(caseA), buildCacheKey(caseAVariant))
})

test('命中/未命中与 hitRate 统计', () => {
  const cache = createSemanticCache()
  assert.equal(cache.get(caseA), null)
  cache.set(caseA, '标准处置卡A')
  const hit = cache.get(caseAVariant) // 同签名不同风机也命中
  assert.equal(hit.cached, true)
  assert.equal(hit.answer, '标准处置卡A')
  const s = cache.stats()
  assert.equal(s.hits, 1)
  assert.equal(s.misses, 1)
  assert.equal(s.hitRate, 0.5)
})

test('TTL 到期后失效', () => {
  let t = 0
  const cache = createSemanticCache({ ttlMs: 100, now: () => t })
  cache.set(caseA, 'x')
  t = 99
  assert.ok(cache.get(caseA))
  t = 100
  assert.equal(cache.get(caseA), null)
})

test('未识别故障签名不入缓存', () => {
  const cache = createSemanticCache()
  assert.equal(cache.set({ system: '待识别', component: '待识别', faultCode: '待补充' }, 'x'), false)
  assert.equal(cache.stats().size, 0)
})

test('超过容量按 LRU 淘汰最旧', () => {
  const cache = createSemanticCache({ max: 2 })
  cache.set({ system: 's1', component: 'c', faultCode: 'f' }, 'a')
  cache.set({ system: 's2', component: 'c', faultCode: 'f' }, 'b')
  cache.get({ system: 's1', component: 'c', faultCode: 'f' }) // s1 变为最近使用
  cache.set({ system: 's3', component: 'c', faultCode: 'f' }, 'c') // 淘汰 s2
  assert.ok(cache.get({ system: 's1', component: 'c', faultCode: 'f' }))
  assert.equal(cache.get({ system: 's2', component: 'c', faultCode: 'f' }), null)
  assert.ok(cache.get({ system: 's3', component: 'c', faultCode: 'f' }))
})
