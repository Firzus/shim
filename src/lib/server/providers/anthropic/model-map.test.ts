import { describe, expect, it } from 'vitest'

import { ANTHROPIC_DEFAULT_MODEL } from './constants'
import {
  ANTHROPIC_DEFAULT_EFFORT,
  ANTHROPIC_MODELS,
  mapToAnthropicModel,
  toAnthropicEffort,
} from './model-map'

describe('mapToAnthropicModel', () => {
  it('passes a known model through unchanged with fellBack=false', () => {
    for (const model of ANTHROPIC_MODELS) {
      const result = mapToAnthropicModel(model)
      expect(result).toEqual({ applied: model, requested: model, fellBack: false })
    }
  })

  it('falls back to the default model for an empty / undefined request', () => {
    expect(mapToAnthropicModel(undefined).applied).toBe(ANTHROPIC_DEFAULT_MODEL)
    expect(mapToAnthropicModel('').applied).toBe(ANTHROPIC_DEFAULT_MODEL)
    expect(mapToAnthropicModel(undefined).fellBack).toBe(true)
  })

  it('trims surrounding whitespace before matching', () => {
    const result = mapToAnthropicModel('  claude-sonnet-4-6  ')
    expect(result.applied).toBe('claude-sonnet-4-6')
    expect(result.fellBack).toBe(false)
  })

  it('resolves family aliases to the current model and marks fellBack=true', () => {
    expect(mapToAnthropicModel('opus').applied).toBe('claude-opus-4-7')
    expect(mapToAnthropicModel('sonnet').applied).toBe('claude-sonnet-4-6')
    expect(mapToAnthropicModel('haiku').applied).toBe('claude-haiku-4-5')
    expect(mapToAnthropicModel('opus').fellBack).toBe(true)
  })

  it('upgrades a legacy Claude id to its current family member', () => {
    expect(mapToAnthropicModel('claude-3-5-sonnet').applied).toBe('claude-sonnet-4-6')
    expect(mapToAnthropicModel('claude-opus-4-1').applied).toBe('claude-opus-4-7')
  })

  it('falls back to the default for a wholly unknown model', () => {
    const result = mapToAnthropicModel('gpt-5.4')
    expect(result.applied).toBe(ANTHROPIC_DEFAULT_MODEL)
    expect(result.requested).toBe('gpt-5.4')
    expect(result.fellBack).toBe(true)
  })

  it('never produces an applied model outside the known list', () => {
    for (const probe of ['shim', 'opus', 'claude-3-haiku', 'unknown', '']) {
      expect(ANTHROPIC_MODELS as readonly string[]).toContain(mapToAnthropicModel(probe).applied)
    }
  })
})

describe('toAnthropicEffort', () => {
  it('passes a native Anthropic effort through unchanged', () => {
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
      expect(toAnthropicEffort(effort)).toBe(effort)
    }
  })

  it('translates shim’s "extra-high" to Anthropic’s "xhigh"', () => {
    expect(toAnthropicEffort('extra-high')).toBe('xhigh')
  })

  it('falls back to the default effort for an unrecognized value', () => {
    expect(toAnthropicEffort('turbo')).toBe(ANTHROPIC_DEFAULT_EFFORT)
    expect(toAnthropicEffort('')).toBe(ANTHROPIC_DEFAULT_EFFORT)
  })
})
