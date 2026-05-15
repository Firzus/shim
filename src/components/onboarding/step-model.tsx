import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSaveSettings } from '@/lib/api/mutations'
import { settingsQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { formatEffort, formatModel } from '@/lib/labels'
import { cn, errorMessage } from '@/lib/utils'

const EFFORT_TIPS: Record<string, () => string> = {
  low: m.effort_tip_low,
  medium: m.effort_tip_medium,
  high: m.effort_tip_high,
  'extra-high': m.effort_tip_extra_high,
}

const MODEL_TIPS: Record<string, () => string> = {
  'gpt-5.2': m.model_tip_gpt52,
  'gpt-5.3-codex': m.model_tip_gpt53_codex,
  'gpt-5.3-codex-spark': m.model_tip_gpt53_codex_spark,
  'gpt-5.4': m.model_tip_gpt54,
  'gpt-5.4-mini': m.model_tip_gpt54_mini,
  'gpt-5.5': m.model_tip_gpt55,
}

export function StepModel({ onAdvance, onBack }: { onAdvance: () => void; onBack: () => void }) {
  const { data: settings } = useQuery(settingsQuery())
  // Optimistic update + rollback live in useSaveSettings.
  const saveSettings = useSaveSettings()

  function save(field: 'model' | 'reasoningEffort', value: string): void {
    saveSettings.mutate(
      { [field]: value },
      {
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const ready = settings && settings.allowed.models.length > 0

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.model_title()}</h1>
        <p className="text-base text-muted-foreground">{m.model_subtitle()}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Picker
          title={m.model_picker_model()}
          options={settings?.allowed.models ?? []}
          tips={MODEL_TIPS}
          formatLabel={formatModel}
          value={settings?.model ?? ''}
          disabled={!ready}
          onPick={(v) => save('model', v)}
        />
        <Picker
          title={m.model_picker_effort()}
          options={settings?.allowed.efforts ?? []}
          tips={EFFORT_TIPS}
          formatLabel={formatEffort}
          value={settings?.reasoningEffort ?? ''}
          disabled={!ready}
          onPick={(v) => save('reasoningEffort', v)}
        />
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          {m.common_back()}
        </Button>
        <Button onClick={onAdvance} disabled={!ready}>
          {saveSettings.isPending ? <Loader2 className="animate-spin" /> : null}
          {m.common_continue()}
        </Button>
      </div>
    </div>
  )
}

function Picker({
  title,
  options,
  tips,
  formatLabel,
  value,
  disabled,
  onPick,
}: {
  title: string
  options: string[]
  tips: Record<string, () => string>
  formatLabel: (id: string) => string
  value: string
  disabled: boolean
  onPick: (v: string) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
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
                  'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  active
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border bg-background hover:border-border hover:bg-muted/50',
                )}
              >
                <span>{formatLabel(opt)}</span>
                {tips[opt] ? (
                  <span className="text-xs text-muted-foreground">{tips[opt]()}</span>
                ) : null}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
