import { describe, expect, it } from 'vitest'

import { deriveCacheKey } from './cache-key'

// deriveCacheKey routes the same static prompt prefix to the same upstream
// machine for prompt-cache locality. The only properties that matter:
// determinism (same input ⇒ same key) and distinctness (different input ⇒
// different key, with high probability).

describe('deriveCacheKey', () => {
  it('returns the sentinel for an empty string', () => {
    expect(deriveCacheKey('')).toBe('shim-default')
  })

  it('is deterministic — identical input yields an identical key', () => {
    const a = deriveCacheKey('You are a helpful coding assistant.')
    const b = deriveCacheKey('You are a helpful coding assistant.')
    expect(a).toBe(b)
  })

  it('produces different keys for different instructions', () => {
    expect(deriveCacheKey('system-A')).not.toBe(deriveCacheKey('system-B'))
  })

  it('is sensitive to a single-character change', () => {
    expect(deriveCacheKey('prompt')).not.toBe(deriveCacheKey('prompt '))
  })

  it('formats the hash as shim-<8 lowercase hex digits>', () => {
    const key = deriveCacheKey('anything')
    expect(key).toMatch(/^shim-[0-9a-f]{8}$/)
  })

  it('zero-pads short hashes to a fixed 8-digit width', () => {
    // Every non-empty input must yield exactly the shim- + 8 char shape.
    for (const input of ['a', 'bb', 'ccc', 'a much longer instruction string']) {
      expect(deriveCacheKey(input)).toHaveLength('shim-'.length + 8)
    }
  })

  it('handles non-ASCII characters without throwing', () => {
    expect(() => deriveCacheKey('émojis 🚀 and ünïcode')).not.toThrow()
    expect(deriveCacheKey('émojis 🚀')).toMatch(/^shim-[0-9a-f]{8}$/)
  })
})
