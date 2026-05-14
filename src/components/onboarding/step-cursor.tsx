import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SENTINEL = 'codex'

interface Settings {
  tunnelUrl: string | null
}

export function StepCursor({ onAdvance, onBack }: { onAdvance: () => void; onBack: () => void }) {
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const data = (await res.json()) as Settings
          setTunnelUrl(data.tunnelUrl)
        }
      } finally {
        setLoaded(true)
      }
    })()
  }, [])

  const baseUrl = tunnelUrl ? `${tunnelUrl}/v1` : ''

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Configure Cursor</h1>
        <p className="text-base text-muted-foreground">
          Point Cursor at the public URL you just set. shim will accept whatever model name Cursor
          sends and swap it for the one you picked.
        </p>
      </div>

      <ol className="space-y-3 text-sm">
        <Step n={1}>
          Open <em className="not-italic font-mono text-foreground">Cursor → Settings → Models</em>.
        </Step>
        <Step n={2}>
          Click <em className="not-italic font-mono text-foreground">+ Add Custom Model</em> and
          paste the values below.
        </Step>
        <Step n={3}>
          Paste <em className="not-italic font-mono text-foreground">any non-empty string</em> as
          the API key — shim uses your ChatGPT session, not the key.
        </Step>
      </ol>

      {loaded && !tunnelUrl ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">No tunnel URL on file</p>
            <p className="text-xs text-muted-foreground">
              Go back one step and save your public URL — Cursor refuses{' '}
              <span className="font-mono">localhost</span>.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        <CopyField label="Base URL" value={baseUrl} disabled={!baseUrl} />
        <CopyField
          label="Model name"
          value={SENTINEL}
          hint="shim swaps this for your chosen Codex model"
        />
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onAdvance} disabled={!tunnelUrl}>
          I've added the model
        </Button>
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
        {n}
      </span>
      <span className="text-muted-foreground">{children}</span>
    </li>
  )
}

function CopyField({
  label,
  value,
  hint,
  disabled,
}: {
  label: string
  value: string
  hint?: string
  disabled?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      // silent
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="mt-2 flex items-stretch gap-2">
        <code
          className={cn(
            'flex-1 truncate rounded-md bg-background px-3 py-2 font-mono text-sm',
            disabled ? 'text-muted-foreground/40' : 'text-foreground',
          )}
        >
          {value || '— set the tunnel URL first —'}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleCopy()}
          aria-label={`Copy ${label}`}
          disabled={disabled}
          className={cn('shrink-0', copied && 'border-success/40 text-success')}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}
