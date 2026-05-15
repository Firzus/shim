import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, RefreshCcw } from 'lucide-react'

import { CursorByokInstructions } from '@/components/cursor-byok-instructions'
import { Separator } from '@/components/ui/separator'
import { settingsQuery } from '@/lib/api/queries'
import { m } from '@/paraglide/messages'
import { CLOUDFLARED_TUNNEL_SNIPPET } from '@/lib/cursor-byok'

export const Route = createFileRoute('/setup')({ component: SetupPage })

function SetupPage() {
  const { data, isPending } = useQuery(settingsQuery())
  const tunnelUrl = data?.tunnelUrl ?? null
  const loaded = !isPending

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {m.setup_eyebrow()}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.setup_title()}</h1>
          <p className="text-sm text-muted-foreground">{m.setup_subtitle()}</p>
        </div>
        <Link
          to="/onboarding"
          search={{ step: 'welcome' }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <RefreshCcw className="size-3" />
          {m.setup_replay_onboarding()}
        </Link>
      </header>

      <section className="space-y-4">
        <h2 className="text-base font-semibold tracking-tight">{m.setup_byok_title()}</h2>
        {loaded && !tunnelUrl ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div>
              <p className="font-medium">{m.setup_no_tunnel_title()}</p>
              <p className="text-xs text-muted-foreground">{m.setup_no_tunnel_desc()}</p>
            </div>
          </div>
        ) : null}

        <CursorByokInstructions tunnelUrl={tunnelUrl} />
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-semibold tracking-tight">{m.setup_public_url_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.setup_public_url_desc()}</p>

        {tunnelUrl ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {m.setup_current_tunnel()}
            </p>
            <code className="mt-2 block break-all rounded-md bg-background px-3 py-2 font-mono text-sm">
              {tunnelUrl}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              {m.setup_update_via_lead()}
              <Link
                to="/onboarding"
                search={{ step: 'tunnel' }}
                className="text-primary underline-offset-2 hover:underline"
              >
                {m.setup_update_via_link()}
              </Link>
              .
            </p>
          </div>
        ) : null}

        <pre className="overflow-x-auto rounded-md border border-border bg-card px-4 py-3 font-mono text-xs">
          {CLOUDFLARED_TUNNEL_SNIPPET}
        </pre>
        <p className="text-xs text-muted-foreground">{m.setup_zero_trust_note()}</p>
        <a
          href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
        >
          {m.setup_cf_docs()} <ExternalLink className="size-3" />
        </a>
      </section>
    </div>
  )
}
