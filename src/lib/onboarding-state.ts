// Derived onboarding-completion state. There's no schema flag; step inference
// is used to deep-link `/onboarding`.

import type { Analytics, AuthStatus, Settings } from '@/lib/api/types'

export type OnboardingStep = 'welcome' | 'model' | 'tunnel' | 'cursor' | 'test'

export const STEPS: OnboardingStep[] = ['welcome', 'model', 'tunnel', 'cursor', 'test']

export interface OnboardingProbe {
  authenticated: boolean
  hasSettings: boolean
  hasTunnelUrl: boolean
  cursorRequests: number
}

// Build the probe from already-fetched query data. Callers feed the shared
// TanStack Query results (auth-status / settings / analytics) so no extra
// network round-trip is needed.
export function deriveProbe(
  auth: AuthStatus,
  settings: Settings,
  analytics: Analytics,
): OnboardingProbe {
  return {
    authenticated: auth.authenticated,
    hasSettings: Boolean(settings.updatedAt),
    hasTunnelUrl: Boolean(settings.tunnelUrl),
    cursorRequests: analytics.cursorRequests,
  }
}

export function isOnboarded(p: OnboardingProbe): boolean {
  // Onboarding is "done" once auth + tunnel are configured. We don't gate on
  // cursorRequests > 0 because (a) the synthetic test-connection ping isn't
  // recorded, and (b) clearing the analytics shouldn't bounce the user back
  // into the wizard loop.
  return p.authenticated && p.hasTunnelUrl
}

export function inferStep(p: OnboardingProbe): OnboardingStep {
  if (!p.authenticated) return 'welcome'
  if (!p.hasSettings) return 'model'
  if (!p.hasTunnelUrl) return 'tunnel'
  if (p.cursorRequests === 0) return 'cursor'
  return 'test'
}

export function isOnboardingStep(value: string): value is OnboardingStep {
  return STEPS.some((step) => step === value)
}

export function stepIndex(step: OnboardingStep): number {
  return STEPS.indexOf(step)
}
