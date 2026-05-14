import { createFileRoute } from '@tanstack/react-router'

import { api } from '#/../convex/_generated/api'
import { convex } from '#/lib/server/convex'
import { clearCachedToken } from '#/lib/server/oauth/codex-oauth'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async () => {
        await convex.mutation(api.oauthTokens.clear, {})
        clearCachedToken()
        return Response.json({ success: true })
      },
    },
  },
})
