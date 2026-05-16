// Anthropic SSE → OpenAI `chat.completion.chunk` SSE translator.
// Ported from the claude-code-to-cursor prototype's stream-handler.ts.

import { logger, toErrorMessage } from '../../../logger'
import { SSELineBuffer } from '../../../translation/sse-parser'
import type { NormalizedUsage, StreamOptions } from '../../types'
import { TURN_MARKER } from '../constants'
import {
  computeOpenAIUsage,
  createOpenAIErrorStream,
  createOpenAIErrorTail,
  createOpenAIStreamChunk,
  createOpenAIStreamStart,
  createOpenAIStreamUsageChunk,
  createOpenAIToolCallChunk,
} from './chunks'
import { formatInternalToolContent } from './internal-tools'
import { stripMcpPrefix } from './request-normalization'
import { type AnthropicStreamEvent, userToolNamesFrom } from './stream-context'

const HEARTBEAT_INTERVAL = 5000

export function createOpenAIStreamFromAnthropic(
  upstream: ReadableStream<Uint8Array>,
  opts: StreamOptions,
): ReadableStream<Uint8Array> {
  const { streamId, reportedModel: model, onUsage, onError } = opts
  const userToolNames = userToolNamesFrom(opts.providerContext)
  const encoder = new TextEncoder()
  const reader = upstream.getReader()

  let cancelled = false
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  const stopHeartbeat = (): void => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let sentStart = false
      let lastChunkTime = Date.now()
      let blockTextSent = false
      let toolCallIndex = 0
      let currentToolCall: { id: string; name: string; inputJson: string } | null = null
      let inInternalToolCall = false
      let internalToolCallJson = ''
      let internalToolCallName = ''
      let inThinkingBlock = false
      let inTextThinkingTag = false
      let textTagBuffer = ''
      let turnMarkerSuffix = ''
      let turnMarkerStopped = false
      let usageInputTokens = 0
      let usageOutputTokens = 0
      let usageCacheReadTokens = 0
      let messageStopped = false
      let thinkingCharsAccum = 0

      let onUsageFired = false
      const fireOnUsage = (): void => {
        if (onUsageFired) return
        onUsageFired = true
        const usage: NormalizedUsage = {
          promptTokens: usageInputTokens,
          completionTokens: usageOutputTokens,
          totalTokens: usageInputTokens + usageOutputTokens,
          cachedTokens: usageCacheReadTokens,
        }
        onUsage?.(usage)
      }

      const safeEnqueue = (text: string): void => {
        try {
          if (cancelled) return
          controller.enqueue(encoder.encode(text))
        } catch {
          cancelled = true
        }
      }

      heartbeatTimer = setInterval(() => {
        if (cancelled || messageStopped) {
          stopHeartbeat()
          return
        }
        if (Date.now() - lastChunkTime >= HEARTBEAT_INTERVAL) {
          safeEnqueue(': heartbeat\n\n')
          lastChunkTime = Date.now()
        }
      }, HEARTBEAT_INTERVAL)

      const ensureStart = (): void => {
        if (!sentStart) {
          safeEnqueue(createOpenAIStreamStart(streamId, model))
          sentStart = true
        }
      }

      const handleTextDelta = (text: string): void => {
        if (blockTextSent || turnMarkerStopped) return
        ensureStart()

        // Fast path: plain text with no `<` — only scan for the turn marker.
        let output = ''
        if (!inTextThinkingTag && textTagBuffer.length === 0 && !text.includes('<')) {
          output = text
          for (let ci = 0; ci < text.length; ci++) {
            turnMarkerSuffix = (turnMarkerSuffix + text.charAt(ci)).slice(-TURN_MARKER.length)
            if (turnMarkerSuffix === TURN_MARKER) {
              if (output.endsWith(TURN_MARKER)) output = output.slice(0, -TURN_MARKER.length)
              turnMarkerStopped = true
              break
            }
          }
          if (output.length > 0) {
            safeEnqueue(createOpenAIStreamChunk(streamId, model, output))
            lastChunkTime = Date.now()
          }
          return
        }

        // <thinking>…</thinking> tag filter state machine.
        for (let ci = 0; ci < text.length; ci++) {
          const ch = text.charAt(ci)
          if (inTextThinkingTag) {
            textTagBuffer += ch
            if (textTagBuffer.endsWith('</thinking>')) {
              inTextThinkingTag = false
              textTagBuffer = ''
            }
            continue
          }
          if (textTagBuffer.length > 0) {
            textTagBuffer += ch
            const target = '<thinking>'
            if (target.startsWith(textTagBuffer)) {
              if (textTagBuffer === target) {
                inTextThinkingTag = true
                textTagBuffer = ''
              }
            } else {
              output += textTagBuffer
              textTagBuffer = ''
            }
            continue
          }
          if (ch === '<') {
            textTagBuffer = '<'
          } else {
            output += ch
          }
          turnMarkerSuffix = (turnMarkerSuffix + ch).slice(-TURN_MARKER.length)
          if (turnMarkerSuffix === TURN_MARKER) {
            if (output.endsWith(TURN_MARKER)) output = output.slice(0, -TURN_MARKER.length)
            turnMarkerStopped = true
            break
          }
        }
        if (output.length > 0) {
          safeEnqueue(createOpenAIStreamChunk(streamId, model, output))
          lastChunkTime = Date.now()
        }
      }

      const handleEvent = (event: AnthropicStreamEvent): void => {
        if (event.type === 'error') {
          const errorMessage = event.error?.message ?? 'Unknown API error'
          logger.error(`[anthropic] stream error: ${errorMessage}`)
          onError?.(errorMessage)
          safeEnqueue(
            sentStart
              ? createOpenAIErrorTail(streamId, model, errorMessage)
              : createOpenAIErrorStream(streamId, model, errorMessage),
          )
          sentStart = true
          messageStopped = true
          lastChunkTime = Date.now()
          return
        }

        if (event.type === 'message_start') {
          ensureStart()
          const usage = event.message?.usage
          if (usage?.input_tokens !== undefined) {
            usageCacheReadTokens = usage.cache_read_input_tokens ?? 0
            usageInputTokens =
              usage.input_tokens + usageCacheReadTokens + (usage.cache_creation_input_tokens ?? 0)
          }
          return
        }

        if (event.type === 'content_block_start') {
          ensureStart()
          blockTextSent = false
          const block = event.content_block
          if (block?.type === 'thinking') {
            inThinkingBlock = true
            return
          }
          inThinkingBlock = false
          if (block?.type === 'tool_use') {
            const toolName = stripMcpPrefix(block.name)
            if (userToolNames.has(toolName)) {
              currentToolCall = { id: block.id ?? '', name: toolName, inputJson: '' }
              safeEnqueue(
                createOpenAIToolCallChunk(
                  streamId,
                  model,
                  toolCallIndex,
                  block.id,
                  toolName,
                  undefined,
                  null,
                ),
              )
            } else {
              inInternalToolCall = true
              internalToolCallJson = ''
              internalToolCallName = toolName
            }
          }
          return
        }

        if (event.type === 'content_block_stop') {
          if (inThinkingBlock) {
            inThinkingBlock = false
            return
          }
          if (inInternalToolCall) {
            inInternalToolCall = false
            let extractedText: string | null = null
            try {
              const parsed = internalToolCallJson ? JSON.parse(internalToolCallJson) : null
              extractedText = formatInternalToolContent(internalToolCallName, parsed)
            } catch {
              // unparseable internal tool payload — emit nothing
            }
            if (extractedText) {
              ensureStart()
              safeEnqueue(createOpenAIStreamChunk(streamId, model, extractedText))
              lastChunkTime = Date.now()
            }
            internalToolCallJson = ''
            internalToolCallName = ''
            blockTextSent = false
            return
          }
          if (currentToolCall) {
            if (!currentToolCall.inputJson) {
              safeEnqueue(
                createOpenAIToolCallChunk(
                  streamId,
                  model,
                  toolCallIndex,
                  undefined,
                  undefined,
                  '{}',
                  null,
                ),
              )
            }
            toolCallIndex++
            currentToolCall = null
          }
          blockTextSent = false
          turnMarkerSuffix = ''
          turnMarkerStopped = false
          return
        }

        if (event.type === 'content_block_delta') {
          const delta = event.delta
          if (inThinkingBlock) {
            if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
              thinkingCharsAccum += delta.thinking.length
            }
            return
          }
          if (inInternalToolCall) {
            if (delta?.type === 'input_json_delta' && delta.partial_json) {
              internalToolCallJson += delta.partial_json
            }
            return
          }
          if (delta?.type === 'input_json_delta' && currentToolCall) {
            const jsonChunk = delta.partial_json ?? ''
            currentToolCall.inputJson += jsonChunk
            if (jsonChunk) {
              safeEnqueue(
                createOpenAIToolCallChunk(
                  streamId,
                  model,
                  toolCallIndex,
                  undefined,
                  undefined,
                  jsonChunk,
                  null,
                ),
              )
              lastChunkTime = Date.now()
            }
            return
          }
          if (typeof delta?.text === 'string') {
            handleTextDelta(delta.text)
          }
          return
        }

        if (event.type === 'message_delta') {
          if (event.usage?.output_tokens !== undefined) {
            usageOutputTokens = event.usage.output_tokens
          }
          return
        }

        if (event.type === 'message_stop') {
          messageStopped = true
          const finishReason = toolCallIndex > 0 ? 'tool_calls' : 'stop'
          const reasoningFromStream = Math.ceil(thinkingCharsAccum / 4)
          safeEnqueue(
            createOpenAIStreamChunk(
              streamId,
              model,
              undefined,
              finishReason,
              computeOpenAIUsage(
                usageInputTokens,
                usageOutputTokens,
                usageCacheReadTokens,
                reasoningFromStream,
              ),
            ),
          )
          safeEnqueue(
            createOpenAIStreamUsageChunk(
              streamId,
              model,
              usageInputTokens,
              usageOutputTokens,
              usageCacheReadTokens,
              reasoningFromStream,
            ),
          )
          safeEnqueue('data: [DONE]\n\n')
          fireOnUsage()
        }
      }

      const sse = new SSELineBuffer()
      const decoder = new TextDecoder('utf-8')
      try {
        while (true) {
          if (cancelled) break
          const { done, value } = await reader.read()
          if (done) {
            if (!messageStopped) {
              const reasoningFromStream = Math.ceil(thinkingCharsAccum / 4)
              safeEnqueue(
                createOpenAIStreamUsageChunk(
                  streamId,
                  model,
                  usageInputTokens,
                  usageOutputTokens,
                  usageCacheReadTokens,
                  reasoningFromStream,
                ),
              )
              safeEnqueue('data: [DONE]\n\n')
              fireOnUsage()
            }
            break
          }
          const chunk = decoder.decode(value, { stream: true })
          for (const parsed of sse.push(chunk)) {
            if (cancelled) break
            handleEvent(parsed.event as unknown as AnthropicStreamEvent)
          }
        }
        for (const parsed of sse.flush()) {
          if (cancelled) break
          handleEvent(parsed.event as unknown as AnthropicStreamEvent)
        }
      } catch (error) {
        if (!cancelled) {
          const message = toErrorMessage(error)
          logger.error(`[anthropic] stream processing failed: ${message}`)
          onError?.(message)
          safeEnqueue(
            sentStart
              ? createOpenAIErrorTail(streamId, model, message)
              : createOpenAIErrorStream(streamId, model, message),
          )
        }
      } finally {
        stopHeartbeat()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
    },
    cancel(reason) {
      logger.debug(`[anthropic] stream cancelled: ${toErrorMessage(reason)}`)
      cancelled = true
      stopHeartbeat()
      reader.cancel(reason).catch(() => {})
    },
  })
}
