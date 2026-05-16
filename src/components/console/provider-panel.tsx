// One provider, fully self-contained: auth state, account metadata, model +
// effort selection, plan usage, and connect / sign-out / set-active actions.
// Both panels render at once so Codex and Claude are always comparable; the
// active one (the routing target) carries an orange ring + LIVE badge.

import { Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useLogout, useSaveSettings, useSetActiveProvider } from '@/lib/api/mutations'
import type { AuthStatus, ProviderUsage, Settings } from '@/lib/api/types'
import { m } from '@/paraglide/messages'
import { formatRelativeExpiry } from '@/lib/format-relative-expiry'
import { formatEffort, formatModel } from '@/lib/labels'
import { cn, errorMessage } from '@/lib/utils'
import { ProviderConnect } from './provider-connect'
import { PROVIDER_INFO, ProviderMark, type ProviderId } from './provider-mark'
import { UsageMeter } from './usage-meter'

type ProviderAuth = AuthStatus['providers']['codex']
type ProviderSettings = Settings['providers']['codex']

const EXPIRY_WARN_MS = 60 * 60_000

export function ProviderPanel({
  provider,
  auth,
  settings,
  usage,
  isActive,
}: {
  provider: ProviderId
  auth: ProviderAuth | undefined
  settings: ProviderSettings | undefined
  usage: ProviderUsage | undefined
  isActive: boolean
}) {
  const saveSettings = useSaveSettings()
  const logout = useLogout()
  const setActive = useSetActiveProvider()

  const info = PROVIDER_INFO[provider]
  const authenticated = auth?.authenticated === true
  const expiringSoon =
    authenticated && auth?.expiresAt != null && auth.expiresAt - Date.now() < EXPIRY_WARN_MS

  function pick(field: 'model' | 'reasoningEffort', value: string): void {
    saveSettings.mutate(
      { provider, [field]: value },
      {
        onSuccess: () =>
          toast.success(field === 'model' ? m.toast_model_updated() : m.toast_reasoning_updated()),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <Card className={cn('gap-0', isActive ? 'ring-primary/40' : 'ring-foreground/10')}>
      <div className="flex flex-1 flex-col gap-4 px-4">
        {/* Identity + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-foreground/5">
              <ProviderMark provider={provider} className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{info.name}</span>
                {isActive ? (
                  <Badge className="font-mono text-[10px] uppercase tracking-wider">
                    {m.routing_live()}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">{info.vendor}</p>
            </div>
          </div>
          <StatusChip
            tone={authenticated ? (expiringSoon ? 'warn' : 'ok') : 'down'}
            label={
              authenticated
                ? expiringSoon
                  ? m.state_expiring()
                  : m.state_connected()
                : m.state_disconnected()
            }
          />
        </div>

        {authenticated ? (
          <>
            {/* Account */}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{m.settings_plan()}</dt>
              <dd className="text-right font-mono">{auth?.planType ?? '—'}</dd>
              {auth?.accountId ? (
                <>
                  <dt className="text-muted-foreground">{m.settings_account_id()}</dt>
                  <dd className="truncate text-right font-mono" title={auth.accountId}>
                    {auth.accountId}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">{m.settings_token_expires()}</dt>
              <dd className="text-right font-mono">{formatRelativeExpiry(auth?.expiresAt)}</dd>
            </dl>

            {/* Model + effort */}
            <PickRow
              label={m.settings_model_label()}
              value={settings?.model ?? ''}
              options={settings?.allowed.models ?? []}
              format={formatModel}
              onPick={(v) => pick('model', v)}
            />
            <PickRow
              label={m.settings_effort_label()}
              value={settings?.effort ?? ''}
              options={settings?.allowed.efforts ?? []}
              format={formatEffort}
              onPick={(v) => pick('reasoningEffort', v)}
            />

            {/* Plan usage */}
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {m.usage_title()}
              </p>
              <UsageMeter provider={provider} usage={usage} />
            </div>

            {/* Actions — pinned to the card foot so both panels' footers align */}
            <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
              {!isActive ? (
                <Button
                  size="sm"
                  disabled={setActive.isPending}
                  onClick={() =>
                    setActive.mutate(provider, {
                      onSuccess: () =>
                        toast.success(m.toast_provider_switched({ provider: info.name })),
                      onError: (error) => toast.error(errorMessage(error)),
                    })
                  }
                >
                  {setActive.isPending ? <Loader2 className="animate-spin" /> : null}
                  {m.routing_activate()}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={logout.isPending}
                onClick={() =>
                  logout.mutate(provider, {
                    onSuccess: () => toast.success(m.toast_logged_out()),
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                {logout.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
                {m.settings_sign_out()}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">{m.provider_disconnected_desc()}</p>
            <ProviderConnect provider={provider} />
          </div>
        )}
      </div>
    </Card>
  )
}

function StatusChip({ tone, label }: { tone: 'ok' | 'warn' | 'down'; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 text-xs font-medium',
        tone === 'ok' && 'text-success',
        tone === 'warn' && 'text-amber-500',
        tone === 'down' && 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          tone === 'ok' && 'bg-success',
          tone === 'warn' && 'bg-amber-500',
          tone === 'down' && 'bg-muted-foreground/50',
        )}
      />
      {label}
    </span>
  )
}

function PickRow({
  label,
  value,
  options,
  format,
  onPick,
}: {
  label: string
  value: string
  options: string[]
  format: (id: string) => string
  onPick: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 ? (
          <span className="text-sm text-muted-foreground">{m.settings_loading()}</span>
        ) : (
          options.map((opt) => {
            const active = opt === value
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onPick(opt)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  active
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {format(opt)}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
