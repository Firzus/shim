// ---------------------------------------------------------------------------
// OpenAI Chat Completions wire types (Cursor BYOK side). Loose by design —
// fields outside what we use are passed through or ignored.
// ---------------------------------------------------------------------------

export interface OpenAITextContentPart {
  type: 'text'
  text: string
}

export interface OpenAIImageContentPart {
  type: 'image_url'
  image_url: { url: string; detail?: string }
}

export type OpenAIContentPart = OpenAITextContentPart | OpenAIImageContentPart

export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface OpenAIChatMessageSystem {
  role: 'system' | 'developer'
  content: string | OpenAIContentPart[]
}

export interface OpenAIChatMessageUser {
  role: 'user'
  content: string | OpenAIContentPart[]
}

export interface OpenAIChatMessageAssistant {
  role: 'assistant'
  content?: string | OpenAIContentPart[] | null
  tool_calls?: OpenAIToolCall[]
}

export interface OpenAIChatMessageTool {
  role: 'tool'
  tool_call_id: string
  content: string | OpenAIContentPart[]
}

export type OpenAIChatMessage =
  | OpenAIChatMessageSystem
  | OpenAIChatMessageUser
  | OpenAIChatMessageAssistant
  | OpenAIChatMessageTool

export interface OpenAIToolFunctionDef {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export interface OpenAIChatRequest {
  model: string
  messages: OpenAIChatMessage[]
  tools?: OpenAIToolFunctionDef[]
  tool_choice?: unknown
  temperature?: number
  top_p?: number
  max_tokens?: number
  max_completion_tokens?: number
  stream?: boolean
  stream_options?: { include_usage?: boolean }
  reasoning_effort?: string
  user?: string
}

// ---------------------------------------------------------------------------
// Codex Responses API (upstream). Minimal shape — only what we send/parse.
// ---------------------------------------------------------------------------

export interface CodexResponsesInputMessage {
  type: 'message'
  role: 'user' | 'assistant' | 'system'
  content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'output_text'; text: string }
    | { type: 'input_image'; image_url: string; detail?: string }
  >
}

export interface CodexResponsesFunctionCallItem {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
}

export interface CodexResponsesFunctionCallOutputItem {
  type: 'function_call_output'
  call_id: string
  output: string
}

export type CodexResponsesInputItem =
  | CodexResponsesInputMessage
  | CodexResponsesFunctionCallItem
  | CodexResponsesFunctionCallOutputItem

export interface CodexResponsesToolDef {
  type: 'function'
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

export interface CodexResponsesRequest {
  model: string
  instructions: string
  input: CodexResponsesInputItem[]
  tools?: CodexResponsesToolDef[]
  tool_choice?: unknown
  temperature?: number
  top_p?: number
  max_output_tokens?: number
  stream: true
  store: false
  prompt_cache_key: string
}

// ---------------------------------------------------------------------------
// Responses-API streaming events (subset we care about).
// Reference: openai/codex/codex-rs/responses-api-proxy + sdktranslator.
//
// Modelled as an open record (`type: string` + index signature) rather than a
// closed discriminated union because the upstream emits a long tail of event
// types we don't translate. Consumers narrow by inspecting `event.type` and
// the specific helper functions below.
// ---------------------------------------------------------------------------

export interface CodexStreamEvent {
  type: string
  [key: string]: unknown
}

export interface CodexStreamFunctionCallItem {
  type: 'function_call'
  call_id: string
  name: string
  arguments?: string
}

export interface CodexStreamUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
}

export interface CodexStreamResponse {
  id?: string
  usage?: CodexStreamUsage
}

export function isFunctionCallItem(item: unknown): item is CodexStreamFunctionCallItem {
  if (!item || typeof item !== 'object') return false
  const obj = item as Record<string, unknown>
  return (
    obj.type === 'function_call' && typeof obj.call_id === 'string' && typeof obj.name === 'string'
  )
}

export function getEventString(event: CodexStreamEvent, key: string): string | undefined {
  const value = event[key]
  return typeof value === 'string' ? value : undefined
}

export function getEventItem(event: CodexStreamEvent): unknown {
  return event.item
}

export function getEventResponse(event: CodexStreamEvent): CodexStreamResponse | undefined {
  const value = event.response
  if (!value || typeof value !== 'object') return undefined
  return value as CodexStreamResponse
}

export function getEventError(
  event: CodexStreamEvent,
): { message: string; code?: string } | undefined {
  const value = event.error
  if (!value || typeof value !== 'object') return undefined
  const obj = value as Record<string, unknown>
  if (typeof obj.message !== 'string') return undefined
  return {
    message: obj.message,
    code: typeof obj.code === 'string' ? obj.code : undefined,
  }
}
