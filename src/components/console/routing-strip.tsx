// The console's signature control: a segmented switch deciding which provider
// receives Cursor's `shim` traffic. Switching is one click — both providers
// stay authenticated — but a provider with no token can't be a routing target,
// so its segment is disabled until connected.

import { toast } from 'sonner'

import { useSetActiveProvider } from '@/lib/api/mutations'
import { m } from '@/paraglide/messages'
import { cn, errorMessage } from '@/lib/utils'
import { PROVIDER_INFO, PROVIDER_ORDER, ProviderMark, type ProviderId } from './provider-mark'

export function RoutingStrip({
  activeProvider,
  connected,
}: {
  activeProvider: ProviderId
  connected: Record<ProviderId, boolean>
}) {
  const setActive = useSetActiveProvider()

  function switchTo(provider: ProviderId): void {
    if (provider === activeProvider || !connected[provider]) return
    setActive.mutate(provider, {
      onSuccess: () =>
        toast.success(m.toast_provider_switched({ provider: PROVIDER_INFO[provider].name })),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {m.routing_label()}
        </p>
        <p className="text-sm text-muted-foreground">{m.routing_desc()}</p>
      </div>

      <div
        role="radiogroup"
        aria-label={m.routing_label()}
        className="inline-flex shrink-0 gap-1 rounded-lg bg-background p-1 ring-1 ring-foreground/10"
      >
        {PROVIDER_ORDER.map((provider) => {
          const isActive = provider === activeProvider
          const isConnected = connected[provider]
          const disabled = setActive.isPending || (!isConnected && !isActive)
          return (
            <button
              key={provider}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={disabled}
              title={
                !isConnected
                  ? m.routing_connect_first({ provider: PROVIDER_INFO[provider].name })
                  : undefined
              }
              onClick={() => switchTo(provider)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
                disabled &&
                  !isActive &&
                  'cursor-not-allowed opacity-40 hover:text-muted-foreground',
              )}
            >
              <ProviderMark provider={provider} className="size-3.5" />
              {PROVIDER_INFO[provider].name}
              {isActive ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider">
                  <span className="size-1.5 rounded-full bg-primary-foreground" />
                  {m.routing_live()}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
