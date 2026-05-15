import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useLogout, useSaveSettings } from '@/lib/api/mutations'
import { authStatusQuery, settingsQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { formatRelativeExpiry } from '@/lib/format-relative-expiry'
import { formatEffort, formatModel } from '@/lib/labels'
import { cn, errorMessage } from '@/lib/utils'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function SettingsPage() {
  const { data: settings } = useQuery(settingsQuery())
  const { data: status } = useQuery(authStatusQuery())
  // useSaveSettings handles the optimistic cache update + rollback; the cache
  // is shared, so the status strip / onboarding reflect the change too.
  const saveSettings = useSaveSettings()
  const logout = useLogout()

  function save(field: 'model' | 'reasoningEffort', value: string): void {
    saveSettings.mutate(
      { [field]: value },
      {
        onSuccess: () =>
          toast.success(field === 'model' ? m.toast_model_updated() : m.toast_reasoning_updated()),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 sm:py-12">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {m.settings_eyebrow()}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.settings_title()}</h1>
      </header>

      <Section
        title={m.settings_model_section_title()}
        description={m.settings_model_section_desc()}
      >
        <PickRow
          label={m.settings_model_label()}
          value={settings?.model ?? ''}
          options={settings?.allowed.models ?? []}
          formatLabel={formatModel}
          onPick={(v) => save('model', v)}
        />
        <PickRow
          label={m.settings_effort_label()}
          value={settings?.reasoningEffort ?? ''}
          options={settings?.allowed.efforts ?? []}
          formatLabel={formatEffort}
          onPick={(v) => save('reasoningEffort', v)}
        />
      </Section>

      <Separator />

      <Section title={m.settings_account_title()} description={m.settings_account_desc()}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[140px_1fr]">
          <dt className="text-muted-foreground">{m.settings_status()}</dt>
          <dd
            className={cn(
              'font-medium',
              status?.authenticated ? 'text-success' : 'text-destructive',
            )}
          >
            {status?.authenticated ? m.state_connected() : m.state_disconnected()}
          </dd>
          <dt className="text-muted-foreground">{m.settings_account_id()}</dt>
          <dd className="font-mono break-all">{status?.accountId ?? '—'}</dd>
          <dt className="text-muted-foreground">{m.settings_plan()}</dt>
          <dd className="font-mono">{status?.planType ?? '—'}</dd>
          <dt className="text-muted-foreground">{m.settings_token_expires()}</dt>
          <dd className="font-mono">{formatRelativeExpiry(status?.expiresAt)}</dd>
        </dl>

        <div className="pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, { onSuccess: () => toast.success(m.toast_logged_out()) })
            }
          >
            {logout.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
            {m.settings_sign_out()}
          </Button>
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function PickRow({
  label,
  value,
  options,
  formatLabel,
  onPick,
}: {
  label: string
  value: string
  options: string[]
  formatLabel: (id: string) => string
  onPick: (v: string) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
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
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {formatLabel(opt)}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
