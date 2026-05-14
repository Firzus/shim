import { createFileRoute } from '@tanstack/react-router'

import { api } from '#/../convex/_generated/api'
import { convex } from '#/lib/server/convex'
// Side-effect import: bootstraps the plan-usage poller on first dashboard
// hit. The dashboard polls /api/auth/status every 5s so the poller is alive
// within seconds of the first page load.
import '#/lib/server/plan-usage-poller'

export const Route = createFileRoute('/api/auth/status')({
  server: {
    handlers: {
      GET: async () => {
        const status = await convex.query(api.oauthTokens.getStatus, {})
        return Response.json(status)
      },
    },
  },
})
