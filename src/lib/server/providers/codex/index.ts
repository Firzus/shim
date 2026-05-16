// Codex provider — assembles the `Provider` value object from the existing
// Codex-specific modules (OAuth, upstream client, Responses translation).

import { toErrorMessage } from '../../logger'
import { SSELineBuffer } from '../../translation/sse-parser'
import type {
  BufferToCompletionOptions,
  BufferToCompletionResult,
  BuiltUpstreamRequest,
  ChatRequestOptions,
  Provider,
  ResolvedModelSettings,
  StreamOptions,
} from '../types'
import { fetchPlanUsage, postCodexResponses } from './client'
import { CODEX_REDIRECT_PORT } from './constants'
import { clearCachedToken, exchangeCode, getAuthorizationURL } from './oauth'
import { ACCEPTED_CODEX_MODELS } from './translation/model-map'
import { buildCodexFromResponsesBody } from './translation/responses-passthrough'
import {
  applyEventToBuffer,
  bufferToCompletion as aggregateBuffer,
  freshBuffer,
} from './translation/responses-to-chat'
import { createOpenAIStreamFromCodex } from './translation/stream-translator'

const ACCEPTED_EFFORTS = ['low', 'medium', 'high', 'extra-high'] as const

function buildUpstreamBody(
  rawBody: Record<string, unknown>,
  settings: ResolvedModelSettings,
): BuiltUpstreamRequest {
  const passthrough = buildCodexFromResponsesBody(rawBody)
  const body = passthrough.body

  // Dashboard settings own model + reasoning effort. Cursor's `model` is a
  // sentinel; the dashboard is the single source of truth.
  body.model = settings.model
  const existingReasoning = (body.reasoning as Record<string, unknown> | undefined) ?? {}
  body.reasoning = { ...existingReasoning, effort: settings.effort }

  return {
    body,
    promptCacheKey: passthrough.promptCacheKey,
    requestedModel: passthrough.modelMapping.requested,
    appliedModel: settings.model,
    inputItemCount: passthrough.inputItemCount,
    systemPromptLen: passthrough.systemPromptLen,
    toolDefsCount: Array.isArray(body.tools) ? body.tools.length : 0,
  }
}

async function bufferToCompletion(
  upstream: ReadableStream<Uint8Array>,
  opts: BufferToCompletionOptions,
): Promise<BufferToCompletionResult> {
  const reader = upstream.getReader()
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
    return { error: toErrorMessage(error) }
  }

  if (buffer.errored) return { error: buffer.errored }

  const completion = aggregateBuffer(buffer, opts.reportedModel, opts.streamId)
  return {
    completion,
    usage: {
      promptTokens: completion.usage.prompt_tokens,
      completionTokens: completion.usage.completion_tokens,
      totalTokens: completion.usage.total_tokens,
      cachedTokens: completion.usage.prompt_tokens_details?.cached_tokens ?? 0,
    },
    toolCallCount: completion.choices[0]?.message.tool_calls?.length ?? 0,
  }
}

export const codexProvider: Provider = {
  meta: {
    id: 'codex',
    displayName: 'ChatGPT / Codex',
    defaultModel: 'gpt-5.5',
    defaultEffort: 'high',
    allowedModels: ACCEPTED_CODEX_MODELS,
    allowedEfforts: ACCEPTED_EFFORTS,
  },
  oauth: {
    redirectStrategy: 'loopback',
    loopbackPort: CODEX_REDIRECT_PORT,
    loopbackCallbackPath: '/auth/callback',
    getAuthorizationURL,
    async exchangeCode(code, codeVerifier) {
      await exchangeCode(code, codeVerifier)
    },
  },
  upstream: {
    usageStrategy: 'poll',
    postChatRequest(opts: ChatRequestOptions): Promise<Response> {
      return postCodexResponses({
        body: opts.body,
        sessionId: opts.sessionId,
        conversationId: opts.conversationId,
        signal: opts.signal,
      })
    },
    fetchPlanUsage(): Promise<Response> {
      return fetchPlanUsage()
    },
  },
  translation: {
    buildUpstreamBody,
    createOpenAIStream(upstream: ReadableStream<Uint8Array>, opts: StreamOptions) {
      return createOpenAIStreamFromCodex(upstream, opts)
    },
    bufferToCompletion,
  },
  clearCachedToken,
}
