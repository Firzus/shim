import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface AuthStatus {
  authenticated: boolean
  expiresAt: number | null
  accountId: string | null
  planType: string | null
}

interface AnalyticsSummary {
  totalRequests: number
  cursorRequests: number
  errorRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCachedTokens: number
  cacheHitRate: number
}

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

interface Settings {
  model: string
  reasoningEffort: string
  updatedAt: number | null
  allowed: {
    models: string[]
    efforts: string[]
  }
}

interface RateLimitWindow {
  limit_window_seconds: number
  reset_after_seconds: number
  reset_at: number
  used_percent: number
}

interface RateLimit {
  allowed: boolean
  limit_reached: boolean
  primary_window: RateLimitWindow | null
  secondary_window: RateLimitWindow | null
}

interface AdditionalRateLimit {
  limit_name: string
  metered_feature?: string
  rate_limit: RateLimit
}

interface UsageRaw {
  plan_type?: string | null
  rate_limit?: RateLimit | null
  additional_rate_limits?: AdditionalRateLimit[] | null
  credits?: {
    balance?: string
    has_credits?: boolean
    unlimited?: boolean
  } | null
}

interface UsageSnapshot {
  capturedAt: number | null
  raw: UsageRaw | null
  stalenessMs: number | null
}

export const Route = createFileRoute('/')({ component: Dashboard })

function formatExpiresIn(expiresAt: number | null): string {
  if (!expiresAt) return '—'
  const ms = expiresAt - Date.now()
  if (ms <= 0) return 'expired'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return `${hours}h`
}

function formatAgo(ms: number | null): string {
  if (ms === null || ms < 0) return '—'
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return `${hours}h`
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours < 24) return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

