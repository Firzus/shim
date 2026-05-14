import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { CURSOR_SENTINEL_MODEL } from '@/lib/cursor-byok'
import { cn } from '@/lib/utils'

interface CursorByokInstructionsProps {
  tunnelUrl: string | null
}

export function CursorByokInstructions({ tunnelUrl }: CursorByokInstructionsProps) {
  const baseUrl = tunnelUrl ? `${tunnelUrl}/v1` : ''

  return (
    <>
      <ol className="space-y-3 text-sm">
        <SetupStep n={1}>
          Open <em className="not-italic font-mono text-foreground">Cursor → Settings → Models</em>.
        </SetupStep>
        <SetupStep n={2}>
          Click <em className="not-italic font-mono text-foreground">+ Add Custom Model</em> and
          paste the values below.
        </SetupStep>
        <SetupStep n={3}>
          Paste <em className="not-italic font-mono text-foreground">any non-empty string</em> as
          the API key — shim uses your ChatGPT session, not the key.
        </SetupStep>
      </ol>

      <div className="grid grid-cols-1 gap-3 pt-2">
        <CopyField label="Base URL" value={baseUrl} disabled={!baseUrl} />
        <CopyField
          label="Model name"
          value={CURSOR_SENTINEL_MODEL}
          hint="shim swaps this for your chosen Codex model"
        />
      </div>
    </>
  )
}

function SetupStep({ n, children }: { n: number; children: React.ReactNode }) {
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

  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      setCopied(false)
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
          onClick={() => void copy()}
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
