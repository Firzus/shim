// Anthropic model + thinking-effort allow-lists.

import { ANTHROPIC_DEFAULT_MODEL } from './constants'

export const ANTHROPIC_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
] as const

export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number]

export const ANTHROPIC_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

export type AnthropicEffort = (typeof ANTHROPIC_EFFORTS)[number]

export const ANTHROPIC_DEFAULT_EFFORT: AnthropicEffort = 'high'

// Suggested `max_tokens` per effort level — guarantees the model has headroom
// to think + answer when the client doesn't provide one.
export const SUGGESTED_MAX_TOKENS: Record<AnthropicEffort, number> = {
  low: 8192,
  medium: 16384,
  high: 32768,
  xhigh: 65536,
  max: 65536,
}

// Map a requested model name (Cursor-side, or shim's `shim` sentinel, or a
// legacy Claude id) to the closest accepted Anthropic model.
const ALIASES: Record<string, string> = {
  opus: 'claude-opus-4-7',
  'claude-opus': 'claude-opus-4-7',
  'claude-3-opus': 'claude-opus-4-7',
  'claude-opus-4': 'claude-opus-4-7',
  'claude-opus-4-1': 'claude-opus-4-7',
  'claude-opus-4-5': 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  'claude-sonnet': 'claude-sonnet-4-6',
  'claude-3-sonnet': 'claude-sonnet-4-6',
  'claude-3-5-sonnet': 'claude-sonnet-4-6',
  'claude-sonnet-4': 'claude-sonnet-4-6',
  'claude-sonnet-4-5': 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
  'claude-haiku': 'claude-haiku-4-5',
  'claude-3-haiku': 'claude-haiku-4-5',
  'claude-3-5-haiku': 'claude-haiku-4-5',
  'claude-haiku-4': 'claude-haiku-4-5',
}

export interface ModelMappingResult {
  applied: string
  requested: string
  fellBack: boolean
}

const KNOWN = new Set<string>(ANTHROPIC_MODELS)

export function mapToAnthropicModel(requested: string | undefined): ModelMappingResult {
  const trimmed = (requested ?? '').trim()
  if (!trimmed) {
    return { applied: ANTHROPIC_DEFAULT_MODEL, requested: '', fellBack: true }
  }
  if (KNOWN.has(trimmed)) {
    return { applied: trimmed, requested: trimmed, fellBack: false }
  }
  const aliased = ALIASES[trimmed]
  if (aliased) {
    return { applied: aliased, requested: trimmed, fellBack: true }
  }
  return { applied: ANTHROPIC_DEFAULT_MODEL, requested: trimmed, fellBack: true }
}

// shim's reasoning-effort vocabulary is low|medium|high|extra-high; Anthropic
// uses low|medium|high|xhigh|max.
export function toAnthropicEffort(shimEffort: string): AnthropicEffort {
  if (shimEffort === 'extra-high') return 'xhigh'
  if ((ANTHROPIC_EFFORTS as readonly string[]).includes(shimEffort)) {
    return shimEffort as AnthropicEffort
  }
  return ANTHROPIC_DEFAULT_EFFORT
}
