import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useEffect } from 'react'

import { PlanUsageHero } from '@/components/plan-usage-hero'
import { StatusStrip } from '@/components/status-strip'
import { analyticsQuery, authStatusQuery, settingsQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { deriveProbe, isOnboarded } from '@/lib/onboarding-state'

export const Route = createFileRoute('/')({ component: Dashboard })

function Dashboard() {
  const navigate = useNavigate({ from: '/' })

  // Same shared query keys StatusStrip uses — these resolve from cache, no
  // extra network requests.
  const auth = useQuery(authStatusQuery())
  const settings = useQuery(settingsQuery())
  const analytics = useQuery(analyticsQuery(24))

  const onboarded =
    auth.data && settings.data && analytics.data
      ? isOnboarded(deriveProbe(auth.data, settings.data, analytics.data))
      : null

  // If onboarding is incomplete (no auth, or no tunnel configured), bounce to
  // the wizard. The wizard itself is a no-op when prereqs are met, so this is
  // safe to re-trigger.
  useEffect(() => {
    if (onboarded === false) {
      void navigate({ to: '/onboarding', search: { step: 'welcome' } })
    }
  }, [onboarded, navigate])

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {m.dashboard_eyebrow()}
        </p>
        <div className="flex items-end justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {m.dashboard_title()}
          </h1>
          <Link
            to="/setup"
            className="hidden items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            {m.dashboard_cursor_setup()} <ArrowRight className="size-3" />
          </Link>
        </div>
      </header>

      <StatusStrip />
      <PlanUsageHero />
    </div>
  )
}
