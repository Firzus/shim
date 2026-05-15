import { m } from '@/paraglide/messages'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-6">
        <p className="font-mono">shim · {m.footer_tagline()}</p>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Firzus/shim"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            {m.footer_source()}
          </a>
          <span className="font-mono">v0.1.0</span>
        </div>
      </div>
    </footer>
  )
}
