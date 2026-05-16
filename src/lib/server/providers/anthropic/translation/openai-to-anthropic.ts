// OpenAI (Chat Completions / Responses API) → Anthropic Messages converter.
// Ported from the claude-code-to-cursor prototype. Does NOT apply thinking or
// model routing — that happens in build.ts. The mandatory Claude Code system
// prompt + cache breakpoints are applied later in claude-code-body.ts.

import { logger } from '../../../logger'
import { trimToolResult } from './tool-result-trimmer'
import type { AnthropicMessage, AnthropicRequest, ContentBlock, Tool } from './types'

export interface OpenAIContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' }
}

export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface OpenAIMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool'
  content: string | OpenAIContentPart[] | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
  name?: string
}

interface OpenAIFunctionTool {
  type: 'function'
  function: { name: string; description?: string; parameters?: Record<string, unknown> }
}

interface OpenAIResponsesFunctionTool {
  type: 'function'
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

interface AnthropicToolDirect {
  name: string
  description?: string
  input_schema?: Record<string, unknown>
  cache_control?: { type: string }
}

type ResponsesContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'output_text'; text: string }
  | { type: 'text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'auto' | 'low' | 'high' }

type ResponsesInputItem =
  | {
      type: 'message'
      role: 'user' | 'assistant' | 'system' | 'developer'
      content: string | ResponsesContentPart[]
    }
  | { type: 'function_call'; call_id: string; name: string; arguments: string; id?: string }
  | { type: 'function_call_output'; call_id: string; output: string }
  | { type: 'reasoning'; summary?: unknown; content?: unknown }

export interface OpenAIChatRequest {
  model?: string
  messages?: OpenAIMessage[]
  input?: ResponsesInputItem[] | OpenAIMessage[] | string
  max_tokens?: number
  max_completion_tokens?: number
  temperature?: number
  top_p?: number
  stream?: boolean
  stop?: string | string[]
  tools?: unknown[]
  tool_choice?: 'none' | 'auto' | 'required' | { type: string; function?: { name: string } }
}

const EMPTY_INPUT_SCHEMA = { type: 'object', properties: {} } as const

function isOpenAIChatTool(tool: unknown): tool is OpenAIFunctionTool {
  if (!tool || typeof tool !== 'object') return false
  const t = tool as { type?: unknown; function?: { name?: unknown } }
  return (
    t.type === 'function' &&
    typeof t.function === 'object' &&
    t.function !== null &&
    typeof t.function.name === 'string'
  )
}

function isOpenAIResponsesTool(tool: unknown): tool is OpenAIResponsesFunctionTool {
  if (!tool || typeof tool !== 'object') return false
  const t = tool as { type?: unknown; name?: unknown }
  return t.type === 'function' && typeof t.name === 'string'
}

function isAnthropicTool(tool: unknown): tool is AnthropicToolDirect {
  if (!tool || typeof tool !== 'object') return false
  const t = tool as { name?: unknown }
  return typeof t.name === 'string'
}

/** Extract a tool's name across the three shapes Cursor / OpenAI / Anthropic send. */
export function extractToolName(tool: unknown): string | undefined {
  if (isOpenAIChatTool(tool)) return tool.function.name
  if (isOpenAIResponsesTool(tool)) return tool.name
  if (isAnthropicTool(tool)) return tool.name
  return undefined
}

function isResponsesInputArray(input: unknown): input is ResponsesInputItem[] {
  if (!Array.isArray(input) || input.length === 0) return false
  const first = input[0]
  return (
    !!first &&
    typeof first === 'object' &&
    'type' in first &&
    typeof (first as { type?: unknown }).type === 'string'
  )
}

function responsesContentToOpenAI(
  content: string | ResponsesContentPart[],
): string | OpenAIContentPart[] {
  if (typeof content === 'string') return content
  const parts: OpenAIContentPart[] = []
  for (const part of content) {
    if (part.type === 'input_text' || part.type === 'output_text' || part.type === 'text') {
      parts.push({ type: 'text', text: part.text })
    } else if (part.type === 'input_image') {
      parts.push({ type: 'image_url', image_url: { url: part.image_url, detail: part.detail } })
    }
  }
  return parts
}

/**
 * Translate OpenAI Responses API `input` items into Chat Completions messages.
 * Consecutive `function_call` items batch into one assistant message.
 */
export function responsesInputToChatMessages(items: ResponsesInputItem[]): OpenAIMessage[] {
  const messages: OpenAIMessage[] = []
  let pendingToolCalls: OpenAIToolCall[] = []

  const flushPendingToolCalls = (): void => {
    if (pendingToolCalls.length === 0) return
    messages.push({ role: 'assistant', content: null, tool_calls: pendingToolCalls })
    pendingToolCalls = []
  }

  for (const item of items) {
    if (item.type === 'message') {
      flushPendingToolCalls()
      const role = item.role === 'developer' ? 'system' : item.role
      messages.push({ role, content: responsesContentToOpenAI(item.content) })
    } else if (item.type === 'function_call') {
      pendingToolCalls.push({
        id: item.call_id,
        type: 'function',
        function: { name: item.name, arguments: item.arguments },
      })
    } else if (item.type === 'function_call_output') {
      flushPendingToolCalls()
      messages.push({ role: 'tool', tool_call_id: item.call_id, content: item.output })
    }
    // `reasoning` items have no Chat Completions equivalent — drop silently.
  }

  flushPendingToolCalls()
  return messages
}

function convertContent(
  content: string | OpenAIContentPart[] | ContentBlock[],
): string | ContentBlock[] {
  if (typeof content === 'string') return content

  const blocks: ContentBlock[] = []
  for (const part of content) {
    // Pass through Anthropic-format blocks (tool_use / tool_result) directly.
    if ((part as ContentBlock).type === 'tool_use') {
      blocks.push(part as ContentBlock)
      continue
    }
    if ((part as ContentBlock).type === 'tool_result') {
      const toolResult = part as ContentBlock
      if (typeof toolResult.content === 'string') {
        blocks.push({ ...toolResult, content: trimToolResult(toolResult.content) })
      } else {
        blocks.push(toolResult)
      }
      continue
    }

    const openaiPart = part as OpenAIContentPart
    if (openaiPart.type === 'text') {
      if (openaiPart.text && openaiPart.text.trim().length > 0) {
        blocks.push({ type: 'text', text: openaiPart.text })
      }
    } else if (openaiPart.type === 'image_url' && openaiPart.image_url) {
      const url = openaiPart.image_url.url
      if (url.startsWith('data:')) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/)
        const mediaType = match?.[1]
        const data = match?.[2]
        if (mediaType && data) {
          blocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
        }
      } else {
        blocks.push({ type: 'image', source: { type: 'url', url } })
      }
    }
  }
  return blocks
}

