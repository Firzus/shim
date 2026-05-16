// Shared shape + helper for the two Anthropic SSE translators (streaming and
// buffered). Both consume the same upstream event shape and the same
// `streamContext` produced by `buildUpstreamBody`.

// Loose typed view of the Anthropic SSE events the translators consume.
export interface AnthropicStreamEvent {
  type: string
  index?: number
  message?: {
    usage?: {
      input_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
  }
  content_block?: { type?: string; id?: string; name?: string }
  delta?: { type?: string; text?: string; thinking?: string; partial_json?: string }
  usage?: { output_tokens?: number }
  error?: { message?: string; type?: string }
}

export interface AnthropicStreamContext {
  userToolNames: Set<string>
}

export function userToolNamesFrom(context: unknown): Set<string> {
  if (context && typeof context === 'object' && 'userToolNames' in context) {
    const set = (context as { userToolNames: unknown }).userToolNames
    if (set instanceof Set) return set as Set<string>
  }
  return new Set()
}
