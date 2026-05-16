import { createFileRoute } from '@tanstack/react-router'

import { handleChatCompletions } from '@/lib/server/handlers/chat-completions'
import { corsHeaders } from '@/lib/server/middleware'

export const Route = createFileRoute('/api/v1/chat/completions')({
  server: {
    handlers: {
      OPTIONS: ({ request }) => new Response(null, { status: 204, headers: corsHeaders(request) }),
      POST: ({ request }) => handleChatCompletions(request),
    },
  },
})
