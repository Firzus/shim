# AGENTS.md

## Overview & Scope

shim is a private TypeScript/React 19 TanStack Start app that proxies Cursor BYOK chat completions to Codex/OpenAI-style endpoints, stores settings/analytics in Convex, and ships a Tailwind CSS v4 UI. Applies to the entire repo unless a nested `AGENTS.md` exists; closest `AGENTS.md` to the edited file wins.

## Agent Role

- Act as an experienced TypeScript full-stack engineer for TanStack Start, React, Vite+, Convex, and Tailwind CSS.
- Allowed: edit app code, Convex functions/schema, UI components, route handlers, tests, and local docs for requested work.
- Must not: commit, push, deploy, run migrations, start tunnels, or change production/secrets/infra without explicit user approval.

## Build, Test & Validation Commands

```bash
pnpm install --frozen-lockfile  # (unverified; do not run during AGENTS.md generation)
pnpm dev  # (unverified; starts local dev server on 127.0.0.1:3221)
pnpm build  # (unverified)
pnpm test  # (unverified)
pnpm exec vp --version
pnpm exec tsc --version
pnpm convex:deploy  # (unverified; package script runs `vpx convex dev --once`, not production deploy)
docker compose up -d  # (unverified; convex, convex-dashboard + mandatory cloudflared tunnel)
docker compose --profile prod up -d app  # (unverified; production-like local container profile)
```

## Conventions & Patterns

- Package manager: `pnpm@11.1.2`; keep `pnpm-lock.yaml` authoritative.
- Module style: ESM (`"type": "module"`), TypeScript strict mode, React JSX runtime.
- Imports: use the `@/...` alias for `src/...`; configured in `tsconfig.json`.
- Routing: use TanStack Router file routes in `src/routes`; API endpoints use `createFileRoute(...).server.handlers`.
- Server logic: keep route handlers thin; put reusable server code under `src/lib/server/**`.
- Convex: schema/functions live in `convex/**`; generated files in `convex/_generated/**` are read-only.
- Convex data safety: do not store request/response bodies or secrets in analytics tables; schema currently stores metadata/counters/settings only.
- UI: components live in `src/components/**`; base UI/shadcn-style primitives live in `src/components/ui/**`.
- Styling: Tailwind CSS v4 tokens live in `src/styles.css`; use CSS variables and existing tokens before adding raw colors.
- Validation: use `zod` for runtime input parsing where request/settings payloads cross trust boundaries.
- Errors: throw for exceptional server failures; return explicit `Response`/JSON status for expected HTTP outcomes.
- Search: ignore `node_modules/`, `dist/`, `.git/`, and generated Convex files unless the task explicitly targets them.

## Dos and Don'ts

- Do: keep `vite.config.ts` as the source for Vite+, test, lint, and format settings.
- Do: preserve `server.host`, `server.port`, `strictPort`, and allowed tunnel hosts unless the user asks to change dev networking.
- Do: use `vp` scripts through `pnpm` rather than invoking unrelated Vite/Vitest binaries.
- Do: update both server and UI state paths when changing onboarding/settings behavior.
- Do: keep OAuth token handling inside server/Convex code paths; never expose tokens to client components.
- Don't: add dependencies without approval; prefer existing React, TanStack, Convex, Base UI, lucide, Tailwind, and zod utilities.
- Don't: edit `convex/_generated/**`, `dist/**`, `node_modules/**`, or lockfiles by hand.
- Don't: run `pnpm dev`, Docker profiles, tests, builds, or tunnel commands unless needed and approved/appropriate for the task.
- Don't: rename route files casually; TanStack Router file names define public paths.
- Don't: introduce `any`; TypeScript strict/no-unused checks are enabled.

## Safety & Guardrails

- Secrets/off-limits: `.env`, OAuth tokens, Convex admin keys, Cloudflare tunnel tokens, production data, and private user account identifiers.
- Local logs: create debug logs only under `.cursor/`, never at repo root.
- Safe to automate: reading files, scoped code edits, `pnpm --version`, `pnpm exec vp --version`, `pnpm exec tsc --version`, `git status`, `git diff`.
- Ask first: dependency changes, schema migrations, Docker/tunnel/prod profile operations, destructive filesystem ops, large rewrites.
- If starting long-running processes, clean them up before ending the session.

## Git & PR Rules

- Branch: use the current branch; create/switch branches only when asked.
- Commit: do not commit unless explicitly requested; recent style is short imperative/sentence case or conventional `feat:`.
- Before commit: inspect `git status`, `git diff`, and recent log; do not include secrets or unrelated user changes.
- PR: include summary, validation performed, unverified validation, and any environment/tunnel/Convex notes.
