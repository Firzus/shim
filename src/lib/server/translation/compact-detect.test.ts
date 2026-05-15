import { describe, expect, it } from 'vitest'

import {
  COMPACT_INSTRUCTIONS,
  SHIM_COMPACT_SENTINEL,
  detectCompactSentinel,
} from './compact-detect'

const userMsg = (text: string) => ({
  type: 'message' as const,
  role: 'user' as const,
  content: [{ type: 'input_text', text }],
})

const assistantMsg = (text: string) => ({
  type: 'message' as const,
  role: 'assistant' as const,
  content: [{ type: 'output_text', text }],
})

describe('detectCompactSentinel', () => {
  it('matches when the sentinel is in the last user message', () => {
    const input = [
      userMsg('older user turn'),
      assistantMsg('older reply'),
      userMsg(`${SHIM_COMPACT_SENTINEL}\n\nsummarize please`),
    ]
    const result = detectCompactSentinel(input)
    if (!result.matched) throw new Error('expected matched')
    const last = result.strippedInput[2] as { content: Array<{ text: string }> }
    expect(last.content[0].text).toBe('summarize please')
  })

  it('ignores the sentinel echoed in an older user message', () => {
    const input = [
      userMsg(`${SHIM_COMPACT_SENTINEL} prior compaction call`),
      assistantMsg('summary…'),
      userMsg('continue working'),
    ]
    const result = detectCompactSentinel(input)
    expect(result.matched).toBe(false)
  })

  it('ignores the sentinel inside an assistant message', () => {
    const input = [
      userMsg('normal'),
      assistantMsg(`some output containing ${SHIM_COMPACT_SENTINEL} verbatim`),
    ]
    const result = detectCompactSentinel(input)
    expect(result.matched).toBe(false)
  })

  it('returns matched=false for empty input', () => {
    expect(detectCompactSentinel([]).matched).toBe(false)
  })

  it('skips reasoning / function_call items when locating the last user message', () => {
    const input = [
      userMsg(`${SHIM_COMPACT_SENTINEL} please compact`),
      { type: 'reasoning', encrypted_content: 'opaque', summary: [] },
      { type: 'function_call', call_id: 'c1', name: 'read', arguments: '{}' },
    ]
    const result = detectCompactSentinel(input)
    expect(result.matched).toBe(true)
  })

  it('strips only the sentinel substring from a multi-part user message', () => {
    const input = [
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: `${SHIM_COMPACT_SENTINEL}\n` },
          { type: 'input_text', text: 'extra prose after the marker' },
          { type: 'input_image', image_url: 'https://example.test/img.png' },
        ],
      },
    ]
    const result = detectCompactSentinel(input)
    if (!result.matched) throw new Error('expected matched')
    const last = result.strippedInput[0] as { content: Array<Record<string, unknown>> }
    expect(last.content).toHaveLength(2)
    expect(last.content[0]).toEqual({ type: 'input_text', text: 'extra prose after the marker' })
    expect(last.content[1]).toEqual({
      type: 'input_image',
      image_url: 'https://example.test/img.png',
    })
  })

  it('injects a fallback text part when stripping leaves an empty content array', () => {
    const input = [userMsg(SHIM_COMPACT_SENTINEL)]
    const result = detectCompactSentinel(input)
    if (!result.matched) throw new Error('expected matched')
    const last = result.strippedInput[0] as { content: Array<{ type: string; text: string }> }
    expect(last.content).toHaveLength(1)
    expect(last.content[0].type).toBe('input_text')
    expect(last.content[0].text).toMatch(/summarize the conversation/i)
  })

  it('does not mutate the input array', () => {
    const original = [userMsg(`${SHIM_COMPACT_SENTINEL} go`)]
    const snapshot = JSON.parse(JSON.stringify(original))
    detectCompactSentinel(original)
    expect(original).toEqual(snapshot)
  })
})

describe('COMPACT_INSTRUCTIONS', () => {
  it('includes the framing markers and required sections', () => {
    expect(COMPACT_INSTRUCTIONS).toContain('=== SHIM COMPACTION ARTIFACT ===')
    expect(COMPACT_INSTRUCTIONS).toContain('=== END COMPACTION')
    for (const section of [
      '## Goal',
      '## Decisions made',
      '## Files touched',
      '## Open tasks',
      '## Latest state',
      '## Hand-off snippet',
    ]) {
      expect(COMPACT_INSTRUCTIONS).toContain(section)
    }
  })
})
