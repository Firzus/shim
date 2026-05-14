import { createFileRoute } from '@tanstack/react-router'

import { ipWhitelistGuard } from '#/lib/server/middleware'
import { ACCEPTED_CODEX_MODELS } from '#/lib/server/translation/model-map'

// Cursor pings GET /v1/models when the user clicks "Verify" on the BYOK
// setup screen. `codex` is the canonical sentinel users enter as a custom
// model name; the real upstream model is chosen in the shim dashboard.

const ADVERTISED_MODELS = ['codex', ...ACCEPTED_CODEX_MODELS]

export const Route = createFileRoute('/api/v1/models')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const guard = ipWhitelistGuard(request)
        if (guard) return guard
        return Response.json({
          object: 'list',
          data: ADVERTISED_MODELS.map((id) => ({
            id,
            object: 'model',
            created: 0,
            owned_by: 'shim',
          })),
        })
      },
    },
  },
})
