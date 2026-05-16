import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { gsap, useGSAP } from '@/lib/gsap'
import { ActivityPanel } from '@/components/console/activity-panel'
import { ProviderPanel } from '@/components/console/provider-panel'
import { PROVIDER_ORDER, type ProviderId } from '@/components/console/provider-mark'
import { RoutingStrip } from '@/components/console/routing-strip'
import { SystemHeartbeat } from '@/components/console/system-heartbeat'
import { Button } from '@/components/ui/button'
import { useRefreshUsage } from '@/lib/api/mutations'
import { analyticsQuery, authStatusQuery, settingsQuery, usageQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { deriveProbe, isOnboarded } from '@/lib/onboarding-state'

export const Route = createFileRoute('/')({
  component: Console,
  // Prefetch the console's queries so SSR renders with data already in cache
  // and the client hydrates from the same dehydrated state. Without this, SSR
  // paints the pending (disconnected) UI while the client hydrates from
  // streamed query data — a hydration mismatch in RoutingStrip / ProviderPanel.
  // prefetchQuery swallows errors, so a Convex outage still degrades gracefully
  // instead of crashing the route.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(authStatusQuery()),
      context.queryClient.prefetchQuery(settingsQuery()),
      context.queryClient.prefetchQuery(analyticsQuery(24)),
      context.queryClient.prefetchQuery(usageQuery()),
    ])
  },
})

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function Console() {
  const navigate = useNavigate({ from: '/' })

  // Shared query keys — every other consumer resolves from this cache. The
  // auth-status poll (5s) is what surfaces an OAuth callback completing in the
  // background, so both providers' connect flows feel live.
  const auth = useQuery({ ...authStatusQuery(), refetchInterval: 5_000 })
  const settings = useQuery({ ...settingsQuery(), refetchInterval: 30_000 })
  const analytics = useQuery(analyticsQuery(24))
  const usage = useQuery({ ...usageQuery(), refetchInterval: 60_000 })
  const refreshUsage = useRefreshUsage()

  // One-shot staggered reveal on mount. The hidden start state lives in CSS
  // (`.console-anim [data-anim]`) so the SSR'd markup never flashes; under
  // reduced motion the timeline is skipped and that CSS rule is overridden.
  const containerRef = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          '[data-anim]',
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.07, ease: 'power2.out' },
        )
      })
    },
    { scope: containerRef },
  )

  const onboarded =
    auth.data && settings.data && analytics.data
      ? isOnboarded(deriveProbe(auth.data, settings.data, analytics.data))
      : null

  // Incomplete onboarding bounces to the wizard (a no-op once prereqs are met).
  useEffect(() => {
    if (onboarded === false) {
      void navigate({ to: '/onboarding', search: { step: 'welcome' } })
    }
  }, [onboarded, navigate])

  if (onboarded === false) return null

  const activeProvider: ProviderId = settings.data?.activeProvider ?? 'codex'
  const connected: Record<ProviderId, boolean> = {
    codex: auth.data?.providers.codex.authenticated ?? false,
    anthropic: auth.data?.providers.anthropic.authenticated ?? false,
  }
  const tunnelHost = hostOf(settings.data?.tunnelUrl)

  return (
    <div
      ref={containerRef}
      className="console-anim mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 sm:py-12"
    >
      <header className="space-y-3" data-anim>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.console_title()}</h1>
          <Button
            variant="ghost"
            size="sm"
            disabled={refreshUsage.isPending}
            onClick={() => refreshUsage.mutate()}
            aria-label={m.usage_refresh_aria()}
          >
            {refreshUsage.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {refreshUsage.isPending ? m.usage_refreshing() : m.usage_refresh()}
          </Button>
        </div>
        <SystemHeartbeat
          activeProvider={activeProvider}
          connected={connected}
          tunnelHost={tunnelHost}
          requests24h={analytics.data?.cursorRequests ?? 0}
          lastRequestAt={analytics.data?.lastRequestAt ?? null}
        />
      </header>

      <div data-anim>
        <RoutingStrip activeProvider={activeProvider} connected={connected} />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2" data-anim>
        {PROVIDER_ORDER.map((provider) => (
          <ProviderPanel
            key={provider}
            provider={provider}
            auth={auth.data?.providers[provider]}
            settings={settings.data?.providers[provider]}
            usage={usage.data?.[provider]}
            isActive={provider === activeProvider}
          />
        ))}
      </div>

      <div data-anim>
        <ActivityPanel />
      </div>
    </div>
  )
}
