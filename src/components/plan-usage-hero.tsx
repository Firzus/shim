import { memo, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useRefreshUsage } from '@/lib/api/mutations'
import { usageQuery } from '@/lib/api/queries'
import type { RateLimitWindow } from '@/lib/api/types'
import { m } from '@/paraglide/messages'
import { cn } from '@/lib/utils'

export function PlanUsageHero() {
  // No `now` ticker at this level on purpose: each live-tick UI piece
  // (CapturedAgo, ResetCountdown) owns its own 1s setInterval so the parent
  // and the memoized UsageRing/UsageBar don't re-render every second.
  const {
    data: usage,
    isPending,
    dataUpdatedAt,
  } = useQuery({ ...usageQuery(), refetchInterval: 60_000 })
  // Manual refresh — the POST returns the fresh snapshot, written straight
  // into the cache by useRefreshUsage (no follow-up GET).
  const refresh = useRefreshUsage()

  const primary = usage?.raw?.rate_limit?.primary_window ?? null
  const secondary = usage?.raw?.rate_limit?.secondary_window ?? null
  const plan = usage?.raw?.plan_type
  const hasData = primary || secondary

  if (isPending) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <Skeleton className="h-7 w-40" />
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr] lg:items-center">
          <Skeleton className="aspect-square w-full max-w-[260px]" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-2 w-full" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{m.usage_title()}</h2>
          {plan ? (
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {plan}
            </Badge>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          aria-label={m.usage_refresh_aria()}
        >
          {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {refresh.isPending ? m.usage_refreshing() : m.usage_refresh()}
        </Button>
      </div>

      {!hasData ? (
        <p className="mt-6 text-sm text-muted-foreground">{m.usage_no_snapshot()}</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr] lg:items-center">
          {primary ? <UsageRing label={m.usage_window_5h()} window={primary} /> : <div />}
          <div className="space-y-5">
            {primary ? <UsageBar label={m.usage_reset_5h()} window={primary} /> : null}
            {secondary ? <UsageBar label={m.usage_window_weekly()} window={secondary} /> : null}
            {!primary && !secondary ? (
              <p className="text-sm text-muted-foreground">{m.usage_no_window()}</p>
            ) : null}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        {usage ? (
          <CapturedAgo stalenessMs={usage.stalenessMs} dataUpdatedAt={dataUpdatedAt} />
        ) : (
          m.usage_captured({ ago: m.usage_just_now() })
        )}
      </p>
    </section>
  )
}

const UsageRing = memo(function UsageRing({
  label,
  window: w,
}: {
  label: string
  window: RateLimitWindow
}) {
  const pct = Math.max(0, Math.min(100, w.used_percent))
  const tone = toneFor(pct)
  const stroke =
    tone === 'danger'
      ? 'stroke-destructive'
      : tone === 'warn'
        ? 'stroke-amber-500'
        : 'stroke-success'
  const radius = 92
  const circumference = 2 * Math.PI * radius
  const dash = (pct / 100) * circumference

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[240px]">
      <svg viewBox="0 0 220 220" className="size-full -rotate-90">
        <circle
          cx="110"
          cy="110"
          r={radius}
          className="fill-none stroke-foreground/10"
          strokeWidth="14"
        />
        <circle
          cx="110"
          cy="110"
          r={radius}
          className={cn('fill-none transition-[stroke-dashoffset] duration-700 ease-out', stroke)}
          strokeWidth="14"
          strokeLinecap={pct > 1 ? 'round' : 'butt'}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - dash}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-4xl font-semibold tabular-nums">{formatPct(pct)}</span>
        <span className="mt-1 text-xs text-muted-foreground">{label}</span>
        <span className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <ResetCountdown resetAt={w.reset_at} />
        </span>
      </div>
    </div>
  )
})

const UsageBar = memo(function UsageBar({
  label,
  window: w,
}: {
  label: string
  window: RateLimitWindow
}) {
  const pct = Math.max(0, Math.min(100, w.used_percent))
  const tone = toneFor(pct)
  const bg = tone === 'danger' ? 'bg-destructive' : tone === 'warn' ? 'bg-amber-500' : 'bg-success'
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {formatPct(pct)} · <ResetCountdown resetAt={w.reset_at} />
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08] shadow-inner shadow-background/30">
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', bg)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
})

// Owns its own 1s ticker so it can re-render in isolation. The parent
// PlanUsageHero never re-renders from this tick.
function ResetCountdown({ resetAt }: { resetAt: number }) {
  const now = useNow()
  const duration = formatDuration(Math.max(0, Math.floor(resetAt - now / 1000)))
  return <>{m.usage_resets_in({ duration })}</>
}

function CapturedAgo({
  stalenessMs,
  dataUpdatedAt,
}: {
  stalenessMs: number | null
  dataUpdatedAt: number
}) {
  const now = useNow()
  return (
    <>{m.usage_captured({ ago: formatAgo(getStalenessMs(stalenessMs, dataUpdatedAt, now)) })}</>
  )
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function toneFor(pct: number): 'ok' | 'warn' | 'danger' {
  if (pct >= 85) return 'danger'
  if (pct >= 60) return 'warn'
  return 'ok'
}

function formatPct(pct: number): string {
  return `${pct.toFixed(pct > 0 && pct < 1 ? 2 : 1)}%`
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const rm = mins % 60
  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}

function formatAgo(ms: number | null): string {
  if (ms === null || ms < 0) return m.usage_just_now()
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins}m`
  return `${Math.round(mins / 60)}h`
}

// Project the server-reported staleness forward by the time elapsed since the
// query last resolved (dataUpdatedAt is TanStack Query's equivalent of the old
// client-side `receivedAt`).
function getStalenessMs(
  stalenessMs: number | null,
  dataUpdatedAt: number,
  now: number,
): number | null {
  if (stalenessMs === null) return null
  return stalenessMs + Math.max(0, now - dataUpdatedAt)
}
