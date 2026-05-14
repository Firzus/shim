import { createFileRoute } from '@tanstack/react-router'

import { api } from '#/../convex/_generated/api'
import { convex } from '#/lib/server/convex'

// Last 24h summary by default; clients can pass ?sinceHours=N.
export const Route = createFileRoute('/api/analytics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sinceHours = Math.max(1, Number(url.searchParams.get('sinceHours') ?? '24'))
        const now = Date.now()
        const since = now - sinceHours * 60 * 60 * 1000
        const analytics = await convex.query(api.requests.getAnalytics, { since, now })
        return Response.json(analytics)
      },
    },
  },
})