function convertTools(rawTools: unknown[]): Tool[] {
  const converted: Tool[] = []
  let skipped = 0
  for (const tool of rawTools) {
    if (isOpenAIChatTool(tool)) {
      converted.push({
        name: tool.function.name,
        description: tool.function.description ?? '',
        input_schema: tool.function.parameters ?? { ...EMPTY_INPUT_SCHEMA },
      })
    } else if (isOpenAIResponsesTool(tool)) {
      converted.push({
        name: tool.name,
        description: tool.description ?? '',
        input_schema: tool.parameters ?? { ...EMPTY_INPUT_SCHEMA },
      })
    } else if (isAnthropicTool(tool)) {
      converted.push({
        name: tool.name,
        description: tool.description ?? '',
        input_schema: tool.input_schema ?? { ...EMPTY_INPUT_SCHEMA },
        ...(tool.cache_control ? { cache_control: tool.cache_control } : {}),
      })
    } else {
      skipped++
    }
  }
  if (skipped > 0) {
    logger.warn(`[anthropic] dropped ${skipped}/${rawTools.length} malformed tool(s)`)
  }
  return converted
}

/**
 * Convert an OpenAI-format request (Chat Completions or Responses API) into an
 * Anthropic Messages request. `targetApiModel` is the resolved Anthropic model.
 */
