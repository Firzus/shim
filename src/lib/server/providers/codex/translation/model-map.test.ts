import { describe, expect, it } from 'vitest'

import { CODEX_DEFAULT_MODEL } from '../constants'
import { ACCEPTED_CODEX_MODELS, mapToCodexModel } from './model-map'

// Codex upstream 400s on any model not on its plan allow-list. mapToCodexModel
// is the single guard: it must never let an unaccepted name through, and it
// should map intent-bearing aliases (mini/codex/pro) to a sensible neighbour
// rather than collapsing everything onto the default.

describe('mapToCodexModel', () => {
  it('passes a known model through unchanged with fellBack=false', () => {
    for (const model of ACCEPTED_CODEX_MODELS) {
      const result = mapToCodexModel(model)
      expect(result).toEqual({ applied: model, requested: model, fellBack: false })
    }
  })

  it('falls back to the default model for an empty / undefined request', () => {
    expect(mapToCodexModel(undefined)).toEqual({
      applied: CODEX_DEFAULT_MODEL,
      requested: '',
      fellBack: true,
    })
    expect(mapToCodexModel('')).toEqual({
      applied: CODEX_DEFAULT_MODEL,
      requested: '',
      fellBack: true,
    })
  })

  it('trims surrounding whitespace before matching', () => {
    const result = mapToCodexModel('  gpt-5.4  ')
    expect(result.applied).toBe('gpt-5.4')
    expect(result.fellBack).toBe(false)
  })

  it('maps a known alias to its neighbour and marks fellBack=true', () => {
    const result = mapToCodexModel('gpt-5-mini')
    expect(result.applied).toBe('gpt-5.4-mini')
    expect(result.requested).toBe('gpt-5-mini')
    expect(result.fellBack).toBe(true)
  })

  it('preserves intent — mini stays mini, codex stays codex', () => {
    expect(mapToCodexModel('gpt-4o-mini').applied).toBe('gpt-5.4-mini')
    expect(mapToCodexModel('gpt-5-codex').applied).toBe('gpt-5.3-codex')
  })

  it('falls back to the default for a wholly unknown model', () => {
    const result = mapToCodexModel('some-future-model-9000')
    expect(result.applied).toBe(CODEX_DEFAULT_MODEL)
    expect(result.requested).toBe('some-future-model-9000')
    expect(result.fellBack).toBe(true)
  })

  it('never produces an applied model outside the accepted allow-list', () => {
    const probes = ['codex', 'gpt-4.1', 'o3', 'gpt-5.5-pro', 'garbage', '', '   ']
    for (const probe of probes) {
      expect(ACCEPTED_CODEX_MODELS).toContain(mapToCodexModel(probe).applied)
    }
  })
})
