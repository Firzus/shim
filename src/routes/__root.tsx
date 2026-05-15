import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Suspense, lazy } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { DefaultCatchBoundary } from '@/components/default-catch-boundary'
import { NotFound } from '@/components/not-found'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { getLocale } from '@/paraglide/runtime'
import appCss from '../styles.css?url'

// Devtools are dev-only. import.meta.env.DEV is a static boolean — Vite's
// minifier drops the false-branch and tree-shakes the devtools packages out
// of the prod bundle entirely.
const Devtools = import.meta.env.DEV
  ? lazy(async () => {
      const [{ TanStackDevtools }, { TanStackRouterDevtoolsPanel }, { ReactQueryDevtoolsPanel }] =
        await Promise.all([
          import('@tanstack/react-devtools'),
          import('@tanstack/react-router-devtools'),
          import('@tanstack/react-query-devtools'),
        ])
      return {
        default: () => (
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[
              { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
              { name: 'React Query', render: <ReactQueryDevtoolsPanel /> },
            ]}
          />
        ),
      }
    })
  : () => null

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#14120b' },
      { title: 'shim — codex byok proxy' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/png', href: '/logo-mark-192.png' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

function isFullBleed(pathname: string): boolean {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/')
}

function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  if (isFullBleed(pathname)) return <>{children}</>
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang={getLocale()} className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          style={
            {
              '--normal-bg': 'var(--popover)',
              '--normal-text': 'var(--popover-foreground)',
              '--normal-border': 'var(--border)',
              '--success-bg': 'var(--popover)',
              '--success-text': 'var(--success)',
              '--success-border': 'var(--border)',
              '--error-bg': 'var(--popover)',
              '--error-text': 'var(--destructive)',
              '--error-border': 'var(--border)',
            } as CSSProperties
          }
        />
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
        <Scripts />
      </body>
    </html>
  )
}
