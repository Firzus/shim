import { describe, expect, it } from 'vitest'

import type { Analytics, AuthStatus, Settings } from '@/lib/api/types'
import {
  deriveProbe,
  inferStep,
  isOnboarded,
  isOnboardingStep,
  STEPS,
  stepIndex,
  type OnboardingProbe,
} from './onboarding-state'

// The server-fn return types are large; deriveProbe only reads a handful of
// fields. These factories build just those fields and cast to the public type
// (same pattern as the translation tests) so the cases stay readable.

function auth(codex: boolean, anthropic: boolean): AuthStatus {
  return {
    providers: {
      codex: { authenticated: codex },
      anthropic: { authenticated: anthropic },
    },
  } as unknown as AuthStatus
}

function settings(over: Partial<{ updatedAt: number | null; tunnelUrl: string | null }>): Settings {
  return {
    updatedAt: over.updatedAt ?? null,
    tunnelUrl: over.tunnelUrl ?? null,
  } as unknown as Settings
}

function analytics(cursorRequests: number): Analytics {
  return { cursorRequests } as unknown as Analytics
}

describe('deriveProbe', () => {
  it('is authenticated when ANY provider is connected', () => {
    expect(deriveProbe(auth(true, false), settings({}), analytics(0)).authenticated).toBe(true)
    expect(deriveProbe(auth(false, true), settings({}), analytics(0)).authenticated).toBe(true)
    expect(deriveProbe(auth(false, false), settings({}), analytics(0)).authenticated).toBe(false)
  })

  it('treats a present updatedAt as hasSettings', () => {
    expect(
      deriveProbe(auth(true, false), settings({ updatedAt: 123 }), analytics(0)).hasSettings,
    ).toBe(true)
    expect(
      deriveProbe(auth(true, false), settings({ updatedAt: null }), analytics(0)).hasSettings,
    ).toBe(false)
  })

  it('treats a non-empty tunnelUrl as hasTunnelUrl', () => {
    const withUrl = deriveProbe(
      auth(true, false),
      settings({ tunnelUrl: 'https://shim.example.com' }),
      analytics(0),
    )
    expect(withUrl.hasTunnelUrl).toBe(true)
    expect(
      deriveProbe(auth(true, false), settings({ tunnelUrl: '' }), analytics(0)).hasTunnelUrl,
    ).toBe(false)
  })

  it('carries cursorRequests through verbatim', () => {
    expect(deriveProbe(auth(true, false), settings({}), analytics(7)).cursorRequests).toBe(7)
  })
})

function probe(over: Partial<OnboardingProbe>): OnboardingProbe {
  return {
    authenticated: false,
    hasSettings: false,
    hasTunnelUrl: false,
    cursorRequests: 0,
    ...over,
  }
}

describe('isOnboarded', () => {
  it('requires auth AND a tunnel URL — and nothing else', () => {
    expect(isOnboarded(probe({ authenticated: true, hasTunnelUrl: true }))).toBe(true)
    expect(isOnboarded(probe({ authenticated: false, hasTunnelUrl: true }))).toBe(false)
    expect(isOnboarded(probe({ authenticated: true, hasTunnelUrl: false }))).toBe(false)
  })

  it('does not gate on cursorRequests', () => {
    expect(isOnboarded(probe({ authenticated: true, hasTunnelUrl: true, cursorRequests: 0 }))).toBe(
      true,
    )
  })
})

describe('inferStep', () => {
  it('returns "welcome" when not authenticated', () => {
    expect(inferStep(probe({}))).toBe('welcome')
  })

  it('returns "model" once authenticated but settings unsaved', () => {
    expect(inferStep(probe({ authenticated: true }))).toBe('model')
  })

  it('returns "tunnel" once settings saved but no tunnel URL', () => {
    expect(inferStep(probe({ authenticated: true, hasSettings: true }))).toBe('tunnel')
  })

  it('returns "cursor" once the tunnel is set but no Cursor traffic yet', () => {
    expect(inferStep(probe({ authenticated: true, hasSettings: true, hasTunnelUrl: true }))).toBe(
      'cursor',
    )
  })

  it('returns "test" once Cursor traffic has been observed', () => {
    expect(
      inferStep(
        probe({
          authenticated: true,
          hasSettings: true,
          hasTunnelUrl: true,
          cursorRequests: 1,
        }),
      ),
    ).toBe('test')
  })
})

describe('isOnboardingStep', () => {
  it('accepts every declared step', () => {
    for (const step of STEPS) expect(isOnboardingStep(step)).toBe(true)
  })

  it('rejects an unknown string', () => {
    expect(isOnboardingStep('finished')).toBe(false)
    expect(isOnboardingStep('')).toBe(false)
  })
})

describe('stepIndex', () => {
  it('returns the position of a step in the canonical order', () => {
    expect(stepIndex('welcome')).toBe(0)
    expect(stepIndex('test')).toBe(STEPS.length - 1)
  })

  it('agrees with the STEPS array order', () => {
    STEPS.forEach((step, i) => expect(stepIndex(step)).toBe(i))
  })
})
