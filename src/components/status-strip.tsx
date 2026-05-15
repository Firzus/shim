import { useEffect, useState } from 'react'

import type { AuthStatus } from '@/components/auth-status-dot'
import { Skeleton } from '@/components/ui/skeleton'
import { formatEffort, formatModel } from '@/lib/labels'
import { cn } from '@/lib/utils'

interface Settings {
  model: string
  reasoningEffort: string
}

interface Analytics {
  totalInputTokens: number
  totalCachedTokens: number
  cacheHitRate: number
}

export function StatusStrip() {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    let requestId = 0
    const tick = async () => {
      const currentRequestId = ++requestId
      try {
        const [a, s, an] = await Promise.all([
          fetch('/api/auth/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
          fetch('/api/settings', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/analytics?sinceHours=24&t=${Date.now()}`, { cache: 'no-store' }).then((r) =>
            r.ok ? r.json() : null,
          ),
        ])
        if (!alive || currentRequestId !== requestId) return
        setStatus(a as AuthStatus | null)
        setSettings(s as Settings | null)
        setAnalytics(an as Analytics | null)
      } catch {
        return
      } finally {
        if (alive && currentRequestId === requestId) setLoaded(true)
      }
    }
    void tick()
    const id = setInterval(() => void tick(), 30_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (!loaded) {
    return (
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card/40 p-4 sm:grid-cols-3 md:grid-cols-5">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    )
  }

  const authed = status?.authenticated === true
  const cacheHit =
    analytics && analytics.totalInputTokens > 0
      ? `${(analytics.cacheHitRate * 100).toFixed(1)}%`
      : '—'

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-card/40 p-4 sm:grid-cols-3 sm:p-5 md:grid-cols-5">
      <Cell
        label="Status"
        value={authed ? 'connected' : 'disconnected'}
        tone={authed ? 'ok' : 'down'}
      />
      <Cell label="Plan" value={status?.planType ?? '—'} mono />
      <Cell label="Model" value={settings ? formatModel(settings.model) : '—'} />
      <Cell label="Reasoning" value={settings ? formatEffort(settings.reasoningEffort) : '—'} />
      <Cell label="Cache hit (24h)" value={cacheHit} mono />
    </div>
  )
}

function Cell({
  label,
  value,
  tone,
  mono,
}: {
  label: string
  value: string
  tone?: 'ok' | 'down'
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-sm',
          mono && 'font-mono',
          tone === 'ok' && 'text-success',
          tone === 'down' && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  )
}
