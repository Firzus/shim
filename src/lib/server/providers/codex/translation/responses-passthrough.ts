import { deriveCacheKey } from '../../../translation/cache-key'
import { mapToCodexModel, type ModelMappingResult } from './model-map'

// Cursor BYOK sends a Responses-API-shaped body at /v1/chat/completions when
// the model is a reasoning model (gpt-5.4 today). The body already contains
// everything Codex expects — including `reasoning` items with
// `encrypted_content` that preserve the model's between-turn state.
//
// Going through our Chat-shape adapter loses that state (encrypted_content
// has no Chat equivalent), which makes gpt-5.4 procrastinate: it emits
// reasoning between turns but never commits the tool_call. The passthrough
// path forwards the input[] verbatim and only fixes up the fields Codex
// requires us to control (model allowlist, instructions split, store=false,
// prompt_cache_key, tools shape).

export interface PassthroughResult {
  body: Record<string, unknown>
  modelMapping: ModelMappingResult
  systemPromptLen: number
  inputItemCount: number
  promptCacheKey: string
}

type InputItem = Record<string, unknown> & {
  type?: string
  role?: string
  content?: unknown
}

// Chat-Completions content parts use `type: "text" | "image_url"`; the
// Responses API expects `input_text` / `input_image` (user side) or
// `output_text` (assistant side). This normalizes a string or content[]
// payload to a Responses-shape content[].
function normalizeContent(content: unknown, side: 'input' | 'output'): unknown[] {
  if (typeof content === 'string') {
    return [{ type: side === 'output' ? 'output_text' : 'input_text', text: content }]
  }
  if (!Array.isArray(content)) return []
  const out: unknown[] = []
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue
    const part = raw as Record<string, unknown>
    const type = typeof part.type === 'string' ? part.type : ''
    if (type === 'text') {
      out.push({ type: side === 'output' ? 'output_text' : 'input_text', text: part.text ?? '' })
      continue
    }
    if (type === 'image_url') {
      // Chat-shape: { type:'image_url', image_url:{ url } }. Responses-shape:
      // { type:'input_image', image_url:'<url>' }.
      const inner = part.image_url
      const url =
        typeof inner === 'string'
          ? inner
          : inner && typeof inner === 'object'
            ? ((inner as Record<string, unknown>).url as string | undefined)
            : undefined
      if (url) out.push({ type: 'input_image', image_url: url })
      continue
    }
    // Already in Responses shape (input_text / output_text / input_image / refusal /
    // input_file / computer_screenshot / summary_text) — forward verbatim.
    out.push(part)
  }
  return out
}

// Cursor BYOK falls back to Chat-Completions shape (`messages[]`, tool_calls
// on assistant messages, tool-role messages for results) when the configured
// model name isn't on its reasoning-model heuristic list — `codex` triggers
// that fallback. We coerce to the Responses-shape `input[]` items Codex
// expects so the rest of the passthrough can stay shape-agnostic.
export function chatMessagesToInputItems(messages: unknown[]): InputItem[] {
  const items: InputItem[] = []
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue
    const m = raw as Record<string, unknown>
    const role = m.role
    if (role === 'tool') {
      const out =
        typeof m.content === 'string'
          ? m.content
          : extractTextFromContent(m.content) || JSON.stringify(m.content ?? '')
      items.push({
        type: 'function_call_output',
        call_id: m.tool_call_id,
        output: out,
      })
      continue
    }
    if (role === 'assistant') {
      if (Array.isArray(m.tool_calls) && (m.tool_calls as unknown[]).length > 0) {
        for (const tc of m.tool_calls as unknown[]) {
          if (!tc || typeof tc !== 'object') continue
          const t = tc as Record<string, unknown>
          const fn = (t.function ?? {}) as Record<string, unknown>
          items.push({
            type: 'function_call',
            call_id: t.id,
            name: fn.name,
            arguments: fn.arguments,
          })
        }
        if (typeof m.content === 'string' && m.content.length > 0) {
          items.push({
            type: 'message',
            role: 'assistant',
            content: normalizeContent(m.content, 'output'),
          })
        }
        continue
      }
      items.push({
        type: 'message',
        role: 'assistant',
        content: normalizeContent(m.content, 'output'),
      })
      continue
    }
    // user / system / developer
    items.push({
      type: 'message',
      role: typeof role === 'string' ? role : 'user',
      content: normalizeContent(m.content, 'input'),
    })
  }
  return items
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    if (typeof p.text === 'string' && p.text) parts.push(p.text)
  }
  return parts.join('\n')
}

