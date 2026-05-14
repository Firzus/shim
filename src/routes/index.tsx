import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useEffect } from 'react'

import { PlanUsageHero } from '@/components/plan-usage-hero'
import { StatusStrip } from '@/components/status-strip'
import { isOnboarded, probeOnboarding } from '@/lib/onboarding-state'

export const Route = createFileRoute('/')({ component: Dashboard })

function Dashboard() {
  const navigate = useNavigate({ from: '/' })

  // If onboarding is incomplete (no auth, or zero cursor traffic ever observed),
  // bounce to the wizard. The wizard itself is a no-op when prereqs are met,
  // so this is safe to re-trigger.
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const probe = await probeOnboarding()
        if (alive && !isOnboarded(probe)) {
          void navigate({ to: '/onboarding', search: { step: 'welcome' } })
        }
      } catch {
        // silent — leave the dashboard rendered
      }
    })()
    return () => {
      alive = false
    }
  }, [navigate])

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          dashboard
        </p>
        <div className="flex items-end justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Overview</h1>
          <Link
            to="/setup"
            className="hidden items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Cursor setup <ArrowRight className="size-3" />
          </Link>
        </div>
      </header>

      <StatusStrip />
      <PlanUsageHero />
    </div>
  )
}
