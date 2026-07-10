// ⑦ 反馈层 · 知识飞轮（闭环即进化）
// 工单验收 / 专家治理通过后，把已验证处置卡沉淀进 LLM Wiki 的 L1 语义缓存，
// 下次同签名故障毫秒级命中；未验收的候选结论一律不入缓存，避免污染。
// 对应技术细节第 15/16 页“L1 语义缓存：已验证 FAQ”与第 22 页“闭环即进化”。

// verified 判定：审核池治理通过、专家确认或工单关闭，三者任一即视为已验证。
export function isVerifiedForCache({ governance, expertConfirmed, workOrderClosed } = {}) {
  return governance === 'promoted_to_training' || Boolean(expertConfirmed) || Boolean(workOrderClosed)
}

export function createKnowledgeFlywheel({ wiki, logger = console } = {}) {
  if (!wiki || typeof wiki.promoteToCache !== 'function') {
    throw new Error('createKnowledgeFlywheel 需要带 promoteToCache 的 LLM Wiki')
  }
  const stats = { promoted: 0, rejected: 0 }

  // 治理事件回流：只有已验证结论才提升为 L1 已验证处置卡。
  function onGoverned({ caseInfo, answer, citations = [], governance, expertConfirmed, workOrderClosed } = {}) {
    if (!isVerifiedForCache({ governance, expertConfirmed, workOrderClosed })) {
      stats.rejected += 1
      return { promoted: false, reason: 'unverified_candidate' }
    }
    const card = normalizeAnswer(answer, citations)
    if (!card.text) {
      stats.rejected += 1
      return { promoted: false, reason: 'empty_answer' }
    }
    // semantic-cache 对未识别故障签名会拒绝入缓存，返回 false。
    const cached = wiki.promoteToCache(caseInfo || {}, { ...card, verified: true, source: 'verified_faq' })
    if (!cached) {
      stats.rejected += 1
      return { promoted: false, reason: 'unresolved_signature' }
    }
    stats.promoted += 1
    if (logger?.debug) logger.debug(`知识飞轮：已验证处置卡入 L1（${caseInfo?.faultCode || caseInfo?.component || '未知签名'}）`)
    return { promoted: true, reason: 'promoted_verified_faq' }
  }

  return { onGoverned, stats: () => ({ ...stats }) }
}

function normalizeAnswer(answer, citations) {
  if (answer && typeof answer === 'object') {
    return { text: String(answer.text || '').trim(), citations: answer.citations || citations }
  }
  return { text: String(answer || '').trim(), citations }
}
