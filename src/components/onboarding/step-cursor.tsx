import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'

import { CursorByokInstructions } from '@/components/cursor-byok-instructions'
import { Button } from '@/components/ui/button'
import { settingsQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'

export function StepCursor({ onAdvance, onBack }: { onAdvance: () => void; onBack: () => void }) {
  const { data, isPending } = useQuery(settingsQuery())
  const tunnelUrl = data?.tunnelUrl ?? null
  const loaded = !isPending

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.cursor_title()}</h1>
        <p className="text-base text-muted-foreground">{m.cursor_subtitle()}</p>
      </div>

      {loaded && !tunnelUrl ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">{m.setup_no_tunnel_title()}</p>
            <p className="text-xs text-muted-foreground">{m.cursor_no_tunnel_desc()}</p>
          </div>
        </div>
      ) : null}

      <CursorByokInstructions tunnelUrl={tunnelUrl} />

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          {m.common_back()}
        </Button>
        <Button onClick={onAdvance} disabled={!tunnelUrl}>
          {m.cursor_added_model()}
        </Button>
      </div>
    </div>
  )
}
