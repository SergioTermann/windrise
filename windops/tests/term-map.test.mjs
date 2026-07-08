// ② 数据层 —— 机型/厂家术语映射
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTerms, buildWindOpsCase } from '../index.mjs'

test('normalizeTerms 英文/口语归一到规范术语', () => {
  const r = normalizeTerms('pitch 24V low, yaw abnormal')
  assert.ok(r.terms.includes('变桨'))
  assert.ok(r.terms.includes('偏航'))
  assert.ok(r.terms.includes('24V电源'))
})

test('normalizeTerms 识别厂家标签', () => {
  const r = normalizeTerms('明阳机组变桨报警')
  assert.deepEqual(r.vendors, ['明阳'])
})

test('normalizeTerms canonicalText 追加规范术语供兜底', () => {
  const r = normalizeTerms('变浆卡涩')
  assert.ok(r.canonicalText.includes('变桨'))
})

test('无同义词时 terms 为空、canonicalText 不变', () => {
  const r = normalizeTerms('齿轮箱油温高')
  assert.deepEqual(r.terms, [])
  assert.equal(r.canonicalText, '齿轮箱油温高')
})

test('case-builder 用术语归一兜底识别系统（变浆→变桨系统）', () => {
  const c = buildWindOpsCase('变浆24V低压')
  assert.equal(c.system, '变桨系统')
  assert.ok(c.terms.includes('变桨'))
})

test('case-builder 附带 terms/vendors 字段且不破坏既有识别', () => {
  const c = buildWindOpsCase('明阳 pitch 24V 低压')
  assert.equal(c.system, '变桨系统')
  assert.ok(c.vendors.includes('明阳'))
  const g = buildWindOpsCase('随便说点什么')
  assert.equal(g.system, '待识别')
  assert.deepEqual(g.terms, [])
})
