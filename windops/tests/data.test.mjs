// ② 数据层 —— FaultQueryRewriter + Case 装配
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractTurbineId,
  extractFaultCode,
  extractTimeWindow,
  extractOperatingSignals,
  extractSafetySignals,
  buildWindOpsCase,
} from '../index.mjs'

test('extractTurbineId 多种写法归一到 WTG-000', () => {
  assert.equal(extractTurbineId('WTG-003'), 'WTG-003')
  assert.equal(extractTurbineId('WTG_12'), 'WTG-012')
  assert.equal(extractTurbineId('3号机'), 'WTG-003')
  assert.equal(extractTurbineId('12号机组'), 'WTG-012')
  assert.equal(extractTurbineId('5#风机'), 'WTG-005')
  assert.equal(extractTurbineId('无编号'), '')
})

test('extractFaultCode 覆盖多种编码格式', () => {
  assert.equal(extractFaultCode('T_1234'), 'T_1234')
  assert.equal(extractFaultCode('YX0456'), 'YX0456')
  assert.equal(extractFaultCode('故障码 3806'), '3806')
  assert.equal(extractFaultCode('主控报代码 A12-3'), 'A12-3')
  assert.equal(extractFaultCode('叶片 303804 报警'), '303804')
  assert.equal(extractFaultCode('没有编码'), '')
})

test('extractTimeWindow 识别时间窗，缺省待补充', () => {
  assert.equal(extractTimeWindow('近30分钟电压跳变'), '近30分钟')
  assert.equal(extractTimeWindow('昨天开始'), '昨天')
  assert.equal(extractTimeWindow('前后10分钟'), '前后10分钟')
  assert.equal(extractTimeWindow('没有时间信息'), '待补充')
})

test('extractOperatingSignals 去重收集运行信号', () => {
  const s = extractOperatingSignals('电压跳变，SCADA趋势升高，停机中')
  assert.ok(s.includes('电压/电流'))
  assert.ok(s.includes('CMS/SCADA趋势'))
  assert.ok(s.includes('停机状态'))
  assert.equal(new Set(s).size, s.length)
})

test('extractSafetySignals 收集安全前置信号', () => {
  const s = extractSafetySignals('已开作业票，上锁挂牌，风速8m/s')
  assert.ok(s.includes('作业票'))
  assert.ok(s.includes('上锁挂牌'))
  assert.ok(s.includes('风速限制'))
})

test('buildWindOpsCase 覆盖全部 12 类系统', () => {
  const expected = [
    ['变桨低压', '变桨系统'],
    ['偏航卡死', '偏航系统'],
    ['齿轮箱油温高', '齿轮箱系统'],
    ['发电机绕组过温', '发电机系统'],
    ['主轴承振动', '传动系统'],
    ['液压压力低', '液压/制动系统'],
    ['变流IGBT故障', '变流系统'],
    ['Profibus掉线', '通信系统'],
    ['安全链断开', '安全链系统'],
    ['箱变并网跳闸', '电网/变压器系统'],
    ['水冷流量低', '水冷系统'],
    ['SCADA趋势异常', '主控/SCADA系统'],
  ]
  for (const [q, sys] of expected) {
    assert.equal(buildWindOpsCase(q).system, sys, q)
  }
})

test('buildWindOpsCase 未识别系统时标记待识别与缺失', () => {
  const c = buildWindOpsCase('随便说点什么')
  assert.equal(c.system, '待识别')
  assert.ok(c.missing.includes('系统/部件'))
  assert.ok(c.missing.includes('风机ID'))
})

test('buildWindOpsCase 高风险且无安全信号时提示安全前置缺失', () => {
  const c = buildWindOpsCase('3号机变桨24V低压，想远程复位')
  assert.ok(c.missing.includes('安全前置条件'))
})

test('buildWindOpsCase 置信度随实体齐全度上升且封顶 0.98', () => {
  const low = buildWindOpsCase('随便说点什么')
  const high = buildWindOpsCase('12号风场 WTG-003 变桨系统 故障码T_1234 近30分钟电压跳变 停机 已开作业票')
  assert.ok(high.confidence > low.confidence)
  assert.ok(high.confidence <= 0.98)
  assert.ok(low.confidence >= 0.15)
})

test('buildWindOpsCase 上下文注入风场/机型', () => {
  const c = buildWindOpsCase('变桨低压', { windFarmId: '12', windFarmName: '示范风场', models: ['机型X'] })
  assert.equal(c.windFarmId, '12')
  assert.equal(c.windFarmName, '示范风场')
  assert.deepEqual(c.models, ['机型X'])
})

test('buildWindOpsCase id 优先用故障码', () => {
  assert.equal(buildWindOpsCase('故障码 T_1234 变桨').id, 'case:T_1234')
  assert.match(buildWindOpsCase('变桨低压').id, /^case:/)
})
