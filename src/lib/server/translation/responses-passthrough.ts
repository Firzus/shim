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
}

interface InputItem {
  type?: string
  role?: string
  content?: unknown
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

export function buildCodexFromResponsesBody(
  rawBody: Record<string, unknown>,
  sessionId: string,
): PassthroughResult {
  const requestedModel = typeof rawBody.model === 'string' ? rawBody.model : ''
  const modelMapping = mapToCodexModel(requestedModel)

  const rawInput = Array.isArray(rawBody.input) ? (rawBody.input as InputItem[]) : []

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

  const out: Record<string, unknown> = {
    model: modelMapping.applied,
    instructions,
    input: passthroughInput,
    stream: true,
    store: false,
    prompt_cache_key: sessionId,
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
  }
}
