// Proxy activity over the last 24h — a single global strip (analytics are not
// split per provider). Reads the shared analytics query from cache. The
// sparkline gives the window a shape; the stat tiles count up as polls land.

import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { analyticsQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { countUp, useGSAP } from '@/lib/gsap'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Sparkline } from './sparkline'

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
          <div className="space-y-4">
            <Skeleton className="h-10" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Sparkline data={data.hourly} animate />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label={m.activity_requests()} value={data.cursorRequests} />
              <Stat
                label={m.activity_errors()}
                value={data.errorRequests}
                tone={data.errorRequests > 0 ? 'warn' : undefined}
              />
              <Stat label={m.activity_tokens_in()} value={data.totalInputTokens} />
              <Stat label={m.activity_tokens_out()} value={data.totalOutputTokens} />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const prev = useRef(value)

  // Count up from the previous value whenever a poll brings a new one. The
  // synchronous set to the old value happens pre-paint (useGSAP is a layout
  // effect), so React's just-committed new value never flashes first.
  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      el.textContent = formatCount(prev.current)
      countUp(prev.current, value, (v) => {
        el.textContent = formatCount(v)
      })
      prev.current = value
    },
    { dependencies: [value] },
  )

  return (
    <div>
      <p
        ref={ref}
        className={cn(
          'font-mono text-2xl font-semibold tabular-nums',
          tone === 'warn' && 'text-amber-500',
        )}
      >
        {formatCount(value)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
