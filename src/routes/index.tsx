import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'

import { ActivityPanel } from '@/components/console/activity-panel'
import { ProviderPanel } from '@/components/console/provider-panel'
import { PROVIDER_ORDER, type ProviderId } from '@/components/console/provider-mark'
import { RoutingStrip } from '@/components/console/routing-strip'
import { Button } from '@/components/ui/button'
import { useRefreshUsage } from '@/lib/api/mutations'
import { analyticsQuery, authStatusQuery, settingsQuery, usageQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { CURSOR_SENTINEL_MODEL } from '@/lib/cursor-byok'
import { deriveProbe, isOnboarded } from '@/lib/onboarding-state'

export const Route = createFileRoute('/')({ component: Console })

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
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 sm:py-12">
      <header className="space-y-3">
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{m.console_endpoint_label()}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
            {CURSOR_SENTINEL_MODEL}
          </code>
          <span aria-hidden>·</span>
          {tunnelHost ? (
            <code className="font-mono">{tunnelHost}</code>
          ) : (
            <span className="text-amber-500">{m.console_no_tunnel()}</span>
          )}
        </div>
      </header>

      <RoutingStrip activeProvider={activeProvider} connected={connected} />

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
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

      <ActivityPanel />
    </div>
  )
}
