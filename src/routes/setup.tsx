import { Link, createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, ExternalLink, RefreshCcw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { CompactSkillInstallCard } from '@/components/compact-skill-install-card'
import { CursorByokInstructions } from '@/components/cursor-byok-instructions'
import { Separator } from '@/components/ui/separator'
import { CLOUDFLARED_TUNNEL_SNIPPET } from '@/lib/cursor-byok'

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

        <CursorByokInstructions tunnelUrl={tunnelUrl} />
      </section>

      <Separator />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight">Agent hand-off</h2>
          <p className="text-sm text-muted-foreground">
            Cursor's /compact never reaches this proxy. Install the companion skill so your agent
            handles summaries locally.
          </p>
        </div>
        <CompactSkillInstallCard />
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
          {CLOUDFLARED_TUNNEL_SNIPPET}
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
