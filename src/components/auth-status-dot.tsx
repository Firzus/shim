import { useQuery } from '@tanstack/react-query'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { authStatusQuery } from '@/lib/api/queries'
import type { AuthStatus } from '@/lib/api/types'
import { m } from '@/paraglide/messages'
import { formatRelativeExpiry } from '@/lib/format-relative-expiry'
import { cn } from '@/lib/utils'

type Tone = 'ok' | 'warn' | 'down' | 'idle'

function toneFor(status: AuthStatus | null): Tone {
  if (!status) return 'idle'
  if (!status.authenticated) return 'down'
  if (status.expiresAt && status.expiresAt - Date.now() < 60 * 60_000) return 'warn'
  return 'ok'
}

function labelFor(tone: Tone, status: AuthStatus | null): string {
  if (tone === 'idle') return m.auth_checking()
  if (tone === 'down') return m.auth_disconnected()
  if (tone === 'warn') return m.auth_expiring({ expiry: formatRelativeExpiry(status?.expiresAt) })
  return `${m.auth_connected()}${status?.planType ? ` · ${status.planType}` : ''}`
}
export function AuthStatusDot() {
  const { data } = useQuery({ ...authStatusQuery(), refetchInterval: 5_000 })
  const status = data ?? null

  const tone = toneFor(status)
  const dotColor =
    tone === 'ok'
      ? 'bg-success shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-success)_30%,transparent)]'
      : tone === 'warn'
        ? 'bg-amber-500 shadow-[0_0_0_3px_color-mix(in_oklab,#f59e0b_30%,transparent)]'
        : tone === 'down'
          ? 'bg-destructive shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-destructive)_30%,transparent)]'
          : 'bg-muted-foreground/40'

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={labelFor(tone, status)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-muted/50"
            />
          }
        >
          <span className={cn('size-2 rounded-full transition-colors', dotColor)} />
        </TooltipTrigger>
        <TooltipContent side="bottom">{labelFor(tone, status)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
