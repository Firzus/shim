import { useEffect, useState } from 'react'

import type { AuthStatus } from '@/components/auth-status-dot'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface Settings {
  model: string
  reasoningEffort: string
}

export function StatusStrip() {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const [a, s] = await Promise.all([
          fetch('/api/auth/status').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/settings').then((r) => (r.ok ? r.json() : null)),
        ])
        if (!alive) return
        setStatus(a as AuthStatus | null)
        setSettings(s as Settings | null)
      } catch {
        // silent
      } finally {
        if (alive) setLoaded(true)
      }
    }
    void tick()
    const id = setInterval(() => void tick(), 5_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (!loaded) {
    return (
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card/40 p-4 sm:grid-cols-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    )
  }

  const authed = status?.authenticated === true
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-card/40 p-4 sm:grid-cols-4 sm:p-5">
      <Cell
        label="Status"
        value={authed ? 'connected' : 'disconnected'}
        tone={authed ? 'ok' : 'down'}
      />
      <Cell label="Plan" value={status?.planType ?? '—'} mono />
      <Cell label="Model" value={settings?.model ?? '—'} mono />
      <Cell label="Reasoning" value={settings?.reasoningEffort ?? '—'} mono />
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
