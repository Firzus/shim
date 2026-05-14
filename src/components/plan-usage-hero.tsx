import { memo, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface RateLimitWindow {
  limit_window_seconds: number
  reset_after_seconds: number
  reset_at: number
  used_percent: number
}

interface RateLimit {
  allowed: boolean
  limit_reached: boolean
  primary_window: RateLimitWindow | null
  secondary_window: RateLimitWindow | null
}

interface UsageRaw {
  plan_type?: string | null
  rate_limit?: RateLimit | null
}

interface UsageSnapshot {
  capturedAt: number | null
  raw: UsageRaw | null
  stalenessMs: number | null
}

interface UsageState extends UsageSnapshot {
  receivedAt: number
}

export function PlanUsageHero() {
  const [usage, setUsage] = useState<UsageState | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // No `now` ticker at this level on purpose: each live-tick UI piece
  // (CapturedAgo, ResetCountdown) owns its own 1s setInterval so the parent
  // and the memoized UsageRing/UsageBar don't re-render every second.

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const res = await fetch('/api/usage')
        if (res.ok && alive) {
          const nextUsage = (await res.json()) as UsageSnapshot
          setUsage({ ...nextUsage, receivedAt: Date.now() })
        }
      } catch {
        // silent
      } finally {
        if (alive) setLoaded(true)
      }
    }
    void tick()
    const id = setInterval(() => void tick(), 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  async function force(): Promise<void> {
    setRefreshing(true)
    try {
      const res = await fetch('/api/usage', { method: 'POST' })
      if (res.ok) {
        const nextUsage = (await res.json()) as UsageSnapshot
        setUsage({ ...nextUsage, receivedAt: Date.now() })
      }
    } catch {
      // silent
    } finally {
      setRefreshing(false)
    }
  }

  const primary = usage?.raw?.rate_limit?.primary_window ?? null
  const secondary = usage?.raw?.rate_limit?.secondary_window ?? null
  const plan = usage?.raw?.plan_type
  const hasData = primary || secondary

  if (!loaded) {
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
          <h2 className="text-lg font-semibold tracking-tight">Plan usage</h2>
          {plan ? (
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {plan}
            </Badge>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void force()}
          disabled={refreshing}
          aria-label="refresh usage"
        >
          {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {!hasData ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No snapshot yet — the poller refreshes every 5 minutes after you sign in.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr] lg:items-center">
          {primary ? <UsageRing label="5h window" window={primary} /> : <div />}
          <div className="space-y-5">
            {primary ? <UsageBar label="5-hour reset" window={primary} /> : null}
            {secondary ? <UsageBar label="Weekly window" window={secondary} /> : null}
            {!primary && !secondary ? (
              <p className="text-sm text-muted-foreground">No active rate-limit window.</p>
            ) : null}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Captured {usage ? <CapturedAgo usage={usage} /> : 'just now'} ago.
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
          resets in <ResetCountdown resetAt={w.reset_at} />
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
          {formatPct(pct)} · resets in <ResetCountdown resetAt={w.reset_at} />
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full transition-[width] duration-700 ease-out', bg)}
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
  return <>{formatDuration(Math.max(0, Math.floor(resetAt - now / 1000)))}</>
}

function CapturedAgo({ usage }: { usage: UsageState }) {
  const now = useNow()
  return <>{formatAgo(getStalenessMs(usage, now))}</>
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
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}

function formatAgo(ms: number | null): string {
  if (ms === null || ms < 0) return 'just now'
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  return `${Math.round(m / 60)}h`
}

function getStalenessMs(usage: UsageState, now: number): number | null {
  if (usage.stalenessMs === null) return null
  return usage.stalenessMs + Math.max(0, now - usage.receivedAt)
}
