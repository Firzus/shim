import { describe, expect, it } from 'vitest'

import { formatAgo, formatCount } from './format'

describe('formatCount', () => {
  it('renders sub-thousand counts verbatim', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(7)).toBe('7')
    expect(formatCount(999)).toBe('999')
  })

  it('renders thousands with one decimal below 10k, none above', () => {
    expect(formatCount(1_000)).toBe('1.0k')
    expect(formatCount(9_499)).toBe('9.5k')
    expect(formatCount(12_000)).toBe('12k')
    expect(formatCount(999_999)).toBe('1000k')
  })

  it('renders millions with one decimal', () => {
    expect(formatCount(1_000_000)).toBe('1.0M')
    expect(formatCount(2_500_000)).toBe('2.5M')
  })
})

describe('formatAgo', () => {
  it('renders seconds, minutes, hours, days at coarse magnitude', () => {
    expect(formatAgo(3_000)).toBe('3s')
    expect(formatAgo(5 * 60_000)).toBe('5m')
    expect(formatAgo(2 * 3_600_000)).toBe('2h')
    expect(formatAgo(4 * 86_400_000)).toBe('4d')
  })

  it('collapses negative or non-finite input to 0s', () => {
    expect(formatAgo(-100)).toBe('0s')
    expect(formatAgo(Number.NaN)).toBe('0s')
  })
})