export function openaiToAnthropicBase(
  originalRequest: OpenAIChatRequest,
  targetApiModel: string,
): AnthropicRequest {
  const request: OpenAIChatRequest = { ...originalRequest }

  // Responses API uses `input` — typed envelopes, not Chat messages.
  if (!request.messages && request.input !== undefined) {
    if (typeof request.input === 'string') {
      request.messages = [{ role: 'user', content: request.input }]
    } else if (isResponsesInputArray(request.input)) {
      request.messages = responsesInputToChatMessages(request.input)
    } else {
      request.messages = request.input as OpenAIMessage[]
    }
  }
  if (!request.messages) {
    logger.warn('[anthropic] no `messages` or `input` in request — using empty array')
    request.messages = []
  }

  const messages: AnthropicMessage[] = []
  let system: string | ContentBlock[] | undefined

  for (const msg of request.messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : (msg.content ?? []).map((p) => p.text ?? '').join('\n')
      system = system && typeof system === 'string' ? `${system}\n${content}` : content
    } else if (msg.role === 'assistant') {
      const contentBlocks: ContentBlock[] = []
      if (msg.content) {
        const converted = convertContent(msg.content)
        if (typeof converted === 'string' && converted.trim().length > 0) {
          contentBlocks.push({ type: 'text', text: converted })
        } else if (Array.isArray(converted)) {
          contentBlocks.push(...converted)
        }
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          let input: unknown = {}
          try {
            input = JSON.parse(toolCall.function.arguments)
          } catch {
            input = { raw: toolCall.function.arguments }
          }
          contentBlocks.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input,
          })
        }
      }
      if (contentBlocks.length > 0) {
        messages.push({ role: 'assistant', content: contentBlocks })
      }
    } else if (msg.role === 'tool') {
      const rawResultContent =
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      const toolResultContent: ContentBlock[] = [
        {
          type: 'tool_result',
          tool_use_id: msg.tool_call_id ?? '',
          content: trimToolResult(rawResultContent),
        },
      ]
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
        lastMsg.content.push(...toolResultContent)
      } else {
        messages.push({ role: 'user', content: toolResultContent })
      }
    } else if (msg.role === 'user') {
      const converted = convertContent(msg.content ?? '')
      if (typeof converted === 'string') {
        if (converted.trim().length === 0) continue
      } else if (converted.length === 0) {
        continue
      }
      messages.push({ role: 'user', content: converted })
    }
  }

  // Anthropic requires the conversation to start with a user message.
  if (messages.length > 0 && messages[0]?.role !== 'user') {
    messages.unshift({ role: 'user', content: 'Continue.' })
  }

  const maxTokens = request.max_tokens ?? request.max_completion_tokens ?? 4096

  const result: AnthropicRequest = {
    model: targetApiModel,
    messages,
    system,
    max_tokens: maxTokens,
    temperature: request.temperature,
    top_p: request.top_p,
    stream: request.stream,
    stop_sequences: request.stop
      ? Array.isArray(request.stop)
        ? request.stop
        : [request.stop]
      : undefined,
  }

  if (Array.isArray(request.tools) && request.tools.length > 0) {
    const converted = convertTools(request.tools)
    if (converted.length > 0) result.tools = converted
  }

  if (
    request.tool_choice &&
    typeof request.tool_choice === 'object' &&
    'type' in request.tool_choice
  ) {
    const tc = request.tool_choice
    result.tool_choice = {
      type: tc.type === 'function' ? 'tool' : (tc.type as 'auto' | 'any' | 'tool'),
      name: tc.function ? tc.function.name : undefined,
    }
  }

  return result
}
