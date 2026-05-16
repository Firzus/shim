import { Link, useRouterState } from '@tanstack/react-router'
import { Settings } from 'lucide-react'

import { AuthStatusDot } from '@/components/auth-status-dot'
import { BrandLink } from '@/components/brand-link'
import { LanguageSwitcher } from '@/components/language-switcher'
import { buttonVariants } from '@/components/ui/button'
import { m } from '@/paraglide/messages'
import { cn } from '@/lib/utils'

// The app is a single Console screen — there's no page nav. Configuration
// lives one click away behind the gear, alongside the language switcher.
export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const onSetup = pathname === '/setup' || pathname.startsWith('/setup/')

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <BrandLink className="transition-opacity hover:opacity-80" textClassName="text-base" />

        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <Link
            to="/setup"
            aria-label={m.nav_setup()}
            title={m.nav_setup()}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
              onSetup && 'bg-muted text-foreground',
            )}
          >
            <Settings />
          </Link>
          <AuthStatusDot />
        </div>
      </div>
    </header>
  )
}
