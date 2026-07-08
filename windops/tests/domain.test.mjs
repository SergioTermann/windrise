// 领域词典与共享判定 —— domain.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isWindOpsDomainQuery,
  containsHighRiskAction,
  matchedHighRiskActions,
  hasSymptomSignal,
  slugify,
  WIND_OPS_INTENTS,
} from '../index.mjs'

test('isWindOpsDomainQuery 识别风电领域词', () => {
  for (const q of ['3号机变桨24V低压', '齿轮箱油温高', 'SCADA趋势异常', '偏航卡死']) {
    assert.equal(isWindOpsDomainQuery(q), true, q)
  }
})

test('isWindOpsDomainQuery 排除非领域/空输入', () => {
  for (const q of ['你好', '今天天气不错', '', null, undefined, '帮我写代码']) {
    assert.equal(isWindOpsDomainQuery(q), false, String(q))
  }
})

test('containsHighRiskAction 命中控制类动词', () => {
  assert.equal(containsHighRiskAction('远程复位'), true)
  assert.equal(containsHighRiskAction('登塔开柜'), true)
  assert.equal(containsHighRiskAction('查询运行曲线'), false)
})

test('matchedHighRiskActions 分类六大高风险动作', () => {
  const cases = [
    ['远程复位', '远程复位/启停机'],
    ['短接安全链', '参数调整/屏蔽保护'],
    ['登塔开柜', '登塔/进舱/开柜'],
    ['母线验电', '带电/高压/母线作业'],
    ['蓄能器泄压', '液压带压作业'],
    ['转子锁定', '传动链/转子作业'],
  ]
  for (const [q, label] of cases) {
    assert.deepEqual(matchedHighRiskActions(q), [label], q)
  }
  assert.deepEqual(matchedHighRiskActions('查询告警'), [])
})

test('hasSymptomSignal 识别现象词', () => {
  assert.equal(hasSymptomSignal('过温报警'), true)
  assert.equal(hasSymptomSignal('通信掉线'), true)
  assert.equal(hasSymptomSignal('你好'), false)
})

test('slugify 归一化并兜底', () => {
  assert.equal(slugify('变桨 系统/24V'), '变桨-系统-24v')
  assert.equal(slugify('   '), 'unclassified')
  assert.equal(slugify(''), 'unclassified')
})

test('WIND_OPS_INTENTS 枚举完整', () => {
  assert.deepEqual(
    Object.values(WIND_OPS_INTENTS).sort(),
    ['chitchat', 'diagnosis', 'knowledge', 'review'],
  )
})
