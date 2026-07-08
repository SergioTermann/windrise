// 领域词典与共享判定 —— 跨层复用的风电运维实体规则。
// 对应《智导助手 agent 技术细节》中反复出现的“系统/部件/高风险动作”常量。

export const WIND_DOMAIN_PATTERN = /(风机|风电|机组|变桨|偏航|主控|变流|变频|发电机|齿轮箱|液压|制动|刹车|安全链|电网|箱变|变压器|通信|通讯|水冷|冷却|传动|主轴|主轴承|叶片|轮毂|塔筒|机舱|传感器|风速仪|风向仪|振动|温度|润滑|油脂|SCADA|HMI|PLC|CMS|EAM|工单|24v|华仪|明阳|金风|远景|运达)/i

export const SYSTEM_RULES = [
  { pattern: /变桨|pitch|桨距/i, system: '变桨系统', component: '变桨驱动、24V控制电源、桨距编码器或开关反馈回路' },
  { pattern: /偏航|yaw/i, system: '偏航系统', component: '偏航驱动、偏航制动、编码器或液压回路' },
  { pattern: /齿轮箱|齿轮油|油温|滤芯|润滑/i, system: '齿轮箱系统', component: '齿轮箱润滑、冷却、滤芯或轴承' },
  { pattern: /发电机|绕组|轴承温度/i, system: '发电机系统', component: '发电机轴承、绕组、冷却或测温回路' },
  { pattern: /主轴|主轴承|传动链/i, system: '传动系统', component: '主轴承、传动链锁定、润滑或振动测点' },
  { pattern: /液压|制动|刹车|压力|蓄能器|阀组/i, system: '液压/制动系统', component: '液压站、蓄能器、阀组、压力传感器或制动器' },
  { pattern: /变流|变频|IGBT|母线|直流母线/i, system: '变流系统', component: '功率模块、直流母线、接触器或冷却回路' },
  { pattern: /通信|通讯|CAN|Profibus|EtherCAT|Modbus|光纤|交换机|掉线/i, system: '通信系统', component: '现场总线、交换机、光纤、节点供电或终端电阻' },
  { pattern: /安全链|保护链|急停|门禁|限位/i, system: '安全链系统', component: '急停、门锁、限位、安全继电器或PLC输入点' },
  { pattern: /箱变|变压器|并网|电网|频率|电压|断路器|接触器/i, system: '电网/变压器系统', component: '箱变、断路器、接触器、电能质量或并网保护' },
  { pattern: /水冷|冷却液|水泵|换热器|流量|水压/i, system: '水冷系统', component: '水泵、换热器、冷却液、压力或流量开关' },
  { pattern: /SCADA|HMI|主控|PLC|趋势|状态量|报警关联/i, system: '主控/SCADA系统', component: '主控报警逻辑、SCADA采集、PLC输入或状态量' },
]

export const HIGH_RISK_ACTIONS = [
  { label: '远程复位/启停机', pattern: /远程复位|复位|启机|启动|停机|并网|脱网/i },
  { label: '参数调整/屏蔽保护', pattern: /改参数|参数调整|屏蔽|旁路|短接|强制|解除保护|取消保护/i },
  { label: '登塔/进舱/开柜', pattern: /登塔|进舱|机舱|开柜|柜内|塔筒|塔底/i },
  { label: '带电/高压/母线作业', pattern: /带电|高压|母线|直流母线|验电|放电|IGBT|功率模块/i },
  { label: '液压带压作业', pattern: /带压|泄压|残压|蓄能器|拆管|管路|阀组/i },
  { label: '传动链/转子作业', pattern: /传动链|主轴|转子|叶轮|锁定|防转/i },
]

export function isWindOpsDomainQuery(query) {
  return WIND_DOMAIN_PATTERN.test(String(query || ''))
}

export function containsHighRiskAction(text) {
  return HIGH_RISK_ACTIONS.some(item => item.pattern.test(String(text || '')))
}

export function matchedHighRiskActions(text) {
  const value = String(text || '')
  return HIGH_RISK_ACTIONS.filter(item => item.pattern.test(value)).map(item => item.label)
}

export function hasSymptomSignal(text) {
  return /(报警|告警|故障|异常|停机|跳闸|过温|温度|振动|异响|漏油|压力|流量|低压|高压|跳变|反馈|丢失|掉线|不能启动|启动失败|限功率)/i.test(String(text || ''))
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unclassified'
}
