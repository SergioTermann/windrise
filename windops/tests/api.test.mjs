// 集成测试 —— 通过真实 HTTP 服务端到端验证七层链路
// 自带 server 生命周期：spawn → 等待 health → 断言 → 关闭。
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER = resolve(HERE, '../../scripts/doc-knowledge-server.mjs')
const PORT = Number(process.env.WINDOPS_TEST_PORT || 8794)
const BASE = `http://127.0.0.1:${PORT}`
const REVIEW_POOL_PATH = join(tmpdir(), `windops-review-pool-api-${process.pid}.jsonl`)

let child

async function waitForHealth(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/health`)
      if (r.ok) return await r.json()
    } catch {
      // 服务尚未就绪
    }
    await new Promise(res => setTimeout(res, 250))
  }
  throw new Error('server did not become healthy')
}

async function postChat(body) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  assert.equal(r.status, 200, `${body.message}: ${text}`)
  return JSON.parse(text)
}

before(async () => {
  await rm(REVIEW_POOL_PATH, { force: true })
  child = spawn('node', [SERVER], {
    env: {
      ...process.env,
      DOC_KNOWLEDGE_PORT: String(PORT),
      WINDRISE_MEM0_ENABLED: '0',
      WINDOPS_REVIEW_POOL_PATH: REVIEW_POOL_PATH,
    },
    stdio: 'ignore',
  })
  await waitForHealth()
})

after(async () => {
  if (child) child.kill('SIGKILL')
  await rm(REVIEW_POOL_PATH, { force: true })
})

test('health 返回 mem0 状态', async () => {
  const h = await fetch(`${BASE}/health`).then(r => r.json())
  assert.equal(h.ok, true)
  assert.ok(h.mem0)
})

test('闲聊不触发七层架构', async () => {
  const r = await postChat({ conversation_id: 'api-chitchat', message: '你好' })
  assert.equal(r.windops_architecture, null)
})

test('高风险短接安全链 → 拦截并给安全决策', async () => {
  const r = await postChat({ conversation_id: 'api-risk', message: '8号机安全链断开，能不能短接试运行' })
  assert.match(r.answer, /不能短接安全链/)
  assert.equal(r.windops_architecture.case.turbineId, 'WTG-008')
  assert.equal(r.windops_architecture.case.system, '安全链系统')
  assert.equal(r.windops_architecture.safety_gate.decision, 'advice_only_human_confirm_required')
})

test('变桨诊断 → 命中结论且不误导', async () => {
  const r = await postChat({
    conversation_id: 'api-diagnosis',
    message: '3号机变桨24V低压，想复位，近30分钟SCADA电压跳变',
  })
  assert.match(r.answer, /变桨 24V 控制电源或开关反馈丢失/)
  assert.equal(r.windops_architecture.case.system, '变桨系统')
  assert.equal(r.windops_architecture.memory_router.workPhase, 'safety')
})

test('跨轮记忆：追问继承风机/风场/系统', async () => {
  const first = await postChat({
    conversation_id: 'api-memory',
    message: '12号风场，WTG-7 齿轮箱油温高，昨天SCADA趋势持续升高',
  })
  assert.equal(first.windops_architecture.case.windFarmId, '12')
  assert.equal(first.windops_architecture.case.turbineId, 'WTG-007')
  assert.equal(first.windops_architecture.case.system, '齿轮箱系统')

  const follow = await postChat({ conversation_id: 'api-memory', message: '下一步怎么做' })
  assert.equal(follow.windops_architecture.case.turbineId, 'WTG-007')
  assert.equal(follow.windops_architecture.case.system, '齿轮箱系统')
  assert.equal(follow.windops_architecture.feedback_loop.workOrderDraftFields.turbineId, 'WTG-007')
})

test('⑦ 反馈层：WindOps 调用轨迹落库到审核池', async () => {
  await postChat({ conversation_id: 'api-review-pool', message: '8号机安全链断开，能不能短接试运行' })
  const text = await readFile(REVIEW_POOL_PATH, 'utf8')
  const records = text.split('\n').filter(Boolean).map(line => JSON.parse(line))
  assert.ok(records.length >= 1)
  const record = records.find(r => r.turbineId === 'WTG-008')
  assert.ok(record, 'expected a trace for WTG-008')
  assert.equal(record.governance, 'pending_review_pool')
  assert.equal(record.system, '安全链系统')
  assert.ok(Number.isFinite(record.recordedAt))
})
