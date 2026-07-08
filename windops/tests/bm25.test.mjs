// ⑥ 模型层 —— BM25 精确/混合召回
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBm25Index, tokenize } from '../index.mjs'

const CORPUS = [
  { id: 'd1', text: '变桨系统 24V 控制电源 故障码 T_1234 处置卡', source: 'manual' },
  { id: 'd2', text: '齿轮箱 油温高 冷却 滤芯 更换 SOP', source: 'sop' },
  { id: 'd3', text: '变桨 桨距 编码器 反馈 丢失 排查步骤', source: 'work_order' },
]

test('tokenize 保留故障码 ASCII 词元与中文一二元', () => {
  const toks = tokenize('变桨 T_1234')
  assert.ok(toks.includes('t_1234'))
  assert.ok(toks.includes('变'))
  assert.ok(toks.includes('变桨'))
})

test('BM25 故障码精确命中排第一', () => {
  const idx = createBm25Index(CORPUS)
  const hits = idx.search('T_1234 变桨', 3)
  assert.equal(hits[0].id, 'd1')
  assert.ok(hits[0].score > 0)
})

test('BM25 主题词召回正确文档', () => {
  const idx = createBm25Index(CORPUS)
  const hits = idx.search('齿轮箱油温', 3)
  assert.equal(hits[0].id, 'd2')
})

test('BM25 无匹配返回空、分数降序', () => {
  const idx = createBm25Index(CORPUS)
  assert.deepEqual(idx.search('完全不相关的英文 xyzzy', 3), [])
  const hits = idx.search('变桨 编码器 24V', 3)
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1].score >= hits[i].score)
})

test('BM25 命中项带回原文档与来源', () => {
  const idx = createBm25Index(CORPUS)
  const top = idx.search('滤芯 更换', 1)[0]
  assert.equal(top.doc.source, 'sop')
  assert.equal(idx.size, 3)
})
