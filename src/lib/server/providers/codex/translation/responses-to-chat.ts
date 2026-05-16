// Reverse direction: aggregate a fully-buffered Codex Responses stream into
// a single non-streaming chat.completion JSON. Used when Cursor sends
// `stream: false` (rare, but we need to be spec-conform).

import {
  type CodexStreamEvent,
  getEventError,
  getEventItem,
  getEventResponse,
  getEventString,
  isFunctionCallItem,
} from './types'

export interface AggregatedChatCompletion {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: 'stop' | 'tool_calls' | 'length'
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: { cached_tokens: number }
  }
}

interface PendingToolCall {
  id: string
  name: string
  args: string
  order: number
}

export interface BufferedStream {
  textBuffer: string
  toolCalls: Map<string, PendingToolCall>
  responseId: string | null
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    cached_tokens: number
  }
  errored: string | null
}

export function freshBuffer(): BufferedStream {
  return {
    textBuffer: '',
    toolCalls: new Map(),
    responseId: null,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0 },
    errored: null,
  }
}

export function applyEventToBuffer(buf: BufferedStream, event: CodexStreamEvent): void {
  if (event.type === 'response.created') {
    const response = getEventResponse(event)
    if (response?.id) buf.responseId = response.id
    return
  }
  if (event.type === 'response.output_text.delta') {
    const delta = getEventString(event, 'delta')
    if (delta) buf.textBuffer += delta
    return
  }
  if (event.type === 'response.output_item.added') {
    const item = getEventItem(event)
    if (!isFunctionCallItem(item)) return
    if (!buf.toolCalls.has(item.call_id)) {
      buf.toolCalls.set(item.call_id, {
        id: item.call_id,
        name: item.name,
        args: item.arguments ?? '',
        order: buf.toolCalls.size,
      })
    }
    return
  }
  if (event.type === 'response.function_call_arguments.delta') {
    const id = getEventString(event, 'call_id') ?? getEventString(event, 'item_id')
    const delta = getEventString(event, 'delta')
    if (!id || delta === undefined) return
    const existing = buf.toolCalls.get(id)
    if (existing) existing.args += delta
    return
  }
  if (event.type === 'response.completed') {
    const response = getEventResponse(event)
    const usage = response?.usage
    if (usage) {
      buf.usage.prompt_tokens = usage.input_tokens ?? 0
      buf.usage.completion_tokens = usage.output_tokens ?? 0
      buf.usage.total_tokens =
        usage.total_tokens ?? buf.usage.prompt_tokens + buf.usage.completion_tokens
      buf.usage.cached_tokens = usage.input_tokens_details?.cached_tokens ?? 0
    }
    return
  }
  if (event.type === 'response.error') {
    const err = getEventError(event)
    buf.errored = err?.message ?? 'unknown upstream error'
  }
}

export function bufferToCompletion(
  buf: BufferedStream,
  model: string,
  streamId: string,
): AggregatedChatCompletion {
  const tools = Array.from(buf.toolCalls.values())
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      id: t.id,
      type: 'function' as const,
      function: { name: t.name, arguments: t.args },
    }))

  const hasTools = tools.length > 0
  const text = buf.textBuffer

  return {
    id: streamId,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text ? text : null,
          ...(hasTools ? { tool_calls: tools } : {}),
        },
        finish_reason: hasTools ? 'tool_calls' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: buf.usage.prompt_tokens,
      completion_tokens: buf.usage.completion_tokens,
      total_tokens: buf.usage.total_tokens,
      ...(buf.usage.cached_tokens > 0
        ? { prompt_tokens_details: { cached_tokens: buf.usage.cached_tokens } }
        : {}),
    },
  }
}
