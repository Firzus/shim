import type {
  OpenAIChatMessage,
  OpenAIChatRequest,
  OpenAIContentPart,
  OpenAIToolFunctionDef,
} from './types'

// Cursor BYOK sends the Responses API shape (input[] with system/user items,
// content as input_text/output_text parts, function_call / function_call_output
// items, plus Responses-only fields like `store`, `include`, `reasoning`,
// `prompt_cache_retention`) at /v1/chat/completions when the configured model
// is a reasoning model such as gpt-5.4. This adapter rewrites the body in place
// to the Chat Completions shape so the existing chat-to-responses pipeline can
// handle it uniformly.

interface ResponsesInputMessageItem {
  role: 'system' | 'developer' | 'user' | 'assistant'
  content: unknown
  type?: 'message'
}

interface ResponsesFunctionCallItem {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
}

interface ResponsesFunctionCallOutputItem {
  type: 'function_call_output'
  call_id: string
  output: unknown
}

interface ResponsesReasoningItem {
  type: 'reasoning'
  summary?: Array<{ type: string; text?: string }>
  content?: unknown
}

type ResponsesInputItem =
  | ResponsesInputMessageItem
  | ResponsesFunctionCallItem
  | ResponsesFunctionCallOutputItem
  | ResponsesReasoningItem

function isMessageItem(item: unknown): item is ResponsesInputMessageItem {
  if (!item || typeof item !== 'object') return false
  const obj = item as Record<string, unknown>
  return typeof obj.role === 'string'
}

function isFunctionCall(item: unknown): item is ResponsesFunctionCallItem {
  if (!item || typeof item !== 'object') return false
  const obj = item as Record<string, unknown>
  return obj.type === 'function_call' && typeof obj.call_id === 'string'
}

function isFunctionCallOutput(item: unknown): item is ResponsesFunctionCallOutputItem {
  if (!item || typeof item !== 'object') return false
  const obj = item as Record<string, unknown>
  return obj.type === 'function_call_output' && typeof obj.call_id === 'string'
}

function isReasoningItem(item: unknown): item is ResponsesReasoningItem {
  if (!item || typeof item !== 'object') return false
  const obj = item as Record<string, unknown>
  return obj.type === 'reasoning'
}

function extractReasoningText(item: ResponsesReasoningItem): string {
  const summary = item.summary
  if (!Array.isArray(summary)) return ''
  const texts: string[] = []
  for (const s of summary) {
    if (s && typeof s === 'object' && typeof s.text === 'string' && s.text) {
      texts.push(s.text)
    }
  }
  return texts.join('\n')
}

// Cursor sends function_call_output.output as either a plain string OR an
// array of Responses-API content parts (e.g. [{type:"input_text", text:"..."}]).
// Codex Responses requires a string here, and the downstream translator's
// partsToString only handles {type:"text"} — so we flatten everything to a
// single string here.
function normalizeOutput(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    const parts: string[] = []
    for (const raw of output) {
      if (!raw || typeof raw !== 'object') continue
      const p = raw as Record<string, unknown>
      if (typeof p.text === 'string') {
        parts.push(p.text)
        continue
      }
      if (typeof p.output === 'string') {
        parts.push(p.output)
      }
    }
    return parts.join('\n')
  }
  if (output && typeof output === 'object') {
    try {
      return JSON.stringify(output)
    } catch {
      return ''
    }
  }
  return ''
}

function normalizeContent(content: unknown): string | OpenAIContentPart[] {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: OpenAIContentPart[] = []
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    const type = typeof p.type === 'string' ? p.type : ''
    if (type === 'input_text' || type === 'output_text' || type === 'text') {
      if (typeof p.text === 'string') parts.push({ type: 'text', text: p.text })
      continue
    }
    if (type === 'input_image') {
      const url = typeof p.image_url === 'string' ? p.image_url : ''
      if (url) parts.push({ type: 'image_url', image_url: { url } })
    }
  }
  return parts
}

