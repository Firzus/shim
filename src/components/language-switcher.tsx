import { Check, ChevronDown, Languages } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { m } from '@/paraglide/messages'
import { getLocale, locales, setLocale } from '@/paraglide/runtime'
import type { Locale } from '@/paraglide/runtime'
import { cn } from '@/lib/utils'

// Endonyms — each language shown in its own name so it's recognisable
// regardless of the locale the UI is currently rendered in.
const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
}

/**
 * Locale picker. `setLocale` writes the PARAGLIDE_LOCALE cookie and reloads the
 * page, so the whole UI re-renders translated — no client-side reactivity wiring
 * is needed.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const selectedLocale = getLocale()
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedIndex = locales.indexOf(selectedLocale)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(Math.max(selectedIndex, 0))

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  function selectLocale(locale: Locale) {
    setOpen(false)
    if (locale !== selectedLocale) {
      // Fire-and-forget: setLocale persists the cookie and reloads the page.
      void setLocale(locale)
    }
  }

  function moveActiveIndex(delta: number) {
    setActiveIndex((current) => (current + delta + locales.length) % locales.length)
  }

  return (
    <div ref={rootRef} className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        aria-label={m.lang_switcher_label()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => {
          setActiveIndex(Math.max(locales.indexOf(selectedLocale), 0))
          setOpen((value) => !value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) {
              setOpen(true)
              setActiveIndex(Math.max(locales.indexOf(selectedLocale), 0))
              return
            }
            moveActiveIndex(event.key === 'ArrowDown' ? 1 : -1)
          }

          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (!open) {
              setOpen(true)
              return
            }
            selectLocale(locales[activeIndex] ?? selectedLocale)
          }

          if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
        className="group inline-flex h-7 min-w-32 cursor-pointer items-center gap-1.5 rounded-[min(var(--radius-md),12px)] border border-border bg-background/80 px-2 text-sm font-medium text-muted-foreground shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_8%,transparent)] backdrop-blur transition-all hover:border-border/80 hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[open=true]:border-primary/60 data-[open=true]:bg-muted data-[open=true]:text-foreground data-[open=true]:shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_22%,transparent),inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_8%,transparent)] dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
        data-open={open}
      >
        <Languages className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground group-data-[open=true]:text-primary" />
        <span className="min-w-0 flex-1 truncate text-left">{LOCALE_NAMES[selectedLocale]}</span>
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[open=true]:rotate-180 group-data-[open=true]:text-foreground" />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={m.lang_switcher_label()}
          className="absolute top-full right-0 z-50 mt-1 w-40 origin-top-right overflow-hidden rounded-lg border border-border/80 bg-popover p-1 text-popover-foreground shadow-xl shadow-black/20 outline-none animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 dark:border-input/80"
        >
          {locales.map((loc, index) => {
            const selected = loc === selectedLocale
            const active = index === activeIndex
            return (
              <button
                key={loc}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectLocale(loc)}
                className={cn(
                  'flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm transition-colors outline-none',
                  active ? 'bg-muted text-foreground' : 'text-muted-foreground',
                  selected && 'text-foreground',
                )}
              >
                <span className="w-3.5 shrink-0">
                  {selected ? <Check className="size-3.5 text-primary" /> : null}
                </span>
                <span className="flex-1 truncate">{LOCALE_NAMES[loc] ?? loc}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
