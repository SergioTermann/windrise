const DEFAULT_MEM0_HOST = 'https://api.mem0.ai'
const FALSE_FLAG = /^(0|false|off|no)$/i

export function createWindriseMem0Memory(options = {}) {
  const env = options.env || process.env
  const logger = options.logger || console
  const apiKey = env.WINDRISE_MEM0_API_KEY || env.MEM0_API_KEY || ''
  const enabledFlag = env.WINDRISE_MEM0_ENABLED ?? env.MEM0_ENABLED
  const enabled = enabledFlag === undefined ? Boolean(apiKey) : !FALSE_FLAG.test(String(enabledFlag).trim())
  const host = stripTrailingSlash(env.WINDRISE_MEM0_HOST || env.MEM0_HOST || DEFAULT_MEM0_HOST)
  const timeoutMs = parsePositiveInt(env.WINDRISE_MEM0_TIMEOUT_MS || env.MEM0_TIMEOUT_MS, 8000)
  const topK = parsePositiveInt(env.WINDRISE_MEM0_TOP_K || env.MEM0_TOP_K, 5)
  const contextChars = parsePositiveInt(env.WINDRISE_MEM0_CONTEXT_CHARS, 1800)
  const addInfer = !FALSE_FLAG.test(String(env.WINDRISE_MEM0_INFER ?? 'true'))
  const logErrors = env.WINDRISE_MEM0_LOG_ERRORS === '1'
  const config = {
    enabled,
    apiKey,
    host,
    timeoutMs,
    topK,
    contextChars,
    addInfer,
    userId: env.WINDRISE_MEM0_USER_ID || env.MEM0_USER_ID || 'windrise-user',
    agentId: env.WINDRISE_MEM0_AGENT_ID || env.MEM0_AGENT_ID || 'windrise',
    appId: env.WINDRISE_MEM0_APP_ID || env.MEM0_APP_ID || 'windrise-llmwiki',
    service: options.service || 'windrise',
  }
  let warnedMissingKey = false
  let warnedRequestFailure = false

  return {
    isEnabled() {
      return Boolean(config.enabled && config.apiKey)
    },

    status() {
      return {
        enabled: Boolean(config.enabled),
        configured: Boolean(config.apiKey),
        host: config.host,
        user_id: config.userId,
        agent_id: config.agentId,
        app_id: config.appId,
      }
    },

    async searchContext(query, metadata = {}) {
      const text = String(query || '').trim()
      if (!text || !ensureConfigured()) return ''
      try {
        const response = await requestMem0('/v3/memories/search/', {
          query: text,
          output_format: 'v1.1',
          top_k: config.topK,
          filters: entityFilters(config),
          metadata: compactObject({
            service: config.service,
            conversation_id: metadata.conversationId,
          }),
        })
        return renderMem0Context(extractMem0Results(response), config.contextChars)
      } catch (error) {
        warnRequestFailure(`Windrise mem0 search failed: ${error.message}`)
        return ''
      }
    },

    async rememberTurn({ conversationId, userMessage, assistantAnswer, metadata = {} } = {}) {
      if (!ensureConfigured()) return false
      const messages = []
      const user = truncateText(userMessage, 4000)
      const assistant = truncateText(assistantAnswer, 4000)
      if (user) messages.push({ role: 'user', content: user })
      if (assistant) messages.push({ role: 'assistant', content: assistant })
      if (!messages.length) return false

      try {
        await requestMem0('/v3/memories/add/', {
          messages,
          infer: config.addInfer,
          user_id: config.userId,
          agent_id: config.agentId,
          app_id: config.appId,
          metadata: compactObject({
            source: 'windrise',
            service: config.service,
            conversation_id: conversationId,
            topic: metadata.topic,
            fault_codes: Array.isArray(metadata.faultCodes) ? metadata.faultCodes.slice(-5) : undefined,
            reasoning_case: metadata.reasoningCase,
          }),
        })
        return true
      } catch (error) {
        warnRequestFailure(`Windrise mem0 add failed: ${error.message}`)
        return false
      }
    },
  }

  function ensureConfigured() {
    if (!config.enabled) return false
    if (config.apiKey) return true
    if (!warnedMissingKey) {
      warnedMissingKey = true
      logger.warn('Windrise mem0 is enabled but MEM0_API_KEY/WINDRISE_MEM0_API_KEY is not set.')
    }
    return false
  }

  async function requestMem0(path, body) {
    const response = await fetch(`${config.host}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
    const responseText = await response.text()
    const parsed = parseJson(responseText)
    if (!response.ok) {
      const message = parsed?.detail || parsed?.message || parsed?.error || responseText || `${response.status} ${response.statusText}`
      throw new Error(message)
    }
    return parsed
  }

  function warnRequestFailure(message) {
    if (!logErrors && warnedRequestFailure) return
    warnedRequestFailure = true
    logger.warn(message)
  }
}

function entityFilters(config) {
  return compactObject({
    user_id: config.userId,
    agent_id: config.agentId,
    app_id: config.appId,
  })
}

function extractMem0Results(response) {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.results)) return response.results
  if (Array.isArray(response?.memories)) return response.memories
  return []
}

function renderMem0Context(results, limit) {
  const lines = []
  const seen = new Set()
  for (const item of results) {
    const memory = normalizeMemoryLine(
      item?.memory ||
      item?.data?.memory ||
      item?.text ||
      item?.summary ||
      item?.content ||
      '',
    )
    if (!memory || seen.has(memory)) continue
    seen.add(memory)
    const categories = Array.isArray(item?.categories) && item.categories.length
      ? ` [${item.categories.join('/')}]`
      : ''
    lines.push(`- ${memory}${categories}`)
  }
  return truncateText(lines.join('\n'), limit)
}

function normalizeMemoryLine(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[。.;；,\s]+$/g, '')
    .trim()
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, item]) => {
      if (item === undefined || item === null || item === '') return false
      if (Array.isArray(item) && item.length === 0) return false
      return true
    }),
  )
}

function truncateText(value, limit) {
  const text = String(value || '').trim()
  if (!text || text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1))}…`
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function stripTrailingSlash(value) {
  return String(value || DEFAULT_MEM0_HOST).replace(/\/+$/, '')
}

function parseJson(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return null
  }
}
