# AGENTS.md

## Overview & Scope

shim is a private TypeScript / React 19 / TanStack Start app that proxies Cursor BYOK chat completions to multiple upstream providers (Codex, Anthropic), persists settings + analytics in self-hosted Convex, and ships a Tailwind CSS v4 dashboard. Applies to the entire repo unless a nested `AGENTS.md` overrides it; closest `AGENTS.md` to the edited file wins. See `README.md` and `CLAUDE.md` for deeper architecture notes.

## Agent Role

- Act as an experienced TypeScript full-stack engineer for TanStack Start, React 19, Vite+ (`vite-plus`), self-hosted Convex, Tailwind CSS v4, and Paraglide i18n.
- Allowed: edit app code under `src/**`, Convex functions / schema under `convex/**` (excluding `_generated`), tests under `test/**`, message catalogs under `messages/**`, and local docs.
- Not allowed: commit, push, deploy, run migrations, start tunnels, edit `.env*`, or change production / secrets / infra without explicit user approval.

## Build, Test & Validation Commands

```bash
pnpm install --frozen-lockfile          # (unverified) installs deps; runs paraglide compile via postinstall
pnpm dev                                # (unverified) vp dev on 127.0.0.1:3221
pnpm build                              # (unverified) vp build to .output/
pnpm preview                            # (unverified) vp preview from .output/
pnpm test                               # (unverified) vp test run (vitest, jsdom)
pnpm check                              # (unverified) vp check — type-aware lint
pnpm fmt                                # (unverified) vp fmt
pnpm i18n:compile                       # (unverified) compile messages/*.json -> src/paraglide/
pnpm convex:deploy                      # (unverified) vpx convex dev --once (NOT a prod deploy)
pnpm exec tsc --version                 # verified
pnpm exec vp --version                  # verified
docker compose up -d                    # (unverified) convex + convex-dashboard + mandatory cloudflared
docker compose --profile prod up -d app # (unverified) production-like local container
```

## Conventions & Patterns

- Package manager: `pnpm@11.1.2`; `pnpm-lock.yaml` is authoritative. Node `>=22`.
- Module style: ESM (`"type": "module"`), TypeScript `strict` + `verbatimModuleSyntax` + `noUncheckedSideEffectImports`. No `any`.
- Single import alias: `@/*` -> `src/*` (configured in `tsconfig.json`); do not reintroduce `#/*`.
- Routing: TanStack Router file routes in `src/routes/**`. API endpoints use `createFileRoute(...).server.handlers`. Route filenames define public paths — do not rename casually.
- Server vs client: anything under `src/lib/server/**` and `src/routes/api/**` is server-only. `src/lib/api/server-fns.ts` is isomorphic; server-only modules there must be referenced **only inside `.handler()` bodies** (the plugin extracts them).
- Providers: every upstream lives under `src/lib/server/providers/<id>/` and is registered in `src/lib/server/providers/index.ts`. Adding a provider = new folder + registry entry; do not add upstream branching to handlers.
- Provider folder layout: `client.ts`, `oauth.ts`, `constants.ts`, `model-map.ts`, `plan-usage.ts` (optional), `translation/**`, `index.ts`. Match shapes in `src/lib/server/providers/types.ts`.
- Convex: schema/functions in `convex/**`; `convex/_generated/**` is read-only. Do not store request/response bodies or secrets in analytics tables — schema currently keeps metadata, counters, and settings only.
- UI: `src/components/**` for app components, `src/components/ui/**` for shadcn-style primitives, `src/components/console/**` for the dashboard console (activity, provider, routing, usage).
- i18n: source-of-truth strings live in `messages/{de,en,es,fr}.json` (Paraglide). Edit JSON, then `pnpm i18n:compile` (or rely on `postinstall`) — never hand-edit `src/paraglide/**`.
- Styling: Tailwind CSS v4 tokens live in `src/styles.css`. Use existing CSS variables / tokens before introducing raw colors; format with `vp fmt` (single quotes, no semis).
- Validation: use `zod` for runtime parsing on every trust boundary (request bodies, settings payloads, server-fn inputs).
- Errors: `throw` for exceptional server failures; return explicit `Response` / JSON status codes for expected HTTP outcomes.
- Search ignores: `node_modules/`, `.output/`, `dist/`, `.tanstack/`, `.vite-hooks/`, `src/paraglide/`, `src/routeTree.gen.ts`, `convex/_generated/**`.

## Dos and Don'ts

- Do: keep `vite.config.ts` as the single source for Vite+, test, lint, fmt, and staged hooks.
- Do: preserve `server.host`, `server.port`, `strictPort`, and `allowedHosts` (driven by `CLOUDFLARE_TUNNEL_URL`) unless the user asks to change dev networking.
- Do: route everything through `pnpm` scripts (`pnpm check`, `pnpm fmt`, `pnpm test`) — do not invoke standalone `vite` / `vitest` / `eslint` binaries.
- Do: keep OAuth tokens, Convex admin operations, and upstream HTTP confined to server modules.
- Do: update both server and UI state paths when changing onboarding / settings / provider behavior.
- Don't: add dependencies without approval; prefer existing React, TanStack, Convex, Base UI, lucide, Tailwind, sonner, and zod utilities.
- Don't: edit `convex/_generated/**`, `src/paraglide/**`, `src/routeTree.gen.ts`, `.output/**`, `dist/**`, `node_modules/**`, or `pnpm-lock.yaml` by hand.
- Don't: run `pnpm dev`, Docker profiles, tests, builds, or tunnel commands during routine edits unless the task requires it and is approved.
- Don't: introduce `any`, suppress lints, or disable strict TS flags.

## Safety & Guardrails

- Off-limits: `.env`, `.env.local`, OAuth tokens, Convex admin keys, Cloudflare tunnel tokens / URLs, production data, and per-user account identifiers.
- Local logs: write debug output only under `.cursor/` or `.debug/`, never at repo root or inside `src/`.
- Safe to automate: reading files, scoped code edits, `pnpm --version`, `pnpm exec vp --version`, `pnpm exec tsc --version`, `git status`, `git diff`, `git log`.
- Ask first: dependency changes, Convex schema migrations, Docker / tunnel / `--profile prod` operations, destructive filesystem ops, large rewrites, anything touching `.env*`.
- If a long-running process is started (dev server, docker, tunnel), stop and clean it up before ending the session.

## Git & PR Rules

- Branch: stay on the current branch; create or switch only when explicitly asked.
- Commit: do not commit unless the user requests it. Style: short imperative summary; conventional prefixes (`feat:`, `fix:`, `refactor:`, `chore:`) are common in history.
- Before commit: inspect `git status`, `git diff`, and recent `git log`; never include secrets, generated files, or unrelated user changes.
- PR: include summary, validation performed, validation skipped/unverified, and any environment / tunnel / Convex notes.
