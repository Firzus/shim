// buildUpstreamBody for the Anthropic provider — orchestrates the full
// Cursor-body → Anthropic-Messages-body conversion.

import { deriveCacheKey } from '../../../translation/cache-key'
import type { BuiltUpstreamRequest, ResolvedModelSettings } from '../../types'
import { mapToAnthropicModel, SUGGESTED_MAX_TOKENS, toAnthropicEffort } from '../model-map'
import { prepareClaudeCodeBody, totalSystemTextLen } from './claude-code-body'
import { extractToolName, openaiToAnthropicBase } from './openai-to-anthropic'
import type { OpenAIChatRequest } from './openai-to-anthropic'
import type { AnthropicStreamContext } from './stream-context'
import type { ContentBlock } from './types'

export function buildAnthropicUpstreamBody(
  rawBody: Record<string, unknown>,
  settings: ResolvedModelSettings,
): BuiltUpstreamRequest {
  const request = rawBody as unknown as OpenAIChatRequest
  const requestedModel = typeof rawBody.model === 'string' ? rawBody.model : ''

  // The dashboard owns the model + effort; Cursor's `model` is a sentinel.
  const appliedModel = mapToAnthropicModel(settings.model).applied
  const effort = toAnthropicEffort(settings.effort)

  // Collect the names of tools Cursor declared (before the `mcp_` prefix) so
  // the stream translator can tell user tools from Claude Code internal ones.
  const userToolNames = new Set<string>()
  if (Array.isArray(rawBody.tools)) {
    for (const tool of rawBody.tools) {
      const name = extractToolName(tool)
      if (name) userToolNames.add(name)
    }
  }

  const base = openaiToAnthropicBase(request, appliedModel)

  // shim's reasoning effort is always on for Anthropic — apply adaptive
  // thinking, force temperature=1, and floor max_tokens for the effort level.
  base.temperature = 1
  base.thinking = { type: 'adaptive' }
  base.output_config = { effort }
  base.max_tokens = Math.max(base.max_tokens || 0, SUGGESTED_MAX_TOKENS[effort])

  const prepared = prepareClaudeCodeBody(base)
  prepared.stream = true

  const systemBlocks: ContentBlock[] = Array.isArray(prepared.system) ? prepared.system : []
  const systemPromptLen = totalSystemTextLen(systemBlocks)

  const streamContext: AnthropicStreamContext = { userToolNames }

  return {
    body: prepared as unknown as Record<string, unknown>,
    promptCacheKey: deriveCacheKey(systemBlocks.map((b) => b.text ?? '').join('')),
    requestedModel,
    appliedModel,
    inputItemCount: prepared.messages.length,
    systemPromptLen,
    toolDefsCount: prepared.tools?.length ?? 0,
    streamContext,
  }
}
