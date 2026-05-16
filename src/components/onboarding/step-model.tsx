import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  PROVIDER_INFO,
  PROVIDER_ORDER,
  ProviderMark,
  type ProviderId,
} from '@/components/console/provider-mark'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSaveSettings, useSetActiveProvider } from '@/lib/api/mutations'
import { authStatusQuery, settingsQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { formatEffort, formatModel } from '@/lib/labels'
import { cn, errorMessage } from '@/lib/utils'

export function StepModel({ onAdvance, onBack }: { onAdvance: () => void; onBack: () => void }) {
  const { data: auth } = useQuery(authStatusQuery())
  const { data: settings } = useQuery(settingsQuery())
  const saveSettings = useSaveSettings()
  const setActiveProvider = useSetActiveProvider()

  const connected = PROVIDER_ORDER.filter((p) => auth?.providers[p].authenticated)
  const active: ProviderId = settings?.activeProvider ?? 'codex'
  // Configure whichever provider will serve traffic. If the stored active
  // provider isn't connected, fall back to the first one that is.
  const selected: ProviderId = connected.includes(active) ? active : (connected[0] ?? 'codex')
  const view = settings?.providers[selected]
  const ready = Boolean(view && view.allowed.models.length > 0)

  function chooseProvider(provider: ProviderId): void {
    if (provider === selected) return
    setActiveProvider.mutate(provider, { onError: (error) => toast.error(errorMessage(error)) })
  }

  function save(field: 'model' | 'reasoningEffort', value: string): void {
    saveSettings.mutate(
      { provider: selected, [field]: value },
      { onError: (error) => toast.error(errorMessage(error)) },
    )
  }

  // Leaving this step pins the active provider to the one just configured —
  // covers the single-connected case where no selector is shown.
  function handleContinue(): void {
    if (selected === active) {
      onAdvance()
      return
    }
    setActiveProvider.mutate(selected, {
      onSuccess: () => onAdvance(),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.model_title()}</h1>
        <p className="text-base text-muted-foreground">{m.model_subtitle()}</p>
      </div>

      {connected.length > 1 ? (
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {m.model_provider_label()}
          </p>
          <div className="inline-flex gap-1 rounded-lg bg-card p-1 ring-1 ring-foreground/10">
            {connected.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => chooseProvider(provider)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  provider === selected
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <ProviderMark provider={provider} className="size-3.5" />
                {PROVIDER_INFO[provider].name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Picker
          title={m.model_picker_model()}
          options={view?.allowed.models ?? []}
          value={view?.model ?? ''}
          format={formatModel}
          disabled={!ready}
          onPick={(v) => save('model', v)}
        />
        <Picker
          title={m.model_picker_effort()}
          options={view?.allowed.efforts ?? []}
          value={view?.effort ?? ''}
          format={formatEffort}
          disabled={!ready}
          onPick={(v) => save('reasoningEffort', v)}
        />
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          {m.common_back()}
        </Button>
        <Button onClick={handleContinue} disabled={!ready || setActiveProvider.isPending}>
          {saveSettings.isPending || setActiveProvider.isPending ? (
            <Loader2 className="animate-spin" />
          ) : null}
          {m.common_continue()}
        </Button>
      </div>
    </div>
  )
}

function Picker({
  title,
  options,
  value,
  format,
  disabled,
  onPick,
}: {
  title: string
  options: string[]
  value: string
  format: (id: string) => string
  disabled: boolean
  onPick: (value: string) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <div className="mt-3 flex flex-col gap-1.5">
        {options.length === 0 ? (
          <Skeleton className="h-9" />
        ) : (
          options.map((opt) => {
            const active = opt === value
            return (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                onClick={() => onPick(opt)}
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  active
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground',
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
