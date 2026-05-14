import { createFileRoute } from '@tanstack/react-router'
import { Loader2, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { AuthStatus } from '@/components/auth-status-dot'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatRelativeExpiry } from '@/lib/format-relative-expiry'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

interface Settings {
  model: string
  reasoningEffort: string
  updatedAt: number | null
  allowed: { models: string[]; efforts: string[] }
}

function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh(): Promise<void> {
    try {
      const [s, a] = await Promise.all([
        fetch('/api/settings').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/auth/status').then((r) => (r.ok ? r.json() : null)),
      ])
      if (s) setSettings(s as Settings)
      if (a) setStatus(a as AuthStatus)
    } catch {
      // silent
    }
  }

  async function save(field: 'model' | 'reasoningEffort', value: string): Promise<void> {
    if (!settings) return
    const prev = settings
    setSettings({ ...settings, [field]: value })
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'save failed')
      await refresh()
      toast.success(`${field === 'model' ? 'Model' : 'Reasoning'} updated`)
    } catch (error) {
      setSettings(prev)
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function logout(): Promise<void> {
    setBusy(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      await refresh()
      toast.success('Logged out')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 sm:py-12">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          settings
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>
      </header>

      <Section
        title="Model & reasoning"
        description="shim overrides whatever Cursor sends with these values. Type `codex` as the model name in Cursor and your choice here wins."
      >
        <PickRow
          label="Model"
          value={settings?.model ?? ''}
          options={settings?.allowed.models ?? []}
          onPick={(v) => void save('model', v)}
        />
        <PickRow
          label="Reasoning effort"
          value={settings?.reasoningEffort ?? ''}
          options={settings?.allowed.efforts ?? []}
          onPick={(v) => void save('reasoningEffort', v)}
        />
      </Section>

      <Separator />

      <Section title="Account" description="ChatGPT OAuth session used by the proxy.">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[140px_1fr]">
          <dt className="text-muted-foreground">Status</dt>
          <dd
            className={cn(
              'font-medium',
              status?.authenticated ? 'text-success' : 'text-destructive',
            )}
          >
            {status?.authenticated ? 'connected' : 'disconnected'}
          </dd>
          <dt className="text-muted-foreground">Account ID</dt>
          <dd className="font-mono break-all">{status?.accountId ?? '—'}</dd>
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-mono">{status?.planType ?? '—'}</dd>
          <dt className="text-muted-foreground">Token expires in</dt>
          <dd className="font-mono">{formatRelativeExpiry(status?.expiresAt)}</dd>
        </dl>

        <div className="pt-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void logout()}>
            {busy ? <Loader2 className="animate-spin" /> : <LogOut />}
            Sign out
          </Button>
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function PickRow({
  label,
  value,
  options,
  onPick,
}: {
  label: string
  value: string
  options: string[]
  onPick: (v: string) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {options.length === 0 ? (
          <span className="text-sm text-muted-foreground">loading…</span>
        ) : (
          options.map((opt) => {
            const active = opt === value
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onPick(opt)}
                className={cn(
                  'rounded-md border px-3 py-1.5 font-mono text-sm transition-colors',
                  active
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {opt}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