function inputItemToMessage(item: ResponsesInputItem): OpenAIChatMessage | null {
  if (isFunctionCall(item)) {
    return {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: item.call_id,
          type: 'function',
          function: { name: item.name, arguments: item.arguments },
        },
      ],
    }
  }
  if (isFunctionCallOutput(item)) {
    return {
      role: 'tool',
      tool_call_id: item.call_id,
      content: normalizeOutput(item.output),
    }
  }
  if (isReasoningItem(item)) {
    // Codex's Responses API carries the model's between-turn reasoning here.
    // We can't forward it natively through the Chat shape, but converting the
    // summary into an assistant text message keeps the model anchored on its
    // prior plan (without it, gpt-5.4 procrastinates: "I will edit..." every
    // turn but never emits the tool_call).
    const text = extractReasoningText(item)
    if (!text) return null
    return { role: 'assistant', content: text }
  }
  if (isMessageItem(item)) {
    const content = normalizeContent(item.content)
    if (item.role === 'system' || item.role === 'developer') {
      return { role: item.role, content }
    }
    if (item.role === 'user') {
      return { role: 'user', content }
    }
    if (item.role === 'assistant') {
      return { role: 'assistant', content }
    }
  }
  return null
}

export interface AdaptResult {
  adapted: boolean
  droppedItemCount: number
}

function normalizeTools(rawTools: unknown): OpenAIToolFunctionDef[] | undefined {
  if (!Array.isArray(rawTools)) return undefined
  const out: OpenAIToolFunctionDef[] = []
  for (const raw of rawTools) {
    if (!raw || typeof raw !== 'object') continue
    const t = raw as Record<string, unknown>
    // Chat-shape: already nested under `function`. Pass through.
    if (t.function && typeof t.function === 'object') {
      const fn = t.function as Record<string, unknown>
      if (typeof fn.name === 'string') {
        out.push({
          type: 'function',
          function: {
            name: fn.name,
            description: typeof fn.description === 'string' ? fn.description : undefined,
            parameters:
              fn.parameters && typeof fn.parameters === 'object'
                ? (fn.parameters as Record<string, unknown>)
                : undefined,
          },
        })
      }
      continue
    }
    // Responses-shape: flat. Re-nest under `function`.
    if (typeof t.name === 'string') {
      out.push({
        type: 'function',
        function: {
          name: t.name,
          description: typeof t.description === 'string' ? t.description : undefined,
          parameters:
            t.parameters && typeof t.parameters === 'object'
              ? (t.parameters as Record<string, unknown>)
              : undefined,
        },
      })
    }
  }
  return out.length > 0 ? out : undefined
}

export function adaptCursorResponsesBody(body: Record<string, unknown>): AdaptResult {
  if (Array.isArray((body as { messages?: unknown }).messages)) {
    return { adapted: false, droppedItemCount: 0 }
  }
  const input = (body as { input?: unknown }).input
  if (!Array.isArray(input)) {
    return { adapted: false, droppedItemCount: 0 }
  }

  const messages: OpenAIChatMessage[] = []
  let dropped = 0
  for (const item of input) {
    const msg = inputItemToMessage(item as ResponsesInputItem)
    if (msg) messages.push(msg)
    else dropped += 1
  }

  const tools = normalizeTools((body as { tools?: unknown }).tools)

  const out = body as unknown as OpenAIChatRequest
  out.messages = messages
  if (tools) out.tools = tools
  else delete (body as Record<string, unknown>).tools

  delete (body as Record<string, unknown>).input
  // Responses-only fields the Chat pipeline does not consume.
  delete (body as Record<string, unknown>).store
  delete (body as Record<string, unknown>).include
  delete (body as Record<string, unknown>).reasoning
  delete (body as Record<string, unknown>).prompt_cache_retention
  delete (body as Record<string, unknown>).metadata

  return { adapted: true, droppedItemCount: dropped }
}
