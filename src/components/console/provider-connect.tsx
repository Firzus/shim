// Inline OAuth connect flow, shared by both providers. `initLogin` opens the
// authorize tab; a loopback provider (Codex) may complete automatically via
// its localhost listener — the console's auth-status poll picks that up — but
// the paste field is always offered so the hosted-paste flow (Anthropic) and
// the "port 1455 busy" fallback both work without branching here.

import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useExchangeCallback, useInitLogin } from '@/lib/api/mutations'
import { m } from '@/paraglide/messages'
import { cn, errorMessage } from '@/lib/utils'
import { PROVIDER_INFO, type ProviderId } from './provider-mark'

export function ProviderConnect({
  provider,
  className,
}: {
  provider: ProviderId
  className?: string
}) {
  const initLogin = useInitLogin()
  const exchange = useExchangeCallback()
  const [paste, setPaste] = useState('')
  const [started, setStarted] = useState(false)

  function start(): void {
    initLogin.mutate(provider, {
      onSuccess: (data) => {
        setStarted(true)
        window.open(data.authURL, '_blank', 'noopener,noreferrer')
        toast.message(m.toast_authorize_opened(), {
          description: data.listenerActive
            ? m.toast_authorize_waiting()
            : m.toast_authorize_listener_unavailable(),
        })
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  function complete(): void {
    const trimmed = paste.trim()
    if (!trimmed) return
    exchange.mutate(
      { provider, redirectUrl: trimmed },
      {
        onSuccess: () => {
          toast.success(m.toast_signed_in())
          setPaste('')
          setStarted(false)
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      <Button size="sm" disabled={initLogin.isPending} onClick={start} className="w-full">
        {initLogin.isPending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
        {m.provider_connect({ provider: PROVIDER_INFO[provider].name })}
      </Button>

      {started ? (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <input
              type="text"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={m.connect_paste_placeholder()}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs placeholder:text-muted-foreground/50"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={exchange.isPending || !paste.trim()}
              onClick={complete}
            >
              {exchange.isPending ? <Loader2 className="animate-spin" /> : null}
              {m.connect_complete()}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{m.connect_hint()}</p>
        </div>
      ) : null}
    </div>
  )
}
