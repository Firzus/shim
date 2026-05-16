// Proxy activity over the last 24h — a single global strip (analytics are not
// split per provider). Reads the shared analytics query from cache.

import { useQuery } from '@tanstack/react-query'

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { analyticsQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { cn } from '@/lib/utils'

function formatCount(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function ActivityPanel() {
  const { data, isPending } = useQuery({ ...analyticsQuery(24), refetchInterval: 30_000 })

  return (
    <Card className="gap-0">
      <div className="space-y-4 px-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {m.activity_title()}
          </p>
          <p className="text-xs text-muted-foreground">{m.activity_window()}</p>
        </div>

        {isPending || !data ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={m.activity_requests()} value={formatCount(data.cursorRequests)} />
            <Stat
              label={m.activity_errors()}
              value={formatCount(data.errorRequests)}
              tone={data.errorRequests > 0 ? 'warn' : undefined}
            />
            <Stat label={m.activity_tokens_in()} value={formatCount(data.totalInputTokens)} />
            <Stat label={m.activity_tokens_out()} value={formatCount(data.totalOutputTokens)} />
          </div>
        )}
      </div>
    </Card>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div>
      <p
        className={cn(
          'font-mono text-2xl font-semibold tabular-nums',
          tone === 'warn' && 'text-amber-500',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
