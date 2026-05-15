import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { CursorByokInstructions } from '@/components/cursor-byok-instructions'
import { Button } from '@/components/ui/button'

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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Configure Cursor</h1>
        <p className="text-base text-muted-foreground">
          Point Cursor at the public URL you just set. shim will accept whatever model name Cursor
          sends and swap it for the one you picked.
        </p>
      </div>

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

      <CursorByokInstructions tunnelUrl={tunnelUrl} />

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