function Dashboard() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [usage, setUsage] = useState<UsageSnapshot | null>(null)
  const [usageRefreshing, setUsageRefreshing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [listenerActive, setListenerActive] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'info' | 'error'; message: string } | null>(null)

  useEffect(() => {
    void refreshStatus()
    void refreshSettings()
    void refreshUsage()
    const interval = setInterval(refreshStatus, 5_000)
    const usageInterval = setInterval(refreshUsage, 60_000)
    return () => {
      clearInterval(interval)
      clearInterval(usageInterval)
    }
  }, [])

  async function refreshStatus(): Promise<void> {
    try {
      const [statusRes, analyticsRes] = await Promise.all([
        fetch('/api/auth/status'),
        fetch('/api/analytics?sinceHours=24'),
      ])
      if (statusRes.ok) setAuthStatus((await statusRes.json()) as AuthStatus)
      if (analyticsRes.ok) setAnalytics((await analyticsRes.json()) as AnalyticsSummary)
    } catch {
      // silent — the UI shows "—" placeholders
    }
  }

  async function refreshSettings(): Promise<void> {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) setSettings((await res.json()) as Settings)
    } catch {
      // silent
    }
  }

  async function refreshUsage(): Promise<void> {
    try {
      const res = await fetch('/api/usage')
      if (res.ok) setUsage((await res.json()) as UsageSnapshot)
    } catch {
      // silent
    }
  }

  async function forceRefreshUsage(): Promise<void> {
    setUsageRefreshing(true)
    try {
      const res = await fetch('/api/usage', { method: 'POST' })
      if (res.ok) setUsage((await res.json()) as UsageSnapshot)
      else {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setFeedback({ kind: 'error', message: body.error ?? 'usage refresh failed' })
      }
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setUsageRefreshing(false)
    }
  }

  async function updateSetting(field: keyof Settings, value: string): Promise<void> {
    if (!settings) return
    const previous = settings
    setSettings({ ...settings, [field]: value })
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'save failed')
      await refreshSettings()
    } catch (error) {
      setSettings(previous)
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function handleLogin(): Promise<void> {
    setLoading(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/auth/login', { method: 'POST' })
      if (!res.ok) throw new Error(`login init failed (${res.status})`)
      const data = (await res.json()) as LoginResponse
      setListenerActive(data.listenerActive)
      window.open(data.authURL, '_blank', 'noopener,noreferrer')
      setFeedback({
        kind: 'info',
        message: data.listenerActive
          ? 'authorize tab opened. waiting for the localhost:1455 callback…'
          : 'authorize tab opened. listener unavailable — paste the redirect URL below after consent.',
      })
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleFallback(): Promise<void> {
    const trimmed = fallbackUrl.trim()
    if (!trimmed) return
    setLoading(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUrl: trimmed }),
      })
      const data = (await res.json()) as FallbackResponse
      if (!res.ok || !data.success) throw new Error(data.message)
      setFeedback({ kind: 'info', message: 'authentication successful.' })
      setFallbackUrl('')
      await refreshStatus()
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout(): Promise<void> {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      await refreshStatus()
      setFeedback({ kind: 'info', message: 'logged out.' })
    } finally {
      setLoading(false)
    }
  }

  const authenticated = authStatus?.authenticated === true

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          shim · codex byok proxy
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">shim dashboard</h1>
        <p className="text-sm text-muted-foreground">
          single-user proxy exposing a ChatGPT Plus/Pro subscription to Cursor via the Codex OAuth
          flow.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <CardTitle className="text-base" data-testid="auth-card-title">
            authentication
          </CardTitle>
          <span
            data-testid="auth-badge"
            className={
              'rounded-full border px-2 py-0.5 text-xs font-medium ' +
              (authenticated
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-amber-300 bg-amber-50 text-amber-700')
            }
          >
            {authenticated ? 'connected' : 'not connected'}
          </span>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
            <dt>account id</dt>
            <dd className="font-mono text-foreground" data-testid="auth-account-id">
              {authStatus?.accountId ?? '—'}
            </dd>
            <dt>plan type</dt>
            <dd className="text-foreground" data-testid="auth-plan-type">
              {authStatus?.planType ?? '—'}
            </dd>
            <dt>token expires in</dt>
            <dd className="text-foreground" data-testid="auth-expires-in">
              {formatExpiresIn(authStatus?.expiresAt ?? null)}
            </dd>
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="default"
              size="sm"
              disabled={loading}
              onClick={() => void handleLogin()}
              data-testid="auth-login-btn"
            >
              {authenticated ? 're-authenticate' : 'login with codex'}
            </Button>
            {authenticated && (
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void handleLogout()}
                data-testid="auth-logout-btn"
              >
                logout
              </Button>
            )}
          </div>

          {feedback && (
            <p
              className={
                'text-xs ' +
                (feedback.kind === 'error' ? 'text-destructive' : 'text-muted-foreground')
              }
              data-testid="auth-feedback"
            >
              {feedback.message}
            </p>
          )}

          {!listenerActive && (
            <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium">paste-the-URL fallback</summary>
              <p className="mt-2 text-muted-foreground">
                if port 1455 is busy (Codex CLI already running, etc.), copy the redirect URL from
                your browser's address bar after consent and paste it here.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={fallbackUrl}
                  onChange={(e) => setFallbackUrl(e.target.value)}
                  placeholder="http://localhost:1455/auth/callback?code=...&state=..."
                  className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
                  data-testid="fallback-input"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || !fallbackUrl.trim()}
                  onClick={() => void handleFallback()}
                  data-testid="fallback-submit"
                >
                  exchange
                </Button>
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">analytics — last 24h</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm sm:grid-cols-3">
            <Metric label="total requests" value={analytics?.totalRequests ?? 0} />
            <Metric label="cursor" value={analytics?.cursorRequests ?? 0} />
            <Metric label="errors" value={analytics?.errorRequests ?? 0} tone="error" />
            <Metric label="input tokens" value={analytics?.totalInputTokens ?? 0} />
            <Metric label="output tokens" value={analytics?.totalOutputTokens ?? 0} />
            <Metric label="cached tokens" value={analytics?.totalCachedTokens ?? 0} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <CardTitle className="text-base">plan usage</CardTitle>
          <Button
            variant="outline"
            size="sm"
            disabled={usageRefreshing}
            onClick={() => void forceRefreshUsage()}
            data-testid="usage-refresh-btn"
          >
            {usageRefreshing ? 'refreshing…' : 'refresh'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-xs text-muted-foreground" data-testid="usage-staleness">
            {usage?.capturedAt
              ? `captured ${formatAgo(usage.stalenessMs)} ago${
                  usage.raw?.plan_type ? ` · plan: ${usage.raw.plan_type}` : ''
                }`
              : 'no snapshot yet — poller runs every 5 min after auth'}
          </p>
          {usage?.raw?.rate_limit?.primary_window && (
            <UsageWindow label="5h window" window={usage.raw.rate_limit.primary_window} />
          )}
          {usage?.raw?.rate_limit?.secondary_window && (
            <UsageWindow label="weekly window" window={usage.raw.rate_limit.secondary_window} />
          )}
          {usage?.raw?.additional_rate_limits?.map((extra) => (
            <div key={extra.limit_name} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {extra.limit_name}
              </p>
              {extra.rate_limit.primary_window && (
                <UsageWindow label="5h window" window={extra.rate_limit.primary_window} />
              )}
              {extra.rate_limit.secondary_window && (
                <UsageWindow label="weekly window" window={extra.rate_limit.secondary_window} />
              )}
            </div>
          ))}
          {usage?.raw && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">raw payload</summary>
              <pre
                className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/50 px-3 py-2 font-mono whitespace-pre-wrap"
                data-testid="usage-raw"
              >
                {JSON.stringify(usage.raw, null, 2)}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">model & reasoning</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            these settings override whatever Cursor sends on every request. type{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">codex</code> as the model name in
            Cursor's custom-model field — the proxy swaps it for the model you pick here.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SettingSelect
              label="model"
              value={settings?.model ?? ''}
              options={settings?.allowed.models ?? []}
              onChange={(v) => void updateSetting('model', v)}
              testId="setting-model"
            />
            <SettingSelect
              label="reasoning effort"
              value={settings?.reasoningEffort ?? ''}
              options={settings?.allowed.efforts ?? []}
              onChange={(v) => void updateSetting('reasoningEffort', v)}
              testId="setting-effort"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">cursor BYOK setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            base URL:{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">https://shim.lprieu.dev/v1</code>
          </p>
          <p>
            in Cursor → Settings → Models, click "+ Add Custom Model" and enter{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">codex</code>. Set base URL to the
            one above and paste any non-empty API key. The actual upstream model is selected above.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function SettingSelect({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  testId: string
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={options.length === 0}
        data-testid={testId}
        className="rounded-md border bg-background px-2 py-1.5 text-sm"
      >
        {options.length === 0 && <option value="">loading…</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}

function UsageWindow({ label, window }: { label: string; window: RateLimitWindow }) {
  const percent = Math.max(0, Math.min(100, window.used_percent))
  const danger = percent >= 85
  const warn = percent >= 60 && !danger
  const barColor = danger ? 'bg-destructive' : warn ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">
          {percent.toFixed(percent < 1 && percent > 0 ? 2 : 1)}% · resets in{' '}
          {formatDuration(window.reset_after_seconds)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${barColor}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'error'
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd
        className={
          'font-mono text-base ' + (tone === 'error' && value > 0 ? 'text-destructive' : '')
        }
      >
        {value.toLocaleString('en-US')}
      </dd>
    </div>
  )
}
