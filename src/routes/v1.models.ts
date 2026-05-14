import { createFileRoute } from '@tanstack/react-router'

import { ipWhitelistGuard } from '#/lib/server/middleware'
import { ACCEPTED_CODEX_MODELS } from '#/lib/server/translation/model-map'

// OpenAI-conventional path. Mirrors /api/v1/models — Cursor BYOK typically
// targets `<baseUrl>/models` from a configured `<baseUrl>/v1` so we expose
// the canonical OpenAI surface without forcing users to type `/api/v1`.
//
// `codex` is the canonical name users enter in Cursor's "+ Add Custom Model"
// dialog; the actual upstream model + reasoning config is set in the
// dashboard. We also list the raw Codex names for parity with curl tests
// (model-map.ts maps anything to the dashboard's choice anyway).

const ADVERTISED_MODELS = ['codex', ...ACCEPTED_CODEX_MODELS]

export const Route = createFileRoute('/v1/models')({
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
