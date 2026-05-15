import { useQuery } from '@tanstack/react-query'

import { Skeleton } from '@/components/ui/skeleton'
import { authStatusQuery, settingsQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { formatEffort, formatModel } from '@/lib/labels'
import { cn } from '@/lib/utils'

export function StatusStrip() {
  // Shared query keys: auth-status / settings are also consumed elsewhere, so
  // TanStack Query dedupes the network requests. The 30s refetchInterval keeps
  // this strip fresh; no manual setInterval or stale-response guard needed.
  const { data: status } = useQuery({ ...authStatusQuery(), refetchInterval: 30_000 })
  const { data: settings } = useQuery({ ...settingsQuery(), refetchInterval: 30_000 })
  const loaded = status !== undefined && settings !== undefined

  if (!loaded) {
    return (
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card/40 p-4 sm:grid-cols-3 md:grid-cols-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    )
  }

  const authed = status?.authenticated === true

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-card/40 p-4 sm:grid-cols-3 sm:p-5 md:grid-cols-4">
      <Cell
        label={m.status_label_status()}
        value={authed ? m.state_connected() : m.state_disconnected()}
        tone={authed ? 'ok' : 'down'}
      />
      <Cell label={m.status_label_plan()} value={status?.planType ?? '—'} mono />
      <Cell label={m.status_label_model()} value={settings ? formatModel(settings.model) : '—'} />
      <Cell
        label={m.status_label_reasoning()}
        value={settings ? formatEffort(settings.reasoningEffort) : '—'}
      />
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
