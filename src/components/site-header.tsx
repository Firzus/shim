import { Link, useRouterState } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { useState } from 'react'

import { AuthStatusDot } from '@/components/auth-status-dot'
import { BrandLink } from '@/components/brand-link'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { m } from '@/paraglide/messages'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: m.nav_dashboard },
  { to: '/setup', label: m.nav_setup },
  { to: '/settings', label: m.nav_settings },
] as const

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <BrandLink className="transition-opacity hover:opacity-80" textClassName="text-base" />

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = isActive(pathname, item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                {item.label()}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-1">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <AuthStatusDot />
          <div className="md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={m.nav_open_menu()}>
                    <Menu />
                  </Button>
                }
              />
              <SheetContent side="right" className="w-72">
                <div className="flex flex-col gap-1 p-4 pt-12">
                  {NAV.map((item) => {
                    const active = isActive(pathname, item.to)
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'rounded-md px-3 py-2 text-sm transition-colors',
                          active
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                        )}
                      >
                        {item.label()}
                      </Link>
                    )
                  })}
                  <LanguageSwitcher className="mt-3" />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  )
}

function isActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}
