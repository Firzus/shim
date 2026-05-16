// OpenAI `chat.completion.chunk` SSE builders + usage helper. Ported from the
// prototype's openai-adapter.ts. Each builder returns a ready-to-write SSE
// frame string (`data: {...}\n\n`).

interface OpenAIStreamChunkToolCall {
  index: number
  id?: string
  type?: 'function'
  function?: { name?: string; arguments?: string }
}

interface OpenAIUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_tokens_details: { cached_tokens: number }
  completion_tokens_details: { reasoning_tokens: number }
}

interface OpenAIStreamChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: 'assistant'
      content?: string | null
      tool_calls?: OpenAIStreamChunkToolCall[]
    }
    finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  }>
  usage?: OpenAIUsage | null
}

/**
 * Build the OpenAI usage object from Anthropic token counts. Anthropic's
 * input_tokens counts only uncached tokens; we sum all sources so Cursor
 * shows the correct "context used" percentage.
 */
export function computeOpenAIUsage(
  promptTokens: number,
  completionTokens: number,
  cacheReadTokens = 0,
  reasoningTokens = 0,
): OpenAIUsage {
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    prompt_tokens_details: { cached_tokens: cacheReadTokens },
    completion_tokens_details: { reasoning_tokens: reasoningTokens },
  }
}

function baseChunk(
  id: string,
  model: string,
): Pick<OpenAIStreamChunk, 'id' | 'object' | 'created' | 'model'> {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
  }
}

export function createOpenAIStreamStart(id: string, model: string): string {
  const chunk: OpenAIStreamChunk = {
    ...baseChunk(id, model),
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
    usage: null,
  }
  return `data: ${JSON.stringify(chunk)}\n\n`
}

export function createOpenAIStreamChunk(
  id: string,
  model: string,
  content?: string,
  finishReason?: 'stop' | 'length' | 'tool_calls' | null,
  usage?: OpenAIUsage | null,
): string {
  const chunk: OpenAIStreamChunk = {
    ...baseChunk(id, model),
    choices: [
      {
        index: 0,
        delta: content !== undefined ? { content } : {},
        finish_reason: finishReason ?? null,
      },
    ],
    usage: usage ?? null,
  }
  return `data: ${JSON.stringify(chunk)}\n\n`
}

/**
 * OpenAI streams tool calls in multiple chunks: the first carries id + name,
 * subsequent ones carry argument fragments.
 */
export function createOpenAIToolCallChunk(
  id: string,
  model: string,
  toolCallIndex: number,
  toolCallId?: string,
  functionName?: string,
  functionArgs?: string,
  finishReason?: 'tool_calls' | null,
): string {
  const toolCall: OpenAIStreamChunkToolCall = { index: toolCallIndex }
  if (toolCallId) {
    toolCall.id = toolCallId
    toolCall.type = 'function'
  }
  if (functionName || functionArgs) {
    toolCall.function = {}
    if (functionName) toolCall.function.name = functionName
    if (functionArgs) toolCall.function.arguments = functionArgs
  }
  const chunk: OpenAIStreamChunk = {
    ...baseChunk(id, model),
    choices: [{ index: 0, delta: { tool_calls: [toolCall] }, finish_reason: finishReason ?? null }],
    usage: null,
  }
  return `data: ${JSON.stringify(chunk)}\n\n`
}

/** Final chunk with usage, empty choices — sent right before [DONE]. */
export function createOpenAIStreamUsageChunk(
  id: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  cacheReadTokens = 0,
  reasoningTokens = 0,
): string {
  const chunk: OpenAIStreamChunk = {
    ...baseChunk(id, model),
    choices: [],
    usage: computeOpenAIUsage(promptTokens, completionTokens, cacheReadTokens, reasoningTokens),
  }
  return `data: ${JSON.stringify(chunk)}\n\n`
}

export function createOpenAIErrorTail(id: string, model: string, errMsg: string): string {
  return (
    createOpenAIStreamChunk(id, model, `[Error: ${errMsg}]`) +
    createOpenAIStreamChunk(id, model, undefined, 'stop') +
    'data: [DONE]\n\n'
  )
}

export function createOpenAIErrorStream(id: string, model: string, errMsg: string): string {
  return createOpenAIStreamStart(id, model) + createOpenAIErrorTail(id, model, errMsg)
}
