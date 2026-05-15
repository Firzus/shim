import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { DefaultCatchBoundary } from '@/components/default-catch-boundary'
import { NotFound } from '@/components/not-found'
import { makeQueryClient } from '@/lib/query-client'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  // A fresh QueryClient per getRouter() call — and getRouter() runs once per
  // request server-side — so server caches never leak between requests.
  const queryClient = makeQueryClient()

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Preloaded data stays fresh for 30s — 0 would make preloading pointless
    // because the loader would re-run on the real navigation immediately.
    defaultPreloadStaleTime: 30_000,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
  })

  // Mounts QueryClientProvider and wires SSR dehydration/hydration so queries
  // preloaded in a loader survive the server→client handoff without a refetch.
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
