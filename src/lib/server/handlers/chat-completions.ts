import { api } from '#/../convex/_generated/api'

import { postCodexResponses } from '../codex-client'
import { convex } from '../convex'
import { logger, toErrorMessage } from '../logger'
import { corsHeaders, ipWhitelistGuard, logRequestDetails } from '../middleware'
import { getShimSettings } from '../settings'
import { translateChatToResponses } from '../translation/chat-to-responses'
import { adaptCursorResponsesBody } from '../translation/cursor-input-adapter'
import { buildCodexFromResponsesBody } from '../translation/responses-passthrough'
import {
  applyEventToBuffer,
  bufferToCompletion,
  freshBuffer,
} from '../translation/responses-to-chat'
import { SSELineBuffer } from '../translation/sse-parser'
import { createOpenAIStreamFromCodex } from '../translation/stream-translator'
import type { OpenAIChatRequest } from '../translation/types'

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

  let body: OpenAIChatRequest
  try {
    body = (await req.json()) as OpenAIChatRequest
  } catch (error) {
    return Response.json(openaiErrorBody('invalid_request_error', toErrorMessage(error)), {
      status: 400,
      headers: corsHeaders(req),
    })
  }

  const sessionId = crypto.randomUUID()
  const conversationId = crypto.randomUUID()
  const streamId = `chatcmpl-${sessionId}`

  // Cursor BYOK sends a Responses-API-shaped body at /v1/chat/completions for
  // reasoning models. Detect it and bypass the Chat adapter entirely — going
  // through Chat shape strips reasoning items' encrypted_content, which makes
  // gpt-5.4 lose state and procrastinate forever on tool-using prompts.
  const rawBody = body as unknown as Record<string, unknown>
  const isResponsesShape = !Array.isArray(rawBody.messages) && Array.isArray(rawBody.input)

  let translation: {
    body: Record<string, unknown>
    modelMapping: { requested: string; applied: string }
  }
  let toolDefsCount = 0

  if (isResponsesShape) {
    const passthrough = buildCodexFromResponsesBody(rawBody, sessionId)
    translation = { body: passthrough.body, modelMapping: passthrough.modelMapping }
    toolDefsCount = Array.isArray((passthrough.body as { tools?: unknown }).tools)
      ? (passthrough.body as { tools: unknown[] }).tools.length
      : 0
    const reqModel = typeof rawBody.model === 'string' ? rawBody.model : ''
    logger.info(
      `[chat] passthrough model="${reqModel}" → "${passthrough.modelMapping.applied}" items=${passthrough.inputItemCount} tools=${toolDefsCount} instrLen=${passthrough.systemPromptLen}`,
    )
  } else {
    // Legacy Chat-shape path (used by non-Cursor clients and the dashboard).
    const adapt = adaptCursorResponsesBody(rawBody)
    if (adapt.adapted) {
      logger.info(
        `[chat] adapted Responses-shape body (messages=${body.messages.length} dropped=${adapt.droppedItemCount})`,
      )
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json(
        openaiErrorBody('invalid_request_error', '`messages` array is required and non-empty'),
        { status: 400, headers: corsHeaders(req) },
      )
    }
    const t = translateChatToResponses(body, sessionId)
    translation = {
      body: t.body as unknown as Record<string, unknown>,
      modelMapping: t.modelMapping,
    }
    toolDefsCount = body.tools?.length ?? 0
    logger.info(
      `[chat] model="${body.model}" → "${t.modelMapping.applied}" tools=${toolDefsCount} stream=true messages=${body.messages.length}`,
    )
  }

  // Apply dashboard-driven overrides last so they win over both the Cursor
  // body and the legacy model-map. Sentinel `model: "codex"` is the canonical
  // value users type in Cursor; any other model name is overridden too — the
  // dashboard is the single source of truth.
  //
  // We only stamp `model` and `reasoning.effort`; the rest of the `reasoning`
  // object (summary, generate_summary, etc.) is left as whatever Cursor sent,
  // so its agent-mode defaults still apply.
  const settings = await getShimSettings()
  translation.body.model = settings.model
  if (settings.reasoningEffort === 'none') {
    // Disable reasoning entirely — drop the whole object so Codex defaults
    // to non-thinking mode for this turn.
    delete translation.body.reasoning
  } else {
    const existingReasoning =
      (translation.body.reasoning as Record<string, unknown> | undefined) ?? {}
    translation.body.reasoning = {
      ...existingReasoning,
      effort: settings.reasoningEffort,
    }
  }
  translation.modelMapping = {
    requested: translation.modelMapping.requested,
    applied: settings.model,
  }
  logger.info(`[chat] settings override model=${settings.model} effort=${settings.reasoningEffort}`)

  const wantsStream = body.stream !== false

  const startedAt = performance.now()

  let upstream: Response
  try {
    upstream = await postCodexResponses({
      body: translation.body,
      sessionId,
      conversationId,
    })
  } catch (error) {
    const message = toErrorMessage(error)
    logger.error(`[chat] upstream transport failure: ${message}`)
    await recordRequestSafe({
      timestamp: Date.now(),
      model: translation.modelMapping.applied,
      source: 'error',
      stream: wantsStream,
      latencyMs: Math.round(performance.now() - startedAt),
      error: message,
      requestedModel: translation.modelMapping.requested,
      appliedModel: translation.modelMapping.applied,
      toolDefsCount: body.tools?.length ?? 0,
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
    logger.error(`[chat] upstream ${upstream.status}: ${errorText.substring(0, 500)}`)
    await recordRequestSafe({
      timestamp: Date.now(),
      model: translation.modelMapping.applied,
      source: 'error',
      stream: wantsStream,
      latencyMs: Math.round(performance.now() - startedAt),
      error: `${upstream.status} ${errorText.substring(0, 200)}`,
      requestedModel: translation.modelMapping.requested,
      appliedModel: translation.modelMapping.applied,
      toolDefsCount: body.tools?.length ?? 0,
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

  logger.info(`[chat] upstream ${upstream.status} stream=${wantsStream}`)

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
      reportedModel: body.model || translation.modelMapping.applied,
      includeUsage: body.stream_options?.include_usage === true,
      onUsage: (usage) => {
        logger.info(
          `[chat] stream completed in=${usage.promptTokens} out=${usage.completionTokens} cached=${usage.cachedTokens ?? 0}`,
        )
        void recordRequestSafe({
          timestamp: Date.now(),
          model: translation.modelMapping.applied,
          source: 'cursor',
          stream: true,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          cachedTokens: usage.cachedTokens,
          promptCacheKey: sessionId,
          latencyMs: Math.round(performance.now() - startedAt),
          requestedModel: translation.modelMapping.requested,
          appliedModel: translation.modelMapping.applied,
          toolDefsCount: body.tools?.length ?? 0,
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
      model: translation.modelMapping.applied,
      source: 'error',
      stream: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: buffer.errored,
      requestedModel: translation.modelMapping.requested,
      appliedModel: translation.modelMapping.applied,
      toolDefsCount: body.tools?.length ?? 0,
    })
    return Response.json(openaiErrorBody('api_error', buffer.errored), {
      status: 502,
      headers: corsHeaders(req),
    })
  }

  const completion = bufferToCompletion(
    buffer,
    body.model || translation.modelMapping.applied,
    streamId,
  )

  await recordRequestSafe({
    timestamp: Date.now(),
    model: translation.modelMapping.applied,
    source: 'cursor',
    stream: false,
    inputTokens: completion.usage.prompt_tokens,
    outputTokens: completion.usage.completion_tokens,
    totalTokens: completion.usage.total_tokens,
    cachedTokens: completion.usage.prompt_tokens_details?.cached_tokens ?? null,
    promptCacheKey: sessionId,
    latencyMs: Math.round(performance.now() - startedAt),
    requestedModel: translation.modelMapping.requested,
    appliedModel: translation.modelMapping.applied,
    toolDefsCount: body.tools?.length ?? 0,
    toolCallCount: completion.choices[0]?.message.tool_calls?.length ?? 0,
  })

  return Response.json(completion, { headers: corsHeaders(req) })
}
