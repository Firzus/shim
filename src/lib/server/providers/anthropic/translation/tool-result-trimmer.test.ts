import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { trimToolResult } from './tool-result-trimmer'

// trimToolResult guards the Anthropic upstream from oversized tool results. It
// must (a) leave anything within budget untouched, and (b) when over budget,
// keep a head + tail and stay at roughly the requested character ceiling.

beforeEach(() => {
  // The trimmer logs an info line on every truncation — silence it.
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('trimToolResult', () => {
  it('returns the input unchanged when it fits within maxChars', () => {
    const content = 'short result'
    expect(trimToolResult(content, 1000)).toBe(content)
  })

  it('returns the input unchanged when it is exactly maxChars long', () => {
    const content = 'x'.repeat(100)
    expect(trimToolResult(content, 100)).toBe(content)
  })

  it('trims oversized content to roughly the maxChars budget', () => {
    const content = 'x'.repeat(10_000)
    const trimmed = trimToolResult(content, 1000)
    expect(trimmed.length).toBeLessThan(content.length)
    // Head + tail + marker stays close to the budget.
    expect(trimmed.length).toBeLessThanOrEqual(1100)
  })

  it('keeps the original head and tail around the truncation marker', () => {
    const content = 'HEAD' + 'm'.repeat(10_000) + 'TAIL'
    const trimmed = trimToolResult(content, 1000)
    expect(trimmed.startsWith('HEAD')).toBe(true)
    expect(trimmed.endsWith('TAIL')).toBe(true)
    expect(trimmed).toContain('truncated')
  })

  it('reports the removed character count in the marker', () => {
    const content = 'x'.repeat(10_000)
    const trimmed = trimToolResult(content, 1000)
    // The count is locale-formatted (the separator varies by ICU locale), so
    // match the marker shape rather than a specific grouping character.
    expect(trimmed).toMatch(/\[\.\.\. truncated .+ chars \.\.\.\]/)
  })

  it('returns content untouched when maxChars is zero or negative', () => {
    const content = 'anything at all'
    expect(trimToolResult(content, 0)).toBe(content)
    expect(trimToolResult(content, -5)).toBe(content)
  })
})
