// Compact per-provider plan-usage meter. Renders each rate-limit window as a
// slim bar — restrained enough to sit inside a provider panel (the old
// full-width ring was a single-provider hero). Normalizes the two upstream
// shapes: Codex `rate_limit.{primary,secondary}_window` and Anthropic's
// header-derived `{ fiveHour, weekly }` snapshot.

import { memo, useState } from 'react'

import type { ProviderUsage } from '@/lib/api/types'
import { m } from '@/paraglide/messages'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import type { ProviderId } from './provider-mark'

interface MeterWindow {
  key: string
  label: string
  percent: number
  resetAtMs: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeWindows(provider: ProviderId, raw: unknown): MeterWindow[] {
  const root = asRecord(raw)
  if (!root) return []
  const out: MeterWindow[] = []

  if (provider === 'codex') {
    const rl = asRecord(root.rate_limit)
    if (!rl) return []
    for (const [key, label, src] of [
      ['primary', m.usage_window_5h(), rl.primary_window],
      ['secondary', m.usage_window_weekly(), rl.secondary_window],
    ] as const) {
      const w = asRecord(src)
      const pct = asNumber(w?.used_percent)
      const reset = asNumber(w?.reset_at)
      // Codex `reset_at` is unix epoch seconds — scale to ms.
      if (pct !== null && reset !== null) {
        out.push({ key, label, percent: pct, resetAtMs: reset * 1000 })
      }
    }
    return out
  }

  // Anthropic — header snapshot. `utilization` is sometimes a 0–1 fraction,
  // sometimes already a percentage; `resetAt` is already in ms.
  for (const [key, label, src] of [
    ['five', m.usage_window_5h(), root.fiveHour],
    ['week', m.usage_window_weekly(), root.weekly],
  ] as const) {
    const w = asRecord(src)
    const util = asNumber(w?.utilization)
    const reset = asNumber(w?.resetAt)
    if (util !== null && reset !== null) {
      out.push({ key, label, percent: util <= 1 ? util * 100 : util, resetAtMs: reset })
    }
  }
  return out
}

export function UsageMeter({
  provider,
  usage,
}: {
  provider: ProviderId
  usage: ProviderUsage | undefined
}) {
  const windows = normalizeWindows(provider, usage?.raw)

  if (windows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {provider === 'anthropic' ? m.usage_awaiting() : m.usage_no_snapshot()}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {windows.map((w) => (
        <UsageBar key={w.key} window={w} />
      ))}
      {usage ? (
        <p className="text-[11px] text-muted-foreground">
          <CapturedAgo stalenessMs={usage.stalenessMs} />
        </p>
      ) : null}
    </div>
  )
}

const UsageBar = memo(function UsageBar({ window: w }: { window: MeterWindow }) {
  const pct = Math.max(0, Math.min(100, w.percent))
  const tone = toneFor(pct)
  const fill =
    tone === 'danger' ? 'bg-destructive' : tone === 'warn' ? 'bg-amber-500' : 'bg-success'
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{w.label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {formatPct(pct)} · <ResetCountdown resetAtMs={w.resetAtMs} />
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
})

// Owns a 1s ticker so only the countdown re-renders.
function ResetCountdown({ resetAtMs }: { resetAtMs: number }) {
  const now = useNow()
  const seconds = Math.max(0, Math.floor((resetAtMs - now) / 1000))
  return <>{m.usage_resets_in({ duration: formatDuration(seconds) })}</>
}

// `stalenessMs` is the age the server computed at fetch time; project it
// forward from a mount baseline so the label ticks live.
function CapturedAgo({ stalenessMs }: { stalenessMs: number | null }) {
  const now = useNow()
  const [base] = useState(() => Date.now())
  const live = stalenessMs === null ? null : stalenessMs + Math.max(0, now - base)
  return <>{m.usage_captured({ ago: formatAgo(live) })}</>
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
