import { Link, createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { BrandLink } from '@/components/brand-link'
import { LanguageSwitcher } from '@/components/language-switcher'
import { StepCursor } from '@/components/onboarding/step-cursor'
import { StepModel } from '@/components/onboarding/step-model'
import { StepTest } from '@/components/onboarding/step-test'
import { StepTunnel } from '@/components/onboarding/step-tunnel'
import { StepWelcome } from '@/components/onboarding/step-welcome'
import { m } from '@/paraglide/messages'
import { STEPS, isOnboardingStep, type OnboardingStep, stepIndex } from '@/lib/onboarding-state'

// Localised step labels for the progress indicator. Kept in the route (not
// onboarding-state.ts) so the lib stays free of UI-message imports.
const STEP_LABEL: Record<OnboardingStep, () => string> = {
  welcome: m.onboarding_step_welcome,
  model: m.onboarding_step_model,
  tunnel: m.onboarding_step_tunnel,
  cursor: m.onboarding_step_cursor,
  test: m.onboarding_step_test,
}

export const Route = createFileRoute('/onboarding')({
  validateSearch: (search: Record<string, unknown>): { step: OnboardingStep } => {
    const raw = typeof search.step === 'string' ? search.step : ''
    return { step: isOnboardingStep(raw) ? raw : 'welcome' }
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  const navigate = useNavigate({ from: '/onboarding' })
  const { step } = useSearch({ from: '/onboarding' })

  const idx = stepIndex(step)
  const total = STEPS.length
  const progress = ((idx + 1) / total) * 100

  function go(next: OnboardingStep): void {
    void navigate({ to: '/onboarding', search: { step: next } })
  }

  function finish(): void {
    void navigate({ to: '/' })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <BrandLink textClassName="text-sm" />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              {m.onboarding_skip()}
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-4 sm:px-6">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono uppercase tracking-wider text-muted-foreground">
              {m.onboarding_step_progress({ current: idx + 1, total })}
              <span className="ml-2 text-foreground">· {STEP_LABEL[step]()}</span>
            </span>
            <span className="font-mono text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          {renderStep(step, go, finish)}
        </div>
      </main>
    </div>
  )
}

function renderStep(
  step: OnboardingStep,
  go: (step: OnboardingStep) => void,
  finish: () => void,
): React.ReactNode {
  switch (step) {
    case 'welcome':
      return <StepWelcome onAdvance={() => go('model')} />
    case 'model':
      return <StepModel onAdvance={() => go('tunnel')} onBack={() => go('welcome')} />
    case 'tunnel':
      return <StepTunnel onAdvance={() => go('cursor')} onBack={() => go('model')} />
    case 'cursor':
      return <StepCursor onAdvance={() => go('test')} onBack={() => go('tunnel')} />
    case 'test':
      return <StepTest onAdvance={finish} onBack={() => go('cursor')} />
  }
}
