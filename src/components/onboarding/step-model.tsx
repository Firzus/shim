import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Settings {
  model: string
  reasoningEffort: string
  updatedAt: number | null
  allowed: { models: string[]; efforts: string[] }
}

const EFFORT_TIPS: Record<string, string> = {
  none: 'no thinking — fastest, cheapest',
  low: 'a little thinking',
  medium: 'balanced (default)',
  high: 'deep thinking — slower, smarter',
}

const MODEL_TIPS: Record<string, string> = {
  'gpt-5.2': 'fast workhorse',
  'gpt-5.4': 'flagship — recommended',
  'gpt-5.4-mini': 'cheap & fast',
  'gpt-5.5': 'newest, most capable',
}

export function StepModel({ onAdvance, onBack }: { onAdvance: () => void; onBack: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) setSettings((await res.json()) as Settings)
      } catch {
        // silent
      }
    })()
  }, [])

  async function save(field: 'model' | 'reasoningEffort', value: string): Promise<void> {
    if (!settings) return
    const previous = settings
    setSettings({ ...settings, [field]: value })
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'save failed')
    } catch (error) {
      setSettings(previous)
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const ready = settings && settings.allowed.models.length > 0

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pick a model</h1>
        <p className="text-base text-muted-foreground">
          shim overrides whatever Cursor sends with the model you choose here. You can change it any
          time from Settings.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Picker
          title="Model"
          options={settings?.allowed.models ?? []}
          tips={MODEL_TIPS}
          value={settings?.model ?? ''}
          disabled={!ready}
          onPick={(v) => void save('model', v)}
        />
        <Picker
          title="Reasoning effort"
          options={settings?.allowed.efforts ?? []}
          tips={EFFORT_TIPS}
          value={settings?.reasoningEffort ?? ''}
          disabled={!ready}
          onPick={(v) => void save('reasoningEffort', v)}
        />
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onAdvance} disabled={!ready}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Continue
        </Button>
      </div>
    </div>
  )
}

function Picker({
  title,
  options,
  tips,
  value,
  disabled,
  onPick,
}: {
  title: string
  options: string[]
  tips: Record<string, string>
  value: string
  disabled: boolean
  onPick: (v: string) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="mt-3 flex flex-col gap-1.5">
        {options.length === 0 ? (
          <div className="h-9 animate-pulse rounded-md bg-muted/50" />
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
                <span className="font-mono">{opt}</span>
                {tips[opt] ? (
                  <span className="text-xs text-muted-foreground">{tips[opt]}</span>
                ) : null}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
