import { createFileRoute } from '@tanstack/react-router'

import { api } from '#/../convex/_generated/api'
import { convex } from '#/lib/server/convex'

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
