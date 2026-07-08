// ① 业务层 —— 意图路由 + 系统指令
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  routeWindOpsIntent,
  WIND_OPS_INTENTS,
  buildWindOpsSystemInstruction,
  buildWindOpsCase,
} from '../index.mjs'

test('routeWindOpsIntent 非领域→闲聊，不进架构链路', () => {
  const r = routeWindOpsIntent('你好')
  assert.equal(r.intent, WIND_OPS_INTENTS.CHITCHAT)
  assert.equal(r.needsArchitecture, false)
})

test('routeWindOpsIntent 纯故障码解释→知识查询', () => {
  const q = '变桨24V低压是什么故障'
  const r = routeWindOpsIntent(q, buildWindOpsCase(q))
  assert.equal(r.intent, WIND_OPS_INTENTS.KNOWLEDGE)
  assert.equal(r.needsArchitecture, true)
})

test('routeWindOpsIntent 带风机的现场问题→诊断', () => {
  const q = '3号机变桨24V低压，想远程复位'
  const r = routeWindOpsIntent(q, buildWindOpsCase(q))
  assert.equal(r.intent, WIND_OPS_INTENTS.DIAGNOSIS)
})

test('routeWindOpsIntent 复盘类→复盘', () => {
  const q = 'WTG-12 齿轮箱油温高故障复盘，工单验收根因确认'
  const r = routeWindOpsIntent(q, buildWindOpsCase(q))
  assert.equal(r.intent, WIND_OPS_INTENTS.REVIEW)
})

test('routeWindOpsIntent 解释类但带风机不降级为知识', () => {
  const q = '3号机变桨是什么故障'
  const r = routeWindOpsIntent(q, buildWindOpsCase(q))
  assert.equal(r.intent, WIND_OPS_INTENTS.DIAGNOSIS)
})

test('buildWindOpsSystemInstruction 含七层与安全边界约束', () => {
  const s = buildWindOpsSystemInstruction()
  assert.match(s, /七层/)
  assert.match(s, /安全边界/)
  assert.match(s, /二次确认/)
  assert.doesNotMatch(s, /01_lecture1/)
})
