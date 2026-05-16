import { api } from '@/../convex/_generated/api'

import { convex } from '../convex'
import { logger, toErrorMessage } from '../logger'
import { corsHeaders, ipWhitelistGuard, logRequestDetails } from '../middleware'
// Side-effect import: bootstraps the plan-usage poller so proxy traffic alone
// is enough to keep the snapshot fresh (no need for the dashboard to be open).
import '../plan-usage-poller'
import { getProvider } from '../providers'
import { getShimSettings } from '../settings'

function openaiErrorBody(
  type: 'invalid_request_error' | 'internal_error' | 'api_error' | 'authentication_error',
  message: string,
): { error: { message: string; type: string } } {
  return { error: { message, type } }
}

interface RecordRequestArgs {
  timestamp: number
  model: string
  provider?: 'codex' | 'anthropic'
  source: 'cursor' | 'error'
  stream: boolean
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  cachedTokens?: number | null
  promptCacheKey?: string | null
  latencyMs?: number | null
  error?: string | null
  requestedModel?: string | null
  appliedModel?: string | null
  toolDefsCount?: number | null
  toolCallCount?: number | null
}

async function recordRequestSafe(args: RecordRequestArgs): Promise<void> {
  try {
    await convex.mutation(api.requests.recordRequest, args)
  } catch (error) {
    // Analytics should never break the proxy.
    logger.warn(`[chat] failed to record request: ${toErrorMessage(error)}`)
  }
}

