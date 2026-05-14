import { useEffect, useState } from 'react'
import { Check, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { CLOUDFLARED_TUNNEL_SNIPPET } from '@/lib/cursor-byok'

interface Settings {
  tunnelUrl: string | null
  tunnelUrlSource: 'env' | 'settings' | null
}

export function StepTunnel({ onAdvance, onBack }: { onAdvance: () => void; onBack: () => void }) {
  const [input, setInput] = useState('')
  const [saved, setSaved] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  async function load(): Promise<void> {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return
      const data = (await res.json()) as Settings
      setSaved(data)
      if (data.tunnelUrl) setInput(data.tunnelUrl)
    } catch {
      // silent
    }
  }

  async function save(): Promise<void> {
    setBusy(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnelUrl: input.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? `save failed (${res.status})`)
      toast.success('Tunnel URL saved')
      await load()
      onAdvance()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const readOnly = saved?.tunnelUrlSource === 'env'
  const canContinue = readOnly || input.trim().length > 0

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Expose shim publicly</h1>
        <p className="text-base text-muted-foreground">
          Cursor BYOK refuses private networks ({' '}
          <span className="font-mono text-foreground/80">localhost</span>,{' '}
          <span className="font-mono text-foreground/80">127.0.0.1</span> ) — you need a public URL
          fronting this proxy. Cloudflare Tunnel takes a minute and is free.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 text-sm">
        <p className="font-medium">1. Start a tunnel</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-background px-3 py-2 font-mono text-xs">
          {CLOUDFLARED_TUNNEL_SNIPPET}
        </pre>
        <p className="mt-3 text-xs text-muted-foreground">
          In the Cloudflare Zero Trust dashboard, restrict the tunnel route to{' '}
          <span className="font-mono">^/v1/.*</span> so only the proxy is reachable; the dashboard
          stays local.
        </p>
        <a
          href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
        >
          Cloudflare Tunnel docs <ExternalLink className="size-3" />
        </a>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <label className="block text-sm font-medium">2. Paste your public URL</label>
        <p className="mt-1 text-xs text-muted-foreground">
          The origin Cursor will hit, e.g.{' '}
          <span className="font-mono">https://shim.yourdomain.com</span>. We save the origin only —
          the <span className="font-mono">/v1</span> suffix gets added where it's needed.
        </p>
        <input
          type="url"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://shim.yourdomain.com"
          disabled={readOnly}
          autoComplete="off"
          spellCheck={false}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground/50 disabled:opacity-60"
        />
        {readOnly ? (
          <p className="mt-2 text-xs text-amber-500">
            Locked by the <span className="font-mono">CLOUDFLARE_TUNNEL_URL</span> env var.
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        {readOnly ? (
          <Button onClick={onAdvance}>
            <Check />
            Continue
          </Button>
        ) : (
          <Button onClick={() => void save()} disabled={busy || !canContinue}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Save & continue
          </Button>
        )}
      </div>
    </div>
  )
}