function normalizeTools(rawTools: unknown): unknown[] | undefined {
  if (!Array.isArray(rawTools)) return undefined
  const out: Array<Record<string, unknown>> = []
  for (const raw of rawTools) {
    if (!raw || typeof raw !== 'object') continue
    const t = raw as Record<string, unknown>
    // Codex Responses expects flat: {type:'function', name, description, parameters}.
    if (t.function && typeof t.function === 'object') {
      const fn = t.function as Record<string, unknown>
      if (typeof fn.name === 'string') {
        out.push({
          type: 'function',
          name: fn.name,
          description: typeof fn.description === 'string' ? fn.description : undefined,
          parameters:
            fn.parameters && typeof fn.parameters === 'object' ? fn.parameters : undefined,
        })
      }
      continue
    }
    if (typeof t.name === 'string') {
      out.push({
        type: typeof t.type === 'string' ? t.type : 'function',
        name: t.name,
        description: typeof t.description === 'string' ? t.description : undefined,
        parameters: t.parameters && typeof t.parameters === 'object' ? t.parameters : undefined,
      })
    }
  }
  return out.length > 0 ? out : undefined
}

export function buildCodexFromResponsesBody(rawBody: Record<string, unknown>): PassthroughResult {
  const requestedModel = typeof rawBody.model === 'string' ? rawBody.model : ''
  const modelMapping = mapToCodexModel(requestedModel)

  // Prefer the native Responses-shape `input[]`. If absent, fall back to
  // converting Chat-shape `messages[]` — Cursor emits that when the model
  // name (e.g. `codex`) isn't on its reasoning-model heuristic list.
  const rawInput: InputItem[] = Array.isArray(rawBody.input)
    ? (rawBody.input as InputItem[])
    : Array.isArray(rawBody.messages)
      ? chatMessagesToInputItems(rawBody.messages as unknown[])
      : []

  const instructionsParts: string[] = []
  const passthroughInput: InputItem[] = []
  for (const item of rawInput) {
    // System / developer items become the top-level `instructions` field
    // (Codex 400s with "Instructions are required" if missing). Everything
    // else — including reasoning items with encrypted_content — is forwarded
    // verbatim.
    if (item && typeof item === 'object' && (item.role === 'system' || item.role === 'developer')) {
      const text = extractTextFromContent(item.content)
      if (text) instructionsParts.push(text)
      continue
    }
    passthroughInput.push(item)
  }

  const instructions = instructionsParts.join('\n\n').trim() || ' '
  const tools = normalizeTools(rawBody.tools)
  const promptCacheKey = deriveCacheKey(instructions)

  const out: Record<string, unknown> = {
    model: modelMapping.applied,
    instructions,
    input: passthroughInput,
    stream: true,
    store: false,
    // Codex's /backend-api/codex/responses endpoint rejects
    // `prompt_cache_retention` with 400 (it's a public-Responses-API param
    // only). We rely on Codex's default retention; routing is what we
    // control via prompt_cache_key.
    prompt_cache_key: promptCacheKey,
  }
  if (tools) out.tools = tools
  if (rawBody.tool_choice !== undefined) out.tool_choice = rawBody.tool_choice
  if (rawBody.temperature !== undefined) out.temperature = rawBody.temperature
  if (rawBody.top_p !== undefined) out.top_p = rawBody.top_p
  if (rawBody.max_output_tokens !== undefined) out.max_output_tokens = rawBody.max_output_tokens
  if (rawBody.reasoning !== undefined) out.reasoning = rawBody.reasoning
  if (rawBody.include !== undefined) out.include = rawBody.include
  if (rawBody.parallel_tool_calls !== undefined) {
    out.parallel_tool_calls = rawBody.parallel_tool_calls
  }

  return {
    body: out,
    modelMapping,
    systemPromptLen: instructions.length,
    inputItemCount: passthroughInput.length,
    promptCacheKey,
  }
}
