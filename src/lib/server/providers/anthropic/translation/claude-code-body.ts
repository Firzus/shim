// Claude Code body preparation — the load-bearing step that makes an OAuth
// token acceptable to the upstream. Ported from the prototype's
// prepareClaudeCodeBody. Any drift here breaks all Anthropic traffic.

import { logger } from '../../../logger'
import {
  CLAUDE_CODE_SYSTEM_PROMPT,
  MAX_STOP_SEQUENCES,
  TOOL_PREFIX,
  TURN_MARKER,
} from '../constants'
import { type AnthropicEffort, ANTHROPIC_EFFORTS, SUGGESTED_MAX_TOKENS } from '../model-map'
import { ensureTrailingUserMessage, normalizeAnthropicToolIds } from './request-normalization'
import { trimToolResult } from './tool-result-trimmer'
import type { AnthropicRequest, ContentBlock } from './types'

function isAnthropicEffort(value: unknown): value is AnthropicEffort {
  return typeof value === 'string' && (ANTHROPIC_EFFORTS as readonly string[]).includes(value)
}

// Cursor may send `reasoning_budget`; map it to adaptive thinking + effort.
function convertReasoningBudget(prepared: AnthropicRequest): void {
  if (!('reasoning_budget' in prepared)) return
  if (!prepared.thinking) {
    const val = prepared.reasoning_budget
    const effort: AnthropicEffort = isAnthropicEffort(val) ? val : 'medium'
    prepared.thinking = { type: 'adaptive' }
    prepared.output_config = { effort }
    prepared.temperature = 1
    const suggested = SUGGESTED_MAX_TOKENS[effort]
    if (prepared.max_tokens < suggested) prepared.max_tokens = suggested
  }
  delete prepared.reasoning_budget
}

function prefixToolNames(prepared: AnthropicRequest): void {
  if (prepared.tools && Array.isArray(prepared.tools)) {
    const sorted = [...prepared.tools].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    prepared.tools = sorted.map((tool) => ({
      ...tool,
      name: tool.name ? `${TOOL_PREFIX}${tool.name}` : tool.name,
    }))
    if (prepared.tools.length > 0) {
      const lastIdx = prepared.tools.length - 1
      const lastTool = prepared.tools[lastIdx]
      if (lastTool) {
        prepared.tools[lastIdx] = { ...lastTool, cache_control: { type: 'ephemeral' } }
      }
    }
  }
  if (prepared.tool_choice?.type === 'tool' && prepared.tool_choice.name) {
    prepared.tool_choice = {
      ...prepared.tool_choice,
      name: `${TOOL_PREFIX}${prepared.tool_choice.name}`,
    }
  }
  if (prepared.messages && Array.isArray(prepared.messages)) {
    prepared.messages = prepared.messages.map((msg) => {
      if (msg.content && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((block) => {
            if ((block.type === 'tool_use' || block.type === 'tool_result') && block.name) {
              return { ...block, name: `${TOOL_PREFIX}${block.name}` }
            }
            return block
          }),
        }
      }
      return msg
    })
  }
}

function systemToBlocks(existing: AnthropicRequest['system']): ContentBlock[] {
  if (!existing) return []
  if (typeof existing === 'string') return [{ type: 'text', text: existing }]
  return Array.isArray(existing) ? existing : []
}

export function totalSystemTextLen(blocks: ContentBlock[]): number {
  return blocks.reduce(
    (n, b) => n + (b.type === 'text' && typeof b.text === 'string' ? b.text.length : 0),
    0,
  )
}

/**
 * The first system block MUST equal CLAUDE_CODE_SYSTEM_PROMPT verbatim or the
 * OAuth token is rejected with "OAuth not authorized".
 */
function buildSystemPrompt(existing: AnthropicRequest['system']): ContentBlock[] {
  const systemPrompts: ContentBlock[] = [
    { type: 'text', text: CLAUDE_CODE_SYSTEM_PROMPT },
    ...systemToBlocks(existing),
  ]
  const lastIdx = systemPrompts.length - 1
  const lastBlock = systemPrompts[lastIdx]
  if (lastBlock) {
    systemPrompts[lastIdx] = { ...lastBlock, cache_control: { type: 'ephemeral' } }
  }
  return systemPrompts
}

function applyCacheBreakpoints(messages: AnthropicRequest['messages']): void {
  if (!Array.isArray(messages)) return

  const addBreakpoint = (idx: number): void => {
    const msg = messages[idx]
    if (!msg) return
    if (typeof msg.content === 'string') {
      messages[idx] = {
        role: msg.role,
        content: [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }],
      }
    } else if (Array.isArray(msg.content) && msg.content.length > 0) {
      const blocks = [...msg.content]
      const lastBlock = blocks[blocks.length - 1]
      if (lastBlock) {
        blocks[blocks.length - 1] = { ...lastBlock, cache_control: { type: 'ephemeral' } }
      }
      messages[idx] = { role: msg.role, content: blocks }
    }
  }

  const userMsgIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === 'user') userMsgIndices.push(i)
  }

  // Anthropic allows max 4 cache_control blocks: system (1) + tools (1) leave
  // 2 for messages — second-to-last user msg, then first user msg.
  if (userMsgIndices.length >= 2) {
    const secondToLast = userMsgIndices[userMsgIndices.length - 2]
    if (secondToLast !== undefined) addBreakpoint(secondToLast)
  }
  if (userMsgIndices.length >= 3) {
    const firstIdx = userMsgIndices[0]
    if (firstIdx !== undefined && firstIdx !== userMsgIndices[userMsgIndices.length - 2]) {
      addBreakpoint(firstIdx)
    }
  }
}

function trimMessageToolResults(messages: AnthropicRequest['messages']): void {
  if (!Array.isArray(messages)) return
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue
    for (let i = 0; i < msg.content.length; i++) {
      const block = msg.content[i]
      if (block && block.type === 'tool_result' && typeof block.content === 'string') {
        msg.content[i] = { ...block, content: trimToolResult(block.content) }
      }
    }
  }
}

const TURN_MARKER_STOP_SEQUENCES = [`\n\n${TURN_MARKER}`, `\n${TURN_MARKER}`, TURN_MARKER]

function injectTurnMarkerStopSequences(prepared: AnthropicRequest): void {
  const merged = new Set<string>(prepared.stop_sequences ?? [])
  for (const seq of TURN_MARKER_STOP_SEQUENCES) merged.add(seq)
  prepared.stop_sequences = [...merged].slice(0, MAX_STOP_SEQUENCES)
}

/** Apply every Claude Code body requirement. Returns the prepared request. */
export function prepareClaudeCodeBody(body: AnthropicRequest): AnthropicRequest {
  let prepared: AnthropicRequest = { ...body }

  convertReasoningBudget(prepared)
  prefixToolNames(prepared)
  injectTurnMarkerStopSequences(prepared)

  prepared.system = buildSystemPrompt(prepared.system)

  trimMessageToolResults(prepared.messages)
  applyCacheBreakpoints(prepared.messages)

  prepared = normalizeAnthropicToolIds(prepared)
  prepared = ensureTrailingUserMessage(prepared)

  logger.debug(
    `[anthropic] prepared body: ${Array.isArray(prepared.system) ? prepared.system.length : 0} system blocks, ${prepared.messages.length} messages, ${prepared.tools?.length ?? 0} tools`,
  )

  return prepared
}
