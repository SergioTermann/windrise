// ② 数据层 · FaultQueryRewriter
// 把现场口语改写为结构化实体：风机ID、风场、故障码、时间窗、运行/安全信号。
// 对应技术细节第 6 页“故障 Query 改写与实体对齐”。

export function extractTurbineId(text) {
  const value = String(text || '')
  const explicit = value.match(/\bWTG[-_ ]?0*(\d{1,4})\b/i)
  if (explicit) return `WTG-${String(explicit[1]).padStart(3, '0')}`
  const cn = value.match(/(?:^|[^0-9])0*(\d{1,4})\s*(?:号机|#|台机组|号风机|机组)/i)
  if (cn) return `WTG-${String(cn[1]).padStart(3, '0')}`
  return ''
}

export function extractWindFarmId(text) {
  const value = String(text || '')
  const match = value.match(/(\d{1,2})\s*号?\s*风[场厂]|风[场厂]\s*(\d{1,2})/)
  return match?.[1] || match?.[2] || ''
}

export function extractFaultCode(text) {
  const value = String(text || '')
  const patterns = [
    /\bT[_-]?\d{2,8}\b/i,
    /\bYX\d{2,8}\b/i,
    /\b[A-Z]{1,4}[_-]?\d{2,8}(?:\.\d{1,4})?(?:-[A-Z0-9]+)?\b/i,
    /(?:故障码|故障代码|报码|报警码|告警码|代码)[^A-Za-z0-9]{0,8}([A-Za-z]{0,4}[_-]?\d{2,8}(?:\.\d{1,4})?(?:-[A-Za-z0-9]+)?)/i,
    /\b\d{3,8}\b/,
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    const raw = match?.[1] || match?.[0]
    if (raw) return raw.replace(/\s+/g, '').toUpperCase()
  }
  return ''
}

export function extractTimeWindow(text) {
  const value = String(text || '')
  return value.match(/近\s*\d+\s*(?:分钟|小时|天)|前后\s*\d+\s*(?:分钟|小时)|(?:今天|今日|昨天|刚才|当前|现在|本轮|最近|报警前后)/i)?.[0] || '待补充'
}

export function extractOperatingSignals(text) {
  const signals = []
  const value = String(text || '')
  const signalRules = [
    ['风速', /风速\s*[<>=约大概]*\s*\d+(?:\.\d+)?/i],
    ['停机状态', /停机|待机|维护状态|检修状态/i],
    ['限功率/降额', /限功率|降额|限载/i],
    ['电压/电流', /电压|电流|24\s*v|母线/i],
    ['温度/振动', /温度|振动|震动|异响/i],
    ['压力/流量', /压力|油压|水压|流量/i],
    ['CMS/SCADA趋势', /CMS|SCADA|HMI|趋势|曲线|事件记录/i],
  ]
  for (const [label, pattern] of signalRules) {
    if (pattern.test(value)) signals.push(label)
  }
  return [...new Set(signals)]
}

export function extractSafetySignals(text) {
  const signals = []
  const value = String(text || '')
  const signalRules = [
    ['作业票', /作业票|工作票|许可/i],
    ['风速限制', /风速/i],
    ['上锁挂牌', /上锁|挂牌|LOTO|隔离/i],
    ['停机/锁定', /停机|锁定|防转|机械锁/i],
    ['验电/放电/泄压', /验电|放电|泄压|残压/i],
    ['权限/人工确认', /权限|确认|二次确认|授权/i],
  ]
  for (const [label, pattern] of signalRules) {
    if (pattern.test(value)) signals.push(label)
  }
  return [...new Set(signals)]
}
