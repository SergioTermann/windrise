// ⑥ 模型层 · 训推分离的任务路由
// 把简单 FAQ、复杂诊断、时序异常、多模态巡检、专家评分拆开路由。
// 对应技术细节第 18 页“风电模型路由”。

export const MODEL_ROUTES = [
  {
    task: 'faq',
    label: '标准FAQ/故障码解释',
    model: '小模型 + 语义缓存',
    match: text => /是什么故障|什么意思|解释一下|含义|代表什么/.test(text) || /^\s*\d{3,8}\s*$/.test(text),
    reason: '高频、低风险、低延迟',
  },
  {
    task: 'timeseries',
    label: '时序异常识别',
    model: '专用时序模型/规则引擎',
    match: text => /趋势|曲线|波动|爬升|持续升高|振动趋势|电压跳变/.test(text),
    reason: '数值趋势不应完全交给 LLM',
  },
  {
    task: 'multimodal',
    label: '巡检图片/视频',
    model: '多模态模型',
    match: text => /图片|照片|视频|裂纹|渗油|烧蚀|锈蚀|外观|拍了|巡检图/.test(text),
    reason: '图像证据进入诊断链',
  },
  {
    task: 'review',
    label: '专家复核/Judge',
    model: '异步评审模型 + 专家规则',
    match: text => /复盘|工单关闭|抽检|入库|专家复核|质检/.test(text),
    reason: '进入反馈飞轮',
  },
  {
    task: 'diagnosis',
    label: '多步故障诊断',
    model: '强推理 LLM + Planner',
    match: () => true, // 兜底：多告警、多系统关联走强推理
    reason: '需要拆任务和证据整合',
  },
]

export function routeWindOpsModel(query, caseInfo = {}) {
  const text = String(query || '')
  // 多系统/多信号关联优先判为多步诊断。
  const multiSignal = (caseInfo.operatingSignals?.length || 0) >= 2
  const route = multiSignal
    ? MODEL_ROUTES.find(item => item.task === 'diagnosis')
    : MODEL_ROUTES.find(item => item.match(text))
  return {
    task: route.task,
    label: route.label,
    model: route.model,
    reason: route.reason,
  }
}
