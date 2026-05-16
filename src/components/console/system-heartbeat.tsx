// The console's vital sign: one dominant line answering "is the proxy live,
// where is it routing, and is traffic flowing?" — so the operator reads the
// system state in a glance instead of reconstructing it from scattered chips.
// Props are the already-fetched query data (no re-fetch). When exactly one
// provider is disconnected it also surfaces a Zeigarnik nudge to finish wiring.

import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import { m } from '@/paraglide/messages'
import { CURSOR_SENTINEL_MODEL } from '@/lib/cursor-byok'
import { formatAgo, formatCount } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import { PROVIDER_INFO, PROVIDER_ORDER, ProviderMark, type ProviderId } from './provider-mark'

export function SystemHeartbeat({
  activeProvider,
  connected,
  tunnelHost,
  requests24h,
  lastRequestAt,
}: {
  activeProvider: ProviderId
  connected: Record<ProviderId, boolean>
  tunnelHost: string | null
  requests24h: number
  lastRequestAt: number | null
}) {
  // Relative-time text depends on the wall clock, which differs server/client.
  // Gate it behind a mounted flag so SSR and first hydration render identically.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const now = useNow()

  const live = connected[activeProvider] && tunnelHost !== null
  const disconnected = PROVIDER_ORDER.filter((p) => !connected[p])
  const nudge = disconnected.length === 1 ? disconnected[0] : null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className="inline-flex items-center gap-2 font-medium">
          <StatusDot tone={live ? 'ok' : 'warn'} />
          {live ? m.heartbeat_proxy_active() : m.heartbeat_proxy_degraded()}
        </span>

        <Sep />
        <span className="inline-flex items-center gap-1.5">
          <ProviderMark provider={activeProvider} className="size-3.5" />
          {m.heartbeat_routing_to({ provider: PROVIDER_INFO[activeProvider].name })}
        </span>

        <Sep />
        <span className="font-mono tabular-nums text-muted-foreground">
          {m.heartbeat_requests_24h({ count: formatCount(requests24h) })}
        </span>

        {mounted ? (
          <>
            <Sep />
            <span className="text-muted-foreground">
              {lastRequestAt === null
                ? m.heartbeat_no_requests()
                : m.heartbeat_last_request({ ago: formatAgo(now - lastRequestAt) })}
            </span>
          </>
        ) : null}
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

      {nudge ? <ConnectionNudge provider={nudge} /> : null}
    </div>
  )
}

function Sep() {
  return (
    <span aria-hidden className="text-muted-foreground/40">
      ·
    </span>
  )
}

function StatusDot({ tone }: { tone: 'ok' | 'warn' }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        tone === 'ok'
          ? 'bg-success shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-success)_25%,transparent)]'
          : 'bg-amber-500 shadow-[0_0_0_3px_color-mix(in_oklab,#f59e0b_25%,transparent)]',
      )}
    />
  )
}

function ConnectionNudge({ provider }: { provider: ProviderId }) {
  function scrollToPanel(): void {
    document
      .getElementById(`provider-panel-${provider}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-500">
      <TriangleAlert className="size-3.5 shrink-0" />
      <span>{m.heartbeat_nudge_not_connected({ provider: PROVIDER_INFO[provider].name })}</span>
      <button
        type="button"
        onClick={scrollToPanel}
        className="ml-auto font-medium underline underline-offset-2 hover:no-underline"
      >
        {m.heartbeat_nudge_connect()}
      </button>
    </div>
  )
}
