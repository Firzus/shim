// Anthropic Messages API wire types (the upstream shape). Loose by design —
// fields outside what we send/parse are passed through or ignored.

export interface ImageSource {
  type: 'base64' | 'url'
  media_type?: string
  data?: string
  url?: string
}

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result' | 'thinking'
  text?: string
  source?: ImageSource
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string | ContentBlock[]
  cache_control?: { type: string; ttl?: number }
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface Tool {
  name: string
  description?: string
  input_schema?: Record<string, unknown>
  cache_control?: { type: string }
}

export interface ToolChoice {
  type: 'auto' | 'any' | 'tool'
  name?: string
}

export interface AnthropicRequest {
  model: string
  max_tokens: number
  messages: AnthropicMessage[]
  system?: string | ContentBlock[]
  temperature?: number
  top_p?: number
  top_k?: number
  stream?: boolean
  stop_sequences?: string[]
  metadata?: { user_id?: string }
  tools?: Tool[]
  tool_choice?: ToolChoice
  reasoning_budget?: number | string
  thinking?:
    | { type: 'enabled'; budget_tokens: number }
    | { type: 'adaptive' }
    | { type: 'disabled' }
  output_config?: {
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  }
}

export interface AnthropicError {
  type: 'error'
  error: {
    type: string
    message: string
  }
}
