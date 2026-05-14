// Derived onboarding-completion state. There's no schema flag — the wizard
// is "done" when the user is authenticated and has sent at least one cursor
// request through the proxy. Step inference is used to deep-link `/onboarding`.

export type OnboardingStep = 'welcome' | 'model' | 'tunnel' | 'cursor' | 'test'

export const STEPS: OnboardingStep[] = ['welcome', 'model', 'tunnel', 'cursor', 'test']

export const STEP_LABEL: Record<OnboardingStep, string> = {
  welcome: 'Connect ChatGPT',
  model: 'Pick a model',
  tunnel: 'Expose publicly',
  cursor: 'Configure Cursor',
  test: 'Test the connection',
}

export interface OnboardingProbe {
  authenticated: boolean
  hasSettings: boolean
  hasTunnelUrl: boolean
  cursorRequests: number
}

export async function probeOnboarding(): Promise<OnboardingProbe> {
  const [auth, settings, analytics] = await Promise.all([
    fetch('/api/auth/status').then((r) => (r.ok ? r.json() : null)),
    fetch('/api/settings').then((r) => (r.ok ? r.json() : null)),
    fetch('/api/analytics?sinceHours=24').then((r) => (r.ok ? r.json() : null)),
  ])
  return {
    authenticated: Boolean(auth?.authenticated),
    hasSettings: Boolean(settings?.updatedAt),
    hasTunnelUrl: Boolean(settings?.tunnelUrl),
    cursorRequests: typeof analytics?.cursorRequests === 'number' ? analytics.cursorRequests : 0,
  }
}

export function isOnboarded(p: OnboardingProbe): boolean {
  return p.authenticated && p.hasTunnelUrl && p.cursorRequests > 0
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

export function nextStep(step: OnboardingStep): OnboardingStep | null {
  const i = stepIndex(step)
  return i < 0 || i >= STEPS.length - 1 ? null : STEPS[i + 1]
}

export function prevStep(step: OnboardingStep): OnboardingStep | null {
  const i = stepIndex(step)
  return i <= 0 ? null : STEPS[i - 1]
}
