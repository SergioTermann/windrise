// ④ 模型应用层 · LLM Wiki 默认知识种子
// 提供开箱可跑的最小知识源与部件-故障-措施-备件图谱，供 llm-wiki 与编排链路演示。
// 线上应由 Phase 0 的知识治理产出替换（手册/SOP/工单/图纸/BOM 版本化导入）。
// 对应技术细节第 16 页“知识源检索策略”与第 22 页 Phase 0/1。

// 知识文档：source 决定证据分级（manual>sop>expert>closed_work_order>unverified）。
export const SEED_WIKI_DOCUMENTS = [
  {
    id: 'manual-pitch-24v',
    source: 'manual',
    component: '变桨系统',
    faultCode: '303804',
    model: '机型X',
    version: '控制器 v2.3',
    updatedAt: '2026-05-10',
    applicability: '机型X / 控制器 v2.x',
    text: '变桨系统 24V 电源模块 303804：24V 供电电压低于阈值触发变桨柜低压告警。检查充电器状态、保险、端子紧固与柜内温度，电压持续低于 21V 判为电源模块劣化。',
  },
  {
    id: 'sop-pitch-lowvoltage',
    source: 'sop',
    component: '变桨系统',
    faultCode: '303804',
    updatedAt: '2026-04-02',
    applicability: '全场站变桨作业',
    text: '变桨 24V 低压现场处置 SOP：登塔前确认风速低于 12m/s、机组停机并挂牌上锁、持电子作业票；开变桨柜先测 24V 母线电压与充电器输出，再查端子与保险，禁止带电插拔电源模块。',
  },
  {
    id: 'wo-2026-0142-pitch',
    source: 'closed_work_order',
    component: '变桨系统',
    faultCode: '303804',
    updatedAt: '2026-06-18',
    applicability: '历史案例 · WTG-003',
    text: '历史工单 WO-2026-0142：WTG-003 变桨柜 24V 电源模块老化导致低压告警，更换电源模块与两只保险后复位恢复，停机 3.5 小时。',
  },
  {
    id: 'manual-gearbox-oiltemp',
    source: 'manual',
    component: '齿轮箱',
    faultCode: '512006',
    updatedAt: '2026-03-11',
    applicability: '机型X / 机型Y',
    text: '齿轮箱油温高 512006：润滑油温超过 75℃ 触发。检查冷却风扇、油泵、油位与滤芯压差，排查负载与环境温度，趋势性爬升优先查冷却回路。',
  },
  {
    id: 'expert-yaw-stuck',
    source: 'expert',
    component: '偏航系统',
    updatedAt: '2026-02-20',
    applicability: '专家经验 · 需结合现场',
    text: '偏航卡死经验：多为偏航电机制动未释放、齿面卡异物或扭缆开关误触发，先查制动器与扭缆计数，避免强制解缆。',
  },
]

// 部件-故障-措施-备件 图谱：节点 {type,key,name,...}，边 {from,to} 用 `${type}:${key}`。
export const SEED_KNOWLEDGE_GRAPH = {
  nodes: [
    { type: 'component', key: '变桨系统', name: '变桨系统' },
    { type: 'fault', key: '303804', name: '变桨24V低压' },
    { type: 'measure', key: 'check-24v-bus', name: '测量24V母线电压与充电器输出', source: 'sop', weight: 0.8 },
    { type: 'measure', key: 'check-terminal', name: '检查端子紧固与保险', source: 'sop', weight: 0.7 },
    { type: 'part', key: 'PS-24V-01', name: '24V电源模块', note: 'DC24V/10A', source: 'manual', weight: 0.75 },
    { type: 'part', key: 'FUSE-2A', name: '2A保险', source: 'manual', weight: 0.5 },
    { type: 'point', key: 'pitch_24v_voltage', name: '变桨24V电压点位' },
    { type: 'point', key: 'pitch_charger_state', name: '充电器状态点位' },
    { type: 'component', key: '齿轮箱', name: '齿轮箱' },
    { type: 'fault', key: '512006', name: '齿轮箱油温高' },
    { type: 'measure', key: 'check-cooling', name: '检查冷却风扇与油泵回路', source: 'sop', weight: 0.7 },
    { type: 'part', key: 'OIL-FILTER', name: '润滑油滤芯', source: 'manual', weight: 0.5 },
    { type: 'point', key: 'gearbox_oil_temp', name: '齿轮箱油温点位' },
  ],
  edges: [
    { from: 'component:变桨系统', to: 'fault:303804' },
    { from: 'fault:303804', to: 'measure:check-24v-bus' },
    { from: 'fault:303804', to: 'measure:check-terminal' },
    { from: 'fault:303804', to: 'point:pitch_24v_voltage' },
    { from: 'fault:303804', to: 'point:pitch_charger_state' },
    { from: 'measure:check-24v-bus', to: 'part:PS-24V-01' },
    { from: 'measure:check-terminal', to: 'part:FUSE-2A' },
    { from: 'component:齿轮箱', to: 'fault:512006' },
    { from: 'fault:512006', to: 'measure:check-cooling' },
    { from: 'fault:512006', to: 'point:gearbox_oil_temp' },
    { from: 'measure:check-cooling', to: 'part:OIL-FILTER' },
  ],
}
