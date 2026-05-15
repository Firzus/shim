import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useExchangeCallback, useInitLogin } from '@/lib/api/mutations'
import { authStatusQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { errorMessage } from '@/lib/utils'

export function StepWelcome({ onAdvance }: { onAdvance: () => void }) {
  const [pollingAuth, setPollingAuth] = useState(false)
  const [showFallback, setShowFallback] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState('')

  // While waiting for the OAuth callback, poll auth-status every 2s; the
  // refetchInterval function stops the loop the moment we're authenticated.
  const { data: status } = useQuery({
    ...authStatusQuery(),
    refetchInterval: (query) => {
      if (!pollingAuth) return false
      if (query.state.data?.authenticated) return false
      return 2_000
    },
  })

  const login = useInitLogin()
  const callback = useExchangeCallback()
  const authenticated = status?.authenticated === true

  function handleLogin(): void {
    login.mutate(undefined, {
      onSuccess: (data) => {
        setShowFallback(!data.listenerActive)
        setPollingAuth(true)
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

  function handleFallback(): void {
    const trimmed = fallbackUrl.trim()
    if (!trimmed) return
    callback.mutate(trimmed, {
      onSuccess: () => {
        toast.success(m.toast_signed_in())
        setFallbackUrl('')
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.welcome_title()}</h1>
        <p className="text-base text-muted-foreground">{m.welcome_subtitle()}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm font-medium">{m.welcome_signin_title()}</p>
        <p className="mt-1 text-sm text-muted-foreground">{m.welcome_signin_desc()}</p>

        {authenticated ? (
          <div className="mt-4 flex items-center justify-between rounded-md border border-success/40 bg-success/10 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-success" />
              <span>
                {m.welcome_signed_in()}
                {status?.planType ? (
                  <span className="ml-1 text-muted-foreground">· {status.planType}</span>
                ) : null}
              </span>
            </div>
            <Button size="sm" onClick={onAdvance}>
              {m.common_continue()}
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleLogin} disabled={login.isPending}>
              {login.isPending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
              {m.welcome_signin_button()}
            </Button>
          </div>
        )}
      </div>

      {!authenticated && showFallback && (
        <details open className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <summary className="cursor-pointer font-medium">{m.welcome_fallback_summary()}</summary>
          <p className="mt-2 text-xs text-muted-foreground">{m.welcome_fallback_desc()}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={fallbackUrl}
              onChange={(e) => setFallbackUrl(e.target.value)}
              placeholder="http://localhost:1455/auth/callback?code=…&state=…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={callback.isPending || !fallbackUrl.trim()}
              onClick={handleFallback}
            >
              {m.welcome_exchange()}
            </Button>
          </div>
        </details>
      )}
    </div>
  )
}
