import { createFileRoute } from '@tanstack/react-router'

import { handleChatCompletions } from '@/lib/server/handlers/chat-completions'
import { corsHeaders } from '@/lib/server/middleware'

// OpenAI-conventional path. Cursor BYOK with baseURL `https://<host>/v1`
// targets `/v1/chat/completions` — this route mirrors /api/v1/chat/completions.

export const Route = createFileRoute('/v1/chat/completions')({
  server: {
    handlers: {
      OPTIONS: ({ request }) => new Response(null, { status: 204, headers: corsHeaders(request) }),
      POST: ({ request }) => handleChatCompletions(request),
    },
  },
})
