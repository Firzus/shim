import { createFileRoute } from '@tanstack/react-router'

import { logger, toErrorMessage } from '#/lib/server/logger'
import { exchangeAndPersist } from '#/lib/server/oauth/exchange'

// Fallback "paste-the-URL" endpoint (BLUEPRINT §8.2). Used when port 1455
// is unavailable: the user copies the full redirect URL from their
// browser's address bar (the ERR_CONNECTION_REFUSED page still exposes it)
// and POSTs it here. We parse out code+state and run the same exchange.

interface CallbackBody {
  code?: string
  state?: string
  redirectUrl?: string
}

function tryParseRedirectUrl(input: string): { code: string; state: string } | null {
  try {
    const url = new URL(input)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) return null
    return { code, state }
  } catch {
    return null
  }
}

export const Route = createFileRoute('/api/auth/callback')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as CallbackBody
          let code = body.code
          let state = body.state
          if ((!code || !state) && body.redirectUrl) {
            const parsed = tryParseRedirectUrl(body.redirectUrl)
            if (parsed) {
              code = parsed.code
              state = parsed.state
            }
          }
          if (!code || !state) {
            return Response.json(
              {
                success: false,
                message: 'Missing code or state — paste the full redirect URL.',
              },
              { status: 400 },
            )
          }
          await exchangeAndPersist(code, state)
          return Response.json({ success: true, message: 'Authentication successful.' })
        } catch (error) {
          const message = toErrorMessage(error)
          logger.error(`[auth] callback handler failed: ${message}`)
          return Response.json({ success: false, message }, { status: 500 })
        }
      },
    },
  },
})
