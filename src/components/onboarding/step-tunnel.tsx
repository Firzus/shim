import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useSaveSettings } from '@/lib/api/mutations'
import { settingsQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { CLOUDFLARED_TUNNEL_SNIPPET } from '@/lib/cursor-byok'
import { errorMessage } from '@/lib/utils'

export function StepTunnel({ onAdvance, onBack }: { onAdvance: () => void; onBack: () => void }) {
  const { data: saved } = useQuery(settingsQuery())
  const saveSettings = useSaveSettings()
  const [input, setInput] = useState('')
  const [touched, setTouched] = useState(false)

  // Seed the field from the stored URL once it loads, but stop overriding the
  // user as soon as they type.
  useEffect(() => {
    if (!touched && saved?.tunnelUrl) setInput(saved.tunnelUrl)
  }, [touched, saved?.tunnelUrl])

  function save(): void {
    saveSettings.mutate(
      { tunnelUrl: input.trim() },
      {
        onSuccess: () => {
          toast.success(m.toast_tunnel_saved())
          onAdvance()
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const readOnly = saved?.tunnelUrlSource === 'env'
  const canContinue = readOnly || input.trim().length > 0

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.tunnel_title()}</h1>
        <p className="text-base text-muted-foreground">{m.tunnel_subtitle()}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 text-sm">
        <p className="font-medium">{m.tunnel_step1()}</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-background px-3 py-2 font-mono text-xs">
          {CLOUDFLARED_TUNNEL_SNIPPET}
        </pre>
        <p className="mt-3 text-xs text-muted-foreground">{m.tunnel_step1_note()}</p>
        <a
          href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
        >
          {m.setup_cf_docs()} <ExternalLink className="size-3" />
        </a>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <label className="block text-sm font-medium">{m.tunnel_step2()}</label>
        <p className="mt-1 text-xs text-muted-foreground">{m.tunnel_step2_desc()}</p>
        <input
          type="url"
          value={input}
          onChange={(e) => {
            setTouched(true)
            setInput(e.target.value)
          }}
          placeholder="https://shim.yourdomain.com"
          disabled={readOnly}
          autoComplete="off"
          spellCheck={false}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground/50 disabled:opacity-60"
        />
        {readOnly ? <p className="mt-2 text-xs text-amber-500">{m.tunnel_locked()}</p> : null}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          {m.common_back()}
        </Button>
        {readOnly ? (
          <Button onClick={onAdvance}>
            <Check />
            {m.common_continue()}
          </Button>
        ) : (
          <Button onClick={save} disabled={saveSettings.isPending || !canContinue}>
            {saveSettings.isPending ? <Loader2 className="animate-spin" /> : null}
            {m.tunnel_save_continue()}
          </Button>
        )}
      </div>
    </div>
  )
}
