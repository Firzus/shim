import { useRef } from 'react'
import { CheckCircle2, Loader2, Play, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTestConnection } from '@/lib/api/mutations'
import { m } from '@/paraglide/messages'
import { gsap, prefersMotion, useGSAP } from '@/lib/gsap'
import { errorMessage } from '@/lib/utils'

type TestResult =
  | { ok: true; latencyMs: number; model?: string }
  | { ok: false; status: number; message: string }

export function StepTest({ onAdvance, onBack }: { onAdvance: () => void; onBack: () => void }) {
  const test = useTestConnection()
  const busy = test.isPending

  // Derive the discriminated result from the mutation state. While running we
  // surface nothing (the old code cleared `result` on each new run).
  let result: TestResult | null = null
  if (!busy && test.data) {
    const data = test.data
    result =
      data.ok && typeof data.latencyMs === 'number'
        ? { ok: true, latencyMs: data.latencyMs, model: data.model }
        : { ok: false, status: data.status ?? 0, message: data.message ?? 'unknown error' }
  } else if (!busy && test.error) {
    result = {
      ok: false,
      status: 0,
      message: errorMessage(test.error),
    }
  }

  // The success state is the emotional peak of onboarding — pop the check in.
  const successRef = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (!result?.ok || !prefersMotion()) return
      gsap
        .timeline()
        .from('[data-test-icon]', { scale: 0.4, opacity: 0, duration: 0.5, ease: 'back.out(2)' })
        .from('[data-test-body]', { opacity: 0, y: 6, duration: 0.35 }, '-=0.2')
    },
    { scope: successRef, dependencies: [result?.ok] },
  )

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.test_title()}</h1>
        <p className="text-base text-muted-foreground">{m.test_subtitle()}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{m.test_synthetic_ping()}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{m.test_synthetic_desc()}</p>
          </div>
          <Button onClick={() => test.mutate()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            {busy ? m.test_running() : m.test_run()}
          </Button>
        </div>

        {result?.ok ? (
          <div
            ref={successRef}
            className="mt-4 space-y-3 rounded-md border border-success/40 bg-success/10 px-3 py-3"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 data-test-icon className="mt-0.5 size-4 shrink-0 text-success" />
              <div data-test-body className="text-sm">
                <p className="font-medium">{m.test_success_title()}</p>
                <p className="text-xs text-muted-foreground">
                  {m.test_connected_latency({ latencyMs: result.latencyMs })}
                  {result.model ? (
                    <>
                      {' · '}
                      {m.test_model()} <span className="font-mono">{result.model}</span>
                    </>
                  ) : null}
                  {'. '}
                  {m.test_ready()}
                </p>
              </div>
            </div>
            <Button onClick={onAdvance} className="w-full">
              {m.test_open_cursor()}
            </Button>
          </div>
        ) : result ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">
                {m.test_failed_title({ status: result.status || m.test_transport_error() })}
              </p>
              <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                {result.message}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          {m.common_back()}
        </Button>
      </div>
    </div>
  )
}
