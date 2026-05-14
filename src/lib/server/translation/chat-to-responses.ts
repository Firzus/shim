import type {
  CodexResponsesInputItem,
  CodexResponsesRequest,
  CodexResponsesToolDef,
  OpenAIChatMessage,
  OpenAIChatRequest,
  OpenAIContentPart,
  OpenAIToolFunctionDef,
} from './types'
import { mapToCodexModel, type ModelMappingResult } from './model-map'

/**
 * Translate a Chat Completions request body into a Codex Responses API
 * request body.
 *
 * Phase 0 findings hard-coded here:
 *  - `instructions` is mandatory and must be a non-empty string (upstream
 *    400 "Instructions are required" otherwise). We concatenate every
 *    `system`/`developer` message and fall back to a single space when
 *    none is provided.
 *  - `model` must be on the Codex allowlist (gate before body shape).
 *    `mapToCodexModel` falls back to `gpt-5.4` if the requested model is
 *    unknown.
 *  - `stream: true` and `store: false` are both required.
 *  - `prompt_cache_key` re-uses the session id we'll set on the
 *    `Session_id` header — letting the upstream attach the request to a
 *    cached prefix.
 */
export interface TranslationResult {
  body: CodexResponsesRequest
  modelMapping: ModelMappingResult
}

function partsToString(content: string | OpenAIContentPart[] | null | undefined): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (part.type === 'text') return part.text
      // We don't translate image content into instructions; the upstream
      // does multimodal via input_image items.
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function userContentToInputParts(
  content: string | OpenAIContentPart[],
): Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }> {
  if (typeof content === 'string') return [{ type: 'input_text', text: content }]
  return content
    .map((part) => {
      if (part.type === 'text') {
        return { type: 'input_text' as const, text: part.text }
      }
      return { type: 'input_image' as const, image_url: part.image_url.url }
    })
    .filter((p) => {
      if (p.type === 'input_text') return p.text.length > 0
      return Boolean((p as { image_url: string }).image_url)
    })
}

function assistantContentToOutputParts(
  content: string | OpenAIContentPart[] | null | undefined,
): Array<{ type: 'output_text'; text: string }> {
  if (!content) return []
  if (typeof content === 'string') {
    return content ? [{ type: 'output_text', text: content }] : []
  }
  return content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => ({ type: 'output_text' as const, text: p.text }))
    .filter((p) => p.text.length > 0)
}

function translateTools(tools: OpenAIToolFunctionDef[] | undefined): CodexResponsesToolDef[] {
  if (!tools || tools.length === 0) return []
  return tools.map((t) => ({
    type: 'function' as const,
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }))
}

function buildInstructions(messages: OpenAIChatMessage[]): string {
  const systemTexts: string[] = []
  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      const text = partsToString(msg.content)
      if (text) systemTexts.push(text)
    }
  }
  const joined = systemTexts.join('\n\n').trim()
  // Phase 0 finding: empty `instructions` is rejected upstream.
  return joined.length > 0 ? joined : ' '
}

function buildInput(messages: OpenAIChatMessage[]): CodexResponsesInputItem[] {
  const items: CodexResponsesInputItem[] = []
  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      continue // absorbed into instructions
    }
    if (msg.role === 'user') {
      items.push({
        type: 'message',
        role: 'user',
        content: userContentToInputParts(msg.content),
      })
      continue
    }
    if (msg.role === 'assistant') {
      const outputs = assistantContentToOutputParts(msg.content)
      if (outputs.length > 0) {
        items.push({
          type: 'message',
          role: 'assistant',
          content: outputs,
        })
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const call of msg.tool_calls) {
          items.push({
            type: 'function_call',
            call_id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          })
        }
      }
      continue
    }
    if (msg.role === 'tool') {
      items.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id,
        output: partsToString(msg.content),
      })
      continue
    }
  }
  return items
}

export function translateChatToResponses(
  body: OpenAIChatRequest,
  promptCacheKey: string,
): TranslationResult {
  const modelMapping = mapToCodexModel(body.model)
  const tools = translateTools(body.tools)
  const out: CodexResponsesRequest = {
    model: modelMapping.applied,
    instructions: buildInstructions(body.messages ?? []),
    input: buildInput(body.messages ?? []),
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: body.tool_choice,
    temperature: body.temperature,
    top_p: body.top_p,
    max_output_tokens: body.max_tokens ?? body.max_completion_tokens,
    stream: true,
    store: false,
    prompt_cache_key: promptCacheKey,
  }
  return { body: out, modelMapping }
}
