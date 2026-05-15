import { api } from '#/../convex/_generated/api'

import { postCodexResponses } from '../codex-client'
import { convex } from '../convex'
import { logger, toErrorMessage } from '../logger'
import { corsHeaders, ipWhitelistGuard, logRequestDetails } from '../middleware'
// Side-effect import: bootstraps the plan-usage poller so proxy traffic alone
// is enough to keep the snapshot fresh (no need for the dashboard to be open).
import '../plan-usage-poller'
import { getShimSettings } from '../settings'
import { buildCodexFromResponsesBody } from '../translation/responses-passthrough'
import {
  applyEventToBuffer,
  bufferToCompletion,
  freshBuffer,
} from '../translation/responses-to-chat'
import { SSELineBuffer } from '../translation/sse-parser'
import { createOpenAIStreamFromCodex } from '../translation/stream-translator'

function openaiErrorBody(
  type: 'invalid_request_error' | 'internal_error' | 'api_error' | 'authentication_error',
  message: string,
): { error: { message: string; type: string } } {
  return { error: { message, type } }
}

interface RecordRequestArgs {
  timestamp: number
  model: string
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

  // Cursor BYOK always sends a Responses-API-shaped body at /v1/chat/completions:
  // `input[]` items with `reasoning.encrypted_content` carry state across turns.
  // Going through a Chat-shape adapter strips that and breaks tool-using prompts,
  // so we forward verbatim.
  const passthrough = buildCodexFromResponsesBody(rawBody)
  const body = passthrough.body
  const promptCacheKey = passthrough.promptCacheKey
  const source = 'cursor' as const

  // Codex routes by Session_id / Conversation_id headers (not just the body's
  // prompt_cache_key). Reusing the derived stable key across all three pins
  // multi-turn Cursor traffic to the same upstream machine and unlocks real
  // cache hits. streamId stays random — it's an OpenAI-side response identifier.
  const sessionId = promptCacheKey
  const conversationId = promptCacheKey
  const streamId = `chatcmpl-${crypto.randomUUID()}`
  const toolDefsCount = Array.isArray(body.tools) ? body.tools.length : 0
  const requestedModel = passthrough.modelMapping.requested
  let appliedModel = passthrough.modelMapping.applied
  const reqModel = typeof rawBody.model === 'string' ? rawBody.model : ''
  logger.debug(
    `[chat] passthrough model="${reqModel}" → "${passthrough.modelMapping.applied}" items=${passthrough.inputItemCount} tools=${toolDefsCount} instrLen=${passthrough.systemPromptLen} cacheKey=${promptCacheKey}`,
  )

  // Dashboard settings own model + effort.
  const settings = await getShimSettings()
  body.model = settings.model
  const existingReasoning = (body.reasoning as Record<string, unknown> | undefined) ?? {}
  const effort = settings.reasoningEffort
  body.reasoning = {
    ...existingReasoning,
    effort,
  }
  appliedModel = settings.model
  logger.debug(`[chat] settings override model=${settings.model} effort=${effort}`)

  const wantsStream = rawBody.stream !== false
  const streamOptions =
    typeof rawBody.stream_options === 'object' && rawBody.stream_options !== null
      ? (rawBody.stream_options as Record<string, unknown>)
      : null
  const includeUsage = streamOptions?.include_usage === true
  const reportedModel = reqModel || appliedModel

  const startedAt = performance.now()

  let upstream: Response
  try {
    upstream = await postCodexResponses({
      body,
      sessionId,
      conversationId,
    })
  } catch (error) {
    const message = toErrorMessage(error)
    logger.error(`[chat] upstream transport failure: ${message}`)
    await recordRequestSafe({
      timestamp: Date.now(),
      model: appliedModel,
      source: 'error',
      stream: wantsStream,
      latencyMs: Math.round(performance.now() - startedAt),
      error: message,
      requestedModel,
      appliedModel,
      toolDefsCount,
    })
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
    await recordRequestSafe({
      timestamp: Date.now(),
      model: appliedModel,
      source: 'error',
      stream: wantsStream,
      latencyMs: Math.round(performance.now() - startedAt),
      error: `${upstream.status} ${errorText.substring(0, 200)}`,
      requestedModel,
      appliedModel,
      toolDefsCount,
    })
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

    // Note: even in passthrough INPUT mode, we still translate Codex's
    // Responses SSE → chat.completion.chunk because Cursor's BYOK parser
    // only accepts Chat Completions wire format on the output side.

    const translated = createOpenAIStreamFromCodex(upstream.body, {
      streamId,
      reportedModel,
      includeUsage,
      onUsage: (usage) => {
        logger.debug(
          `[chat] stream completed in=${usage.promptTokens} out=${usage.completionTokens} cached=${usage.cachedTokens ?? 0}`,
        )
        void recordRequestSafe({
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
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const parser = new SSELineBuffer()
  const buffer = freshBuffer()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const parsed of parser.push(chunk)) applyEventToBuffer(buffer, parsed.event)
    }
    for (const parsed of parser.flush()) applyEventToBuffer(buffer, parsed.event)
  } catch (error) {
    return Response.json(openaiErrorBody('api_error', toErrorMessage(error)), {
      status: 502,
      headers: corsHeaders(req),
    })
  }

  if (buffer.errored) {
    await recordRequestSafe({
      timestamp: Date.now(),
      model: appliedModel,
      source: 'error',
      stream: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: buffer.errored,
      requestedModel,
      appliedModel,
      toolDefsCount,
    })
    return Response.json(openaiErrorBody('api_error', buffer.errored), {
      status: 502,
      headers: corsHeaders(req),
    })
  }

  const completion = bufferToCompletion(buffer, reportedModel, streamId)

  await recordRequestSafe({
    timestamp: Date.now(),
    model: appliedModel,
    source,
    stream: false,
    inputTokens: completion.usage.prompt_tokens,
    outputTokens: completion.usage.completion_tokens,
    totalTokens: completion.usage.total_tokens,
    cachedTokens: completion.usage.prompt_tokens_details?.cached_tokens ?? null,
    promptCacheKey,
    latencyMs: Math.round(performance.now() - startedAt),
    requestedModel,
    appliedModel,
    toolDefsCount,
    toolCallCount: completion.choices[0]?.message.tool_calls?.length ?? 0,
  })

  return Response.json(completion, { headers: corsHeaders(req) })
}
