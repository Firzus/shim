import { useState } from 'react'
import { CheckCircle2, Loader2, Play, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'

type TestResult =
  | { ok: true; latencyMs: number; model?: string }
  | { ok: false; status: number; message: string }

interface TestResponse {
  ok: boolean
  latencyMs?: number
  model?: string
  status?: number
  message?: string
}

export function StepTest({ onAdvance, onBack }: { onAdvance: () => void; onBack: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  async function runTest(): Promise<void> {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/test-connection', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as TestResponse
      if (data.ok && typeof data.latencyMs === 'number') {
        setResult({ ok: true, latencyMs: data.latencyMs, model: data.model })
      } else {
        setResult({
          ok: false,
          status: data.status ?? res.status,
          message: data.message ?? res.statusText,
        })
      }
    } catch (error) {
      setResult({
        ok: false,
        status: 0,
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Test the connection</h1>
        <p className="text-base text-muted-foreground">
          We'll send a tiny request through the proxy and confirm Codex answers. This is the same
          path Cursor will use.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Synthetic ping</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Server-side round-trip to Codex using the model you picked above.
            </p>
          </div>
          <Button onClick={() => void runTest()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            {busy ? 'Running…' : 'Run test'}
          </Button>
        </div>

        {result && (
          <div
            className={
              'mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ' +
              (result.ok
                ? 'border-success/40 bg-success/10'
                : 'border-destructive/40 bg-destructive/10')
            }
          >
            {result.ok ? (
              <>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <div>
                  <p className="font-medium">All good.</p>
                  <p className="text-xs text-muted-foreground">
                    Upstream replied in {result.latencyMs}ms
                    {result.model ? (
                      <>
                        {' '}
                        · model <span className="font-mono">{result.model}</span>
                      </>
                    ) : null}
                    . You're ready to use shim from Cursor.
                  </p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">Test failed — {result.status || 'transport error'}</p>
                  <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                    {result.message}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onAdvance} disabled={!result?.ok}>
          Continue
        </Button>
      </div>
    </div>
  )
}
