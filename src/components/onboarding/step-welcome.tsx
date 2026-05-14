import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import type { AuthStatus } from '@/components/auth-status-dot'

interface LoginResponse {
  authURL: string
  state: string
  listenerActive: boolean
  fallbackAvailable: boolean
}

interface FallbackResponse {
  success: boolean
  message: string
}

export function StepWelcome({ onAdvance }: { onAdvance: () => void }) {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [showFallback, setShowFallback] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState('')

  useEffect(() => {
    let alive = true
    let intervalId: ReturnType<typeof setInterval> | null = null
    const tick = async () => {
      try {
        const res = await fetch('/api/auth/status')
        if (!res.ok) return
        const data = (await res.json()) as AuthStatus
        if (!alive) return
        setStatus(data)
        if (data.authenticated && intervalId) {
          clearInterval(intervalId)
          intervalId = null
        }
      } catch {
        return
      }
    }
    void tick()
    intervalId = setInterval(() => void tick(), 2_000)
    return () => {
      alive = false
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  const authenticated = status?.authenticated === true

  async function handleLogin(): Promise<void> {
    setBusy(true)
    try {
      const res = await fetch('/api/auth/login', { method: 'POST' })
      if (!res.ok) throw new Error(`login init failed (${res.status})`)
      const data = (await res.json()) as LoginResponse
      setShowFallback(!data.listenerActive)
      window.open(data.authURL, '_blank', 'noopener,noreferrer')
      toast.message('authorize tab opened', {
        description: data.listenerActive
          ? 'waiting for the localhost:1455 callback…'
          : 'listener unavailable — paste the redirect URL below after consent.',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleFallback(): Promise<void> {
    const trimmed = fallbackUrl.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      const res = await fetch('/api/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUrl: trimmed }),
      })
      const data = (await res.json()) as FallbackResponse
      if (!res.ok || !data.success) throw new Error(data.message)
      toast.success('signed in')
      setFallbackUrl('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome to shim.</h1>
        <p className="text-base text-muted-foreground">
          A local proxy that exposes your ChatGPT Plus / Pro subscription to Cursor through the
          Codex OAuth flow. Let's get you set up.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm font-medium">First, sign in with ChatGPT</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We'll open a tab to ChatGPT for the Codex OAuth handshake. Your tokens stay on this
          machine — they never leave your local Convex instance.
        </p>

        {authenticated ? (
          <div className="mt-4 flex items-center justify-between rounded-md border border-success/40 bg-success/10 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-success" />
              <span>
                Signed in
                {status?.planType ? (
                  <span className="ml-1 text-muted-foreground">· {status.planType}</span>
                ) : null}
              </span>
            </div>
            <Button size="sm" onClick={onAdvance}>
              Continue
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void handleLogin()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <ExternalLink />}
              Sign in with ChatGPT
            </Button>
          </div>
        )}
      </div>

      {!authenticated && showFallback && (
        <details open className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Port 1455 is busy — paste the redirect URL
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            If the Codex CLI is already running locally, port 1455 won't be free for our listener.
            After consenting, copy the redirect URL from your browser's address bar and paste it
            here.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={fallbackUrl}
              onChange={(e) => setFallbackUrl(e.target.value)}
              placeholder="http://localhost:1455/auth/callback?code=…&state=…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !fallbackUrl.trim()}
              onClick={() => void handleFallback()}
            >
              Exchange
            </Button>
          </div>
        </details>
      )}
    </div>
  )
}
