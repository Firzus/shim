import { Link, createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Check, Copy, ExternalLink, RefreshCcw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/setup')({ component: SetupPage })

interface Settings {
  tunnelUrl: string | null
  tunnelUrlSource: 'env' | 'settings' | null
}

function SetupPage() {
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
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            setup
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Connect Cursor</h1>
          <p className="text-sm text-muted-foreground">
            Reference for plugging Cursor (or any OpenAI-compatible client) into this proxy.
          </p>
        </div>
        <Link
          to="/onboarding"
          search={{ step: 'welcome' }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <RefreshCcw className="size-3" />
          Replay onboarding
        </Link>
      </header>

      <section className="space-y-4">
        <h2 className="text-base font-semibold tracking-tight">Cursor BYOK</h2>
        <ol className="space-y-2 text-sm">
          <li className="flex gap-3">
            <Pip n={1} />
            <span className="text-muted-foreground">
              Open <em className="not-italic font-mono text-foreground">Settings → Models</em>.
            </span>
          </li>
          <li className="flex gap-3">
            <Pip n={2} />
            <span className="text-muted-foreground">
              Click <em className="not-italic font-mono text-foreground">+ Add Custom Model</em> and
              paste the values below.
            </span>
          </li>
          <li className="flex gap-3">
            <Pip n={3} />
            <span className="text-muted-foreground">
              Paste any non-empty string as the API key — shim uses your ChatGPT session, not the
              key.
            </span>
          </li>
        </ol>

        {loaded && !tunnelUrl ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div>
              <p className="font-medium">No tunnel URL on file</p>
              <p className="text-xs text-muted-foreground">
                Cursor BYOK refuses private networks. Start onboarding to register your public
                domain.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 pt-2">
          <CopyField label="Base URL" value={baseUrl} disabled={!tunnelUrl} />
          <CopyField
            label="Model name"
            value="codex"
            hint="shim swaps this for your chosen Codex model"
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold tracking-tight">Public URL</h2>
        <p className="text-sm text-muted-foreground">
          Cursor BYOK refuses private networks (<span className="font-mono">localhost</span>,{' '}
          <span className="font-mono">127.0.0.1</span>), so this proxy must sit behind a public
          domain. Cloudflare Tunnel is the easiest path.
        </p>

        {tunnelUrl ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Current tunnel URL
            </p>
            <code className="mt-2 block break-all rounded-md bg-background px-3 py-2 font-mono text-sm">
              {tunnelUrl}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Update via{' '}
              <Link
                to="/onboarding"
                search={{ step: 'tunnel' }}
                className="text-primary underline-offset-2 hover:underline"
              >
                onboarding → tunnel
              </Link>
              .
            </p>
          </div>
        ) : null}

        <pre className="overflow-x-auto rounded-md border border-border bg-card px-4 py-3 font-mono text-xs">
          {`cloudflared tunnel create shim
cloudflared tunnel route dns shim shim.yourdomain.com
cloudflared tunnel run shim   # ingress -> http://localhost:3221`}
        </pre>
        <p className="text-xs text-muted-foreground">
          In Cloudflare Zero Trust, restrict the tunnel route to{' '}
          <span className="font-mono">^/v1/.*</span> — the dashboard stays local-only.
        </p>
        <a
          href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
        >
          Cloudflare Tunnel docs <ExternalLink className="size-3" />
        </a>
      </section>
    </div>
  )
}

function Pip({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
      {n}
    </span>
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
