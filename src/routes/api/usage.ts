import { createFileRoute } from '@tanstack/react-router'

import { api } from '#/../convex/_generated/api'
import { convex } from '#/lib/server/convex'
import { tickPlanUsage } from '#/lib/server/plan-usage-poller'

// GET — latest snapshot persisted by the poller, plus a `stalenessMs` field
// derived server-side so the dashboard doesn't need to keep clocks in sync.
// POST — manual refresh, useful right after re-authenticating or when the
// user wants to see the impact of a recent burst.

export const Route = createFileRoute('/api/usage')({
  server: {
    handlers: {
      GET: async () => {
        const snapshot = await convex.query(api.planUsage.get, {})
        if (!snapshot) {
          return Response.json({ capturedAt: null, raw: null, stalenessMs: null })
        }
        return Response.json({
          capturedAt: snapshot.capturedAt,
          raw: snapshot.raw,
          stalenessMs: Date.now() - snapshot.capturedAt,
        })
      },
      POST: async () => {
        const result = await tickPlanUsage()
        const snapshot = await convex.query(api.planUsage.get, {})
        return Response.json(
          {
            ok: result.ok,
            error: result.error ?? null,
            status: result.status ?? null,
            capturedAt: snapshot?.capturedAt ?? null,
            raw: snapshot?.raw ?? null,
            stalenessMs: snapshot ? Date.now() - snapshot.capturedAt : null,
          },
          { status: result.ok ? 200 : 502 },
        )
      },
    },
  },
})
