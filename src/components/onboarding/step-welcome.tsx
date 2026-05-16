import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'

import { ProviderConnect } from '@/components/console/provider-connect'
import { PROVIDER_INFO, PROVIDER_ORDER, ProviderMark } from '@/components/console/provider-mark'
import { Button } from '@/components/ui/button'
import { authStatusQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'

export function StepWelcome({ onAdvance }: { onAdvance: () => void }) {
  // Poll auth-status so a background OAuth callback flips a card to "signed in"
  // without a manual refresh; stop once both providers are connected.
  const { data: status } = useQuery({
    ...authStatusQuery(),
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && data.providers.codex.authenticated && data.providers.anthropic.authenticated) {
        return false
      }
      return 2_000
    },
  })

  const anyConnected =
    status?.providers.codex.authenticated === true ||
    status?.providers.anthropic.authenticated === true

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.welcome_title()}</h1>
        <p className="text-base text-muted-foreground">{m.welcome_subtitle()}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDER_ORDER.map((provider) => {
          const providerStatus = status?.providers[provider]
          const connected = providerStatus?.authenticated === true
          return (
            <div key={provider} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-md bg-foreground/5">
                  <ProviderMark provider={provider} />
                </span>
                <div>
                  <p className="font-medium">{PROVIDER_INFO[provider].name}</p>
                  <p className="text-xs text-muted-foreground">{PROVIDER_INFO[provider].vendor}</p>
                </div>
              </div>
              <div className="mt-4">
                {connected ? (
                  <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm">
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                    <span>
                      {m.welcome_signed_in()}
                      {providerStatus?.planType ? (
                        <span className="ml-1 text-muted-foreground">
                          · {providerStatus.planType}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ) : (
                  <ProviderConnect provider={provider} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-end">
        <Button onClick={onAdvance} disabled={!anyConnected}>
          {m.common_continue()}
        </Button>
      </div>
    </div>
  )
}
