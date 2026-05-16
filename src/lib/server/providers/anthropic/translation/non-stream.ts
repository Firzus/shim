// Non-streaming path: aggregate an Anthropic SSE stream into a single OpenAI
// `chat.completion` JSON. shim always requests `stream: true` upstream, so
// this consumes the same event shape as the streaming translator.

import { toErrorMessage } from '../../../logger'
import { SSELineBuffer } from '../../../translation/sse-parser'
import type { BufferToCompletionOptions, BufferToCompletionResult } from '../../types'
import { TURN_MARKER } from '../constants'
import { formatInternalToolContent } from './internal-tools'
import { stripMcpPrefix } from './request-normalization'
import { type AnthropicStreamEvent, userToolNamesFrom } from './stream-context'

interface PendingToolCall {
  id: string
  name: string
  args: string
}

export async function bufferAnthropicToCompletion(
  upstream: ReadableStream<Uint8Array>,
  opts: BufferToCompletionOptions,
): Promise<BufferToCompletionResult> {
  const userToolNames = userToolNamesFrom(opts.providerContext)

  let text = ''
  const toolCalls: PendingToolCall[] = []
  let inThinking = false
  let inInternal = false
  let internalName = ''
  let internalJson = ''
  let currentUserTool: PendingToolCall | null = null
  let usageInput = 0
  let usageOutput = 0
  let usageCacheRead = 0
  let errored: string | null = null

  const handleEvent = (event: AnthropicStreamEvent): void => {
    if (event.type === 'error') {
      errored = event.error?.message ?? 'unknown upstream error'
      return
    }
    if (event.type === 'message_start') {
      const usage = event.message?.usage
      if (usage?.input_tokens !== undefined) {
        usageCacheRead = usage.cache_read_input_tokens ?? 0
        usageInput = usage.input_tokens + usageCacheRead + (usage.cache_creation_input_tokens ?? 0)
      }
      return
    }
    if (event.type === 'content_block_start') {
      const block = event.content_block
      if (block?.type === 'thinking') {
        inThinking = true
        return
      }
      inThinking = false
      if (block?.type === 'tool_use') {
        const toolName = stripMcpPrefix(block.name)
        if (userToolNames.has(toolName)) {
          currentUserTool = { id: block.id ?? '', name: toolName, args: '' }
        } else {
          inInternal = true
          internalName = toolName
          internalJson = ''
        }
      }
      return
    }
    if (event.type === 'content_block_delta') {
      const delta = event.delta
      if (inThinking) return
      if (inInternal) {
        if (delta?.type === 'input_json_delta' && delta.partial_json) {
          internalJson += delta.partial_json
        }
        return
      }
      if (delta?.type === 'input_json_delta' && currentUserTool) {
        currentUserTool.args += delta.partial_json ?? ''
        return
      }
      if (typeof delta?.text === 'string') text += delta.text
      return
    }
    if (event.type === 'content_block_stop') {
      if (inThinking) {
        inThinking = false
        return
      }
      if (inInternal) {
        inInternal = false
        try {
          const parsed = internalJson ? JSON.parse(internalJson) : null
          const extracted = formatInternalToolContent(internalName, parsed)
          if (extracted) text += extracted
        } catch {
          // unparseable internal tool payload — skip
        }
        internalName = ''
        internalJson = ''
        return
      }
      if (currentUserTool) {
        toolCalls.push(currentUserTool)
        currentUserTool = null
      }
      return
    }
    if (event.type === 'message_delta') {
      if (event.usage?.output_tokens !== undefined) usageOutput = event.usage.output_tokens
    }
  }

  const reader = upstream.getReader()
  const decoder = new TextDecoder('utf-8')
  const sse = new SSELineBuffer()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const parsed of sse.push(decoder.decode(value, { stream: true }))) {
        handleEvent(parsed.event as unknown as AnthropicStreamEvent)
      }
    }
    for (const parsed of sse.flush()) {
      handleEvent(parsed.event as unknown as AnthropicStreamEvent)
    }
  } catch (error) {
    return { error: toErrorMessage(error) }
  }

  if (errored) return { error: errored }

  // Strip plain-text <thinking> tags and the legacy turn marker.
  let content = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim()
  const markerIdx = content.indexOf(TURN_MARKER)
  if (markerIdx !== -1) content = content.slice(0, markerIdx).trimEnd()

  const formattedToolCalls = toolCalls.map((t) => ({
    id: t.id,
    type: 'function' as const,
    function: { name: t.name, arguments: t.args || '{}' },
  }))
  const hasTools = formattedToolCalls.length > 0

  const completion = {
    id: opts.streamId,
    object: 'chat.completion' as const,
    created: Math.floor(Date.now() / 1000),
    model: opts.reportedModel,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant' as const,
          content: content || null,
          ...(hasTools ? { tool_calls: formattedToolCalls } : {}),
        },
        finish_reason: hasTools ? ('tool_calls' as const) : ('stop' as const),
      },
    ],
    usage: {
      prompt_tokens: usageInput,
      completion_tokens: usageOutput,
      total_tokens: usageInput + usageOutput,
      ...(usageCacheRead > 0 ? { prompt_tokens_details: { cached_tokens: usageCacheRead } } : {}),
    },
  }

  return {
    completion,
    usage: {
      promptTokens: usageInput,
      completionTokens: usageOutput,
      totalTokens: usageInput + usageOutput,
      cachedTokens: usageCacheRead,
    },
    toolCallCount: formattedToolCalls.length,
  }
}
