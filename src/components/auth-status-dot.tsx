import { useEffect, useState } from 'react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatRelativeExpiry } from '@/lib/format-relative-expiry'
import { cn } from '@/lib/utils'

export interface AuthStatus {
  authenticated: boolean
  expiresAt: number | null
  accountId: string | null
  planType: string | null
}

type Tone = 'ok' | 'warn' | 'down' | 'idle'

function toneFor(status: AuthStatus | null): Tone {
  if (!status) return 'idle'
  if (!status.authenticated) return 'down'
  if (status.expiresAt && status.expiresAt - Date.now() < 60 * 60_000) return 'warn'
  return 'ok'
}

function labelFor(tone: Tone, status: AuthStatus | null): string {
  if (tone === 'idle') return 'checking…'
  if (tone === 'down') return 'disconnected — sign in with Codex'
  if (tone === 'warn')
    return `token expires in ${formatRelativeExpiry(status?.expiresAt)} — re-auth soon`
  return `connected${status?.planType ? ` · ${status.planType}` : ''}`
}
export function AuthStatusDot() {
  const [status, setStatus] = useState<AuthStatus | null>(null)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const res = await fetch('/api/auth/status')
        if (!res.ok) return
        const data = (await res.json()) as AuthStatus
        if (alive) setStatus(data)
      } catch {
        // silent
      }
    }
    void poll()
    const id = setInterval(() => void poll(), 5_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

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
