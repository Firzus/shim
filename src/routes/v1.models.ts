import { createFileRoute } from '@tanstack/react-router'

import { ipWhitelistGuard } from '@/lib/server/middleware'
import { getRegisteredProviders } from '@/lib/server/providers'

// OpenAI-conventional path. Mirrors /api/v1/models — Cursor BYOK typically
// targets `<baseUrl>/models` from a configured `<baseUrl>/v1` so we expose
// the canonical OpenAI surface without forcing users to type `/api/v1`.
//
// `shim` is the provider-neutral name users enter in Cursor's "+ Add Custom
// Model" dialog; the active provider + model is set in the dashboard. We also
// list every provider's real model names for parity with curl tests.

const ADVERTISED_MODELS = ['shim', ...getRegisteredProviders().flatMap((p) => p.meta.allowedModels)]

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
