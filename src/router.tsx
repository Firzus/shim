import { createRouter as createTanStackRouter } from '@tanstack/react-router'

import { DefaultCatchBoundary } from '@/components/default-catch-boundary'
import { NotFound } from '@/components/not-found'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Preloaded data stays fresh for 30s — 0 would make preloading pointless
    // because the loader would re-run on the real navigation immediately.
    defaultPreloadStaleTime: 30_000,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