export async function handleChatCompletions(req: Request): Promise<Response> {
  logRequestDetails(req, 'chat-completions')

  const guard = ipWhitelistGuard(req)
  if (guard) return guard

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  let rawBody: Record<string, unknown>
  try {
    rawBody = (await req.json()) as Record<string, unknown>
  } catch (error) {
    return Response.json(openaiErrorBody('invalid_request_error', toErrorMessage(error)), {
      status: 400,
      headers: corsHeaders(req),
    })
  }

  // Dashboard settings own the active provider + model + effort. Cursor sends
  // a sentinel model name (`shim`); the dashboard is the single source of truth.
  const settings = await getShimSettings()
  const provider = getProvider(settings.activeProvider)

  // Stamp every analytics row with the provider that served the request.
  const record = (args: Omit<RecordRequestArgs, 'provider'>): Promise<void> =>
    recordRequestSafe({ ...args, provider: provider.meta.id })

  // Each provider builds its own upstream body shape from Cursor's raw body
  // and stamps in the dashboard-resolved model + effort.
  const built = provider.translation.buildUpstreamBody(rawBody, {
    model: settings.model,
    effort: settings.reasoningEffort,
  })
  const body = built.body
  const promptCacheKey = built.promptCacheKey
  const source = 'cursor' as const

  // Codex routes by Session_id / Conversation_id headers (not just the body's
  // prompt_cache_key). Reusing the derived stable key across all three pins
  // multi-turn Cursor traffic to the same upstream machine and unlocks real
  // cache hits. streamId stays random — it's an OpenAI-side response identifier.
  const sessionId = promptCacheKey
  const conversationId = promptCacheKey
  const streamId = `chatcmpl-${crypto.randomUUID()}`
  const { toolDefsCount, requestedModel, appliedModel } = built
  logger.debug(
    `[chat] provider=${provider.meta.id} model="${requestedModel}" → "${appliedModel}" items=${built.inputItemCount} tools=${toolDefsCount} instrLen=${built.systemPromptLen} cacheKey=${promptCacheKey}`,
  )

  const wantsStream = rawBody.stream !== false
  const streamOptions =
    typeof rawBody.stream_options === 'object' && rawBody.stream_options !== null
      ? (rawBody.stream_options as Record<string, unknown>)
      : null
  const includeUsage = streamOptions?.include_usage === true
  const reportedModel = requestedModel || appliedModel

  const startedAt = performance.now()

  // Every failure path records the same metadata shape — only the error string
  // and the stream flag differ.
  const recordError = (error: string, stream: boolean): Promise<void> =>
    record({
      timestamp: Date.now(),
      model: appliedModel,
      source: 'error',
      stream,
      latencyMs: Math.round(performance.now() - startedAt),
      error,
      requestedModel,
      appliedModel,
      toolDefsCount,
    })

  let upstream: Response
  try {
    upstream = await provider.upstream.postChatRequest({
      body,
      sessionId,
      conversationId,
    })
  } catch (error) {
    const message = toErrorMessage(error)
    logger.error(`[chat] upstream transport failure: ${message}`)
    await recordError(message, wantsStream)
    return Response.json(openaiErrorBody('api_error', message), {
      status: 502,
      headers: corsHeaders(req),
    })
  }

  if (!upstream.ok) {
    const errorText = await upstream
      .clone()
      .text()
      .catch(() => 'unable to read upstream error body')
    logger.error(`[chat] upstream ${upstream.status}: ${errorText.substring(0, 2000)}`)
    await recordError(`${upstream.status} ${errorText.substring(0, 200)}`, wantsStream)
    return Response.json(
      openaiErrorBody(
        upstream.status === 401 ? 'authentication_error' : 'api_error',
        `upstream ${upstream.status}: ${errorText.substring(0, 500)}`,
      ),
      { status: upstream.status, headers: corsHeaders(req) },
    )
  }

  if (!upstream.body) {
    return Response.json(openaiErrorBody('api_error', 'upstream returned no body'), {
      status: 502,
      headers: corsHeaders(req),
    })
  }

  logger.debug(`[chat] upstream ${upstream.status} stream=${wantsStream}`)

  if (wantsStream) {
    const responseHeaders = new Headers(corsHeaders(req))
    responseHeaders.set('Content-Type', 'text/event-stream')
    responseHeaders.set('Cache-Control', 'no-cache')
    responseHeaders.set('Connection', 'keep-alive')
    responseHeaders.set('X-Accel-Buffering', 'no')

    // Even when forwarding the upstream body verbatim, we still translate the
    // upstream SSE → chat.completion.chunk because Cursor's BYOK parser only
    // accepts Chat Completions wire format on the output side.
    const translated = provider.translation.createOpenAIStream(upstream.body, {
      streamId,
      reportedModel,
      includeUsage,
      providerContext: built.streamContext,
      onUsage: (usage) => {
        logger.debug(
          `[chat] stream completed in=${usage.promptTokens} out=${usage.completionTokens} cached=${usage.cachedTokens}`,
        )
        void record({
          timestamp: Date.now(),
          model: appliedModel,
          source,
          stream: true,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          cachedTokens: usage.cachedTokens,
          promptCacheKey,
          latencyMs: Math.round(performance.now() - startedAt),
          requestedModel,
          appliedModel,
          toolDefsCount,
        })
      },
      onError: (message) => {
        logger.error(`[chat] stream error: ${message}`)
      },
    })

    return new Response(translated, { headers: responseHeaders })
  }

  // Non-stream path — buffer the SSE and emit a single chat.completion JSON.
  const result = await provider.translation.bufferToCompletion(upstream.body, {
    streamId,
    reportedModel,
    providerContext: built.streamContext,
  })

  if ('error' in result) {
    await recordError(result.error, false)
    return Response.json(openaiErrorBody('api_error', result.error), {
      status: 502,
      headers: corsHeaders(req),
    })
  }

  await record({
    timestamp: Date.now(),
    model: appliedModel,
    source,
    stream: false,
    inputTokens: result.usage.promptTokens,
    outputTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
    cachedTokens: result.usage.cachedTokens,
    promptCacheKey,
    latencyMs: Math.round(performance.now() - startedAt),
    requestedModel,
    appliedModel,
    toolDefsCount,
    toolCallCount: result.toolCallCount,
  })

  return Response.json(result.completion, { headers: corsHeaders(req) })
}
