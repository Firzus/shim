import { SSELineBuffer } from './sse-parser'
import {
  type CodexStreamEvent,
  getEventError,
  getEventItem,
  getEventResponse,
  getEventString,
  isFunctionCallItem,
} from './types'

// Translate a Codex Responses SSE stream into an OpenAI chat.completion.chunk
// SSE stream, in real time. Returns a ReadableStream of Uint8Array suitable
// for `new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })`.

export interface UsageSnapshot {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
}

type OpenAIDelta =
  | { role?: 'assistant'; content?: string }
  | {
      tool_calls: Array<{
        index: number
        id?: string
        type?: 'function'
        function: { name?: string; arguments?: string }
      }>
    }

interface ChunkPayload {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{ index: 0; delta: OpenAIDelta; finish_reason: null | 'stop' | 'tool_calls' }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: { cached_tokens: number }
  }
}

const encoder = new TextEncoder()

function sseLine(payload: ChunkPayload): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
}

const DONE_FRAME = encoder.encode('data: [DONE]\n\n')

interface ToolCallTracker {
  index: number
}

export interface StreamTranslatorOptions {
  streamId: string
  reportedModel: string
  includeUsage?: boolean
  onUsage?: (usage: UsageSnapshot) => void
  onError?: (message: string) => void
}

export function createOpenAIStreamFromCodex(
  upstream: ReadableStream<Uint8Array>,
  opts: StreamTranslatorOptions,
): ReadableStream<Uint8Array> {
  const { streamId, reportedModel, includeUsage = false, onUsage, onError } = opts
  const created = Math.floor(Date.now() / 1000)
  const toolCalls = new Map<string, ToolCallTracker>()
  let openedAssistant = false
  let finishReason: 'stop' | 'tool_calls' | null = null

  function buildChunk(
    delta: OpenAIDelta,
    finish: ChunkPayload['choices'][0]['finish_reason'],
  ): ChunkPayload {
    return {
      id: streamId,
      object: 'chat.completion.chunk',
      created,
      model: reportedModel,
      choices: [{ index: 0, delta, finish_reason: finish }],
    }
  }

  function emitRoleHeader(controller: ReadableStreamDefaultController<Uint8Array>): void {
    if (openedAssistant) return
    openedAssistant = true
    controller.enqueue(sseLine(buildChunk({ role: 'assistant', content: '' }, null)))
  }

  function handleEvent(
    event: CodexStreamEvent,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): void {
    if (event.type === 'response.output_text.delta') {
      const delta = getEventString(event, 'delta')
      if (!delta) return
      emitRoleHeader(controller)
      controller.enqueue(sseLine(buildChunk({ content: delta }, null)))
      if (!finishReason) finishReason = 'stop'
      return
    }
    if (event.type === 'response.output_item.added') {
      const item = getEventItem(event)
      const isCustomToolCall =
        !!item &&
        typeof item === 'object' &&
        (item as Record<string, unknown>).type === 'custom_tool_call'
      if (!isFunctionCallItem(item) && !isCustomToolCall) return
      emitRoleHeader(controller)
      const itemObj = item as Record<string, unknown>
      const callId = typeof itemObj.call_id === 'string' ? itemObj.call_id : ''
      const itemId = typeof itemObj.id === 'string' ? itemObj.id : ''
      const name = typeof itemObj.name === 'string' ? itemObj.name : ''
      // Codex emits two flavors of tool invocations:
      //   - function_call (JSON-schema tools): initial `arguments` field +
      //     streaming function_call_arguments.delta events.
      //   - custom_tool_call (freeform input tools like ApplyPatch): initial
      //     `input` field + streaming custom_tool_call_input.delta events.
      // Both map to OpenAI Chat tool_calls. For custom tools, the streamed
      // input becomes `function.arguments` verbatim (no JSON wrap) — Cursor's
      // BYOK parser hands that string straight to its tool implementation.
      const initialArgs = isCustomToolCall
        ? typeof itemObj.input === 'string'
          ? itemObj.input
          : ''
        : typeof itemObj.arguments === 'string'
          ? itemObj.arguments
          : ''
      if (!callId || toolCalls.has(callId)) return
      const index = toolCalls.size
      const tracker: ToolCallTracker = { index }
      toolCalls.set(callId, tracker)
      // Codex delta events reference the item by `item_id` (fc_* or ctc_*),
      // not `call_id` (call_*). Index the same tracker under both.
      if (itemId && itemId !== callId) toolCalls.set(itemId, tracker)
      controller.enqueue(
        sseLine(
          buildChunk(
            {
              tool_calls: [
                {
                  index,
                  id: callId,
                  type: 'function',
                  function: { name, arguments: initialArgs },
                },
              ],
            },
            null,
          ),
        ),
      )
      finishReason = 'tool_calls'
      return
    }
    if (
      event.type === 'response.function_call_arguments.delta' ||
      event.type === 'response.custom_tool_call_input.delta'
    ) {
      const itemId = getEventString(event, 'item_id')
      const callId = getEventString(event, 'call_id')
      const lookupId = (itemId && toolCalls.has(itemId) ? itemId : callId) ?? itemId
      const delta = getEventString(event, 'delta')
      if (!lookupId || delta === undefined) return
      const tracker = toolCalls.get(lookupId)
      if (!tracker) {
        if (onError) onError(`stream: delta for unknown tool_call ${lookupId}`)
        return
      }
      controller.enqueue(
        sseLine(
          buildChunk(
            { tool_calls: [{ index: tracker.index, function: { arguments: delta } }] },
            null,
          ),
        ),
      )
      finishReason = 'tool_calls'
      return
    }
    if (event.type === 'response.completed') {
      const response = getEventResponse(event)
      const usage = response?.usage
      if (usage && onUsage) {
        onUsage({
          promptTokens: usage.input_tokens ?? 0,
          completionTokens: usage.output_tokens ?? 0,
          totalTokens: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
          cachedTokens: usage.input_tokens_details?.cached_tokens ?? 0,
        })
      }
      const finishChunk = buildChunk({}, finishReason ?? 'stop')
      if (includeUsage && usage) {
        finishChunk.usage = {
          prompt_tokens: usage.input_tokens ?? 0,
          completion_tokens: usage.output_tokens ?? 0,
          total_tokens:
            usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
          ...(usage.input_tokens_details?.cached_tokens
            ? {
                prompt_tokens_details: { cached_tokens: usage.input_tokens_details.cached_tokens },
              }
            : {}),
        }
      }
      controller.enqueue(sseLine(finishChunk))
      return
    }
    if (event.type === 'response.error') {
      const err = getEventError(event)
      const message = err?.message ?? 'unknown upstream error'
      if (onError) onError(message)
      controller.enqueue(
        sseLine(buildChunk({ content: `\n\n[upstream error] ${message}` }, 'stop')),
      )
    }
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader()
      const decoder = new TextDecoder('utf-8')
      const buffer = new SSELineBuffer()
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const events = buffer.push(chunk)
          for (const parsed of events) handleEvent(parsed.event, controller)
        }
        for (const parsed of buffer.flush()) handleEvent(parsed.event, controller)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (onError) onError(message)
        controller.enqueue(
          sseLine(buildChunk({ content: `\n\n[stream error] ${message}` }, 'stop')),
        )
      } finally {
        controller.enqueue(DONE_FRAME)
        controller.close()
      }
    },
  })
}
