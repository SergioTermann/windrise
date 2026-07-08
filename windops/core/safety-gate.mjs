// ④ 模型应用层 · Safety Gate 硬校验
// 高风险动作只生成建议和校验项，默认不直连控制系统执行。
// 对应技术细节第 11/13 页“权限边界与二次确认”。

import { HIGH_RISK_ACTIONS } from '../domain.mjs'
import { buildWindOpsCase } from '../data/case-builder.mjs'

export function buildWindOpsSafetyGate(query, caseInfo = buildWindOpsCase(query)) {
  const text = String(query || '')
  const riskActions = HIGH_RISK_ACTIONS.filter(item => item.pattern.test(text)).map(item => item.label)
  const requiredChecks = []
  if (riskActions.includes('远程复位/启停机')) {
    requiredChecks.push('确认当前停机/故障状态、伴随告警、复位权限和人工二次确认')
  }
  if (riskActions.includes('参数调整/屏蔽保护')) {
    requiredChecks.push('禁止屏蔽安全保护；任何参数调整必须走审批、备份和回退方案')
  }
  if (riskActions.includes('登塔/进舱/开柜')) {
    requiredChecks.push('确认作业票、风速限制、人员资质、上锁挂牌和通信监护')
  }
  if (riskActions.includes('带电/高压/母线作业')) {
    requiredChecks.push('确认断电挂牌、验电、母线放电、残压为安全范围')
  }
  if (riskActions.includes('液压带压作业')) {
    requiredChecks.push('确认停机隔离、泄压、机械压力表复核和喷油方向避让')
  }
  if (riskActions.includes('传动链/转子作业')) {
    requiredChecks.push('确认转子/传动链机械锁定、防误启动和监护人到位')
  }
  if (caseInfo?.missing?.includes('安全前置条件')) {
    requiredChecks.push('补充风速、作业票、停机状态和权限信息后再输出控制类建议')
  }
  return {
    riskActions,
    requiredChecks: requiredChecks.length
      ? [...new Set(requiredChecks)]
      : ['无高风险动作命中；仍需按现场SOP确认人员、设备和权限状态'],
    decision: riskActions.length ? 'advice_only_human_confirm_required' : 'read_only_diagnosis_allowed',
    canExecuteControl: false,
  }
}
