# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

`shim` is a single-user Cursor BYOK proxy. It accepts OpenAI-compatible `/v1/chat/completions` calls from Cursor and forwards them — via a Codex/ChatGPT OAuth session — to the upstream `/backend-api/codex/responses` endpoint. A TanStack Start dashboard manages onboarding, model selection, settings, plan-usage, and Codex OAuth. Persistence (OAuth tokens, PKCE state, settings, request metadata, plan-usage snapshots) lives in a self-hosted Convex instance.

Public exposure is intentional: Cursor BYOK rejects private network URLs, so only the proxy route is meant to face the internet (typically via Cloudflare Tunnel). The dashboard stays local.

There is a sibling `AGENTS.md` with extra rules, safety guardrails, and validation conventions — read it before doing non-trivial edits.

## Commands

This project uses **Vite+** (the `vp` / `vpx` CLI bundles Vite, Vitest, Oxlint, Oxfmt, tsdown). Use the package scripts; don't invoke unrelated Vite/Vitest binaries directly.

```bash
pnpm install --frozen-lockfile     # install (pnpm@11 required)
pnpm dev                            # dev server on 127.0.0.1:3221 (strictPort)
pnpm build                          # vp build
pnpm preview                        # vp preview
pnpm test                           # vp test run (vitest, jsdom)
pnpm convex:deploy                  # vpx convex dev --once — local Convex sync, NOT a prod deploy
```

Single-test runs go through Vite+:

```bash
pnpm exec vp test run path/to/file.test.ts
pnpm exec vp test run -t "test name fragment"
pnpm exec vp check --no-fmt                # same lint + type-aware checks CI runs
```

Linting/formatting/staged config all live in `vite.config.ts` (`lint.options.typeAware: true`, `fmt.singleQuote: true`, `staged: { '*.{js,ts,tsx,jsx,css}': 'vp check --fix' }`). The `prepare` script wires `vp config` into git hooks (no-op outside a git checkout).

Local services (Convex backend + dashboard + Cloudflare tunnel) run via Docker Compose:

```bash
docker compose up -d                                  # convex + dashboard + cloudflared tunnel
docker compose --profile prod up -d app               # production-like app container
```

The tunnel is **mandatory** — `cloudflared` has no profile and comes up with the default
stack. shim refuses to start without `CLOUDFLARE_TUNNEL_URL` (and the proxy rejects any
request that didn't transit the tunnel), because Cursor BYOK rejects private-network URLs:
there is no valid no-tunnel deployment.

Convex schema/codegen: after editing `convex/schema.ts` or any `convex/*.ts` function, run `pnpm convex:deploy` to regenerate `convex/_generated/**` and push the schema to the local instance.

## Architecture

### Request flow (Cursor → upstream)

1. Cursor BYOK is configured with `Base URL = https://<tunnel>/v1` and `Model name = codex`. It POSTs to `/v1/chat/completions`.
2. `src/routes/v1.chat.completions.ts` (and `src/routes/api/v1.chat.completions.ts`) is a TanStack Router file route exposing `server.handlers.POST` → delegates to `handleChatCompletions` in `src/lib/server/handlers/chat-completions.ts`.
3. The handler runs `ipWhitelistGuard` — it rejects any request without a `CF-Connecting-IP` header (i.e. one that didn't transit the Cloudflare tunnel) and then checks that IP against the `ALLOWED_IPS` list. It parses the body and feeds it to **the passthrough translator**, not a Chat-shape adapter.
4. `buildCodexFromResponsesBody` (`src/lib/server/translation/responses-passthrough.ts`) preserves Cursor's Responses-API-shaped body verbatim — critically the `reasoning.encrypted_content` items that carry state between turns. It only fixes the fields Codex requires us to control (model allow-list, instructions split, `store=false`, `prompt_cache_key`, tools shape). The Chat-shape branch exists for fallback (Cursor sends Chat-shape when the model isn't on its reasoning-model heuristic list).
5. `getShimSettings()` (`src/lib/server/settings.ts`) overrides `model` and `reasoning.effort` from the dashboard singleton. Cursor's `model: "codex"` is a sentinel — the dashboard is the single source of truth. The settings reader is cached with a 3s TTL.
6. `postCodexResponses` (`src/lib/server/codex-client.ts`) attaches every mandatory upstream header (Bearer, `Chatgpt-Account-Id`, `Originator`, `Version`, `Session_id`, `Conversation_id`, custom UA). On a 401 it clears the process-local token cache and retries once. The handler derives both `sessionId` and `conversationId` from the body's `prompt_cache_key` so multi-turn Cursor traffic pins to the same upstream machine and unlocks real prompt-cache hits.
7. The upstream SSE stream is translated to OpenAI `chat.completion.chunk` SSE in real time by `createOpenAIStreamFromCodex` (`src/lib/server/translation/stream-translator.ts`) using the line buffer in `sse-parser.ts` and the event-shape helpers in `types.ts`. Non-streaming requests are buffered through `responses-to-chat.ts` (`freshBuffer` → `applyEventToBuffer` → `bufferToCompletion`).
8. After the stream completes, `recordRequestSafe` writes token counts, `prompt_cache_key`, latency, and tool counts into the Convex `requests` table with `source ∈ { 'cursor' | 'error' }`. Analytics failures are swallowed so they never break the proxy. **Bodies are never persisted** — only metadata (see `convex/schema.ts`).

### OAuth flow

- `src/lib/server/oauth/` implements the Codex OAuth/PKCE flow that the CLI uses. `codex-oauth.ts` is the orchestrator (build authorize URL → handle callback → refresh). `pkce.ts`, `jwt.ts`, `exchange.ts`, `constants.ts`, `listener.ts` are supporting pieces.
- Exposed as the `initLogin` / `exchangeCallback` / `getAuthStatus` / `logout` server functions in `src/lib/api/server-fns.ts` (see "Dashboard server functions" below).
- `pkceState` and `oauthTokens` Convex tables persist state across dev reloads. **OAuth tokens must never reach the browser** — keep them inside server-function handlers and `convex/oauthTokens.ts` server functions only.
- The `chatgpt_account_id` claim from the id_token is mandatory for upstream calls (it becomes the `Chatgpt-Account-Id` header).

### Settings + plan usage

- `shimSettings` (Convex singleton, keyed `'singleton'`) holds `model`, `reasoningEffort`, and `tunnelUrl`. The dashboard mutates it through the `saveSettings` server function; the proxy reads cached values on every request.
- `planUsageSnapshot` (Convex singleton) is refreshed by `src/lib/server/plan-usage-poller.ts`. The poller auto-starts on module load and is bootstrapped from the chat-completions handler and the `getAuthStatus` server function — proxy traffic alone keeps it fresh, so the dashboard doesn't need to be open.
- `counters` is a materialized-counter table to avoid `.collect().length` scans for request counts.

### Dashboard server functions

The dashboard talks to the server through **TanStack Start server functions** (`createServerFn`), not REST routes — typed end-to-end RPC, no hand-written response mirror.

- `src/lib/api/server-fns.ts` — the server functions: `getAuthStatus`, `initLogin`, `exchangeCallback`, `logout`, `getSettings`, `saveSettings`, `getAnalytics`, `getUsage`, `refreshUsage`, `runTestConnection`. Handlers run server-side only; the `tanstackStart()` Vite plugin extracts them so server-only imports never reach the client bundle.
- `src/lib/api/schemas.ts` — Zod schemas validating server-function **inputs** at the boundary. Return types are inferred from the handlers.
- `src/lib/api/types.ts` — response types **derived** (`Awaited<ReturnType<typeof fn>>`) from the server functions; never hand-written.
- `src/lib/api/queries.ts` / `mutations.ts` — TanStack Query `queryOptions` + mutation hooks wrapping the server functions.
- Still HTTP file routes (cannot be server functions): `/v1/*` + `/api/v1/*` (Cursor posts raw OpenAI HTTP) and `/api/health` (Docker healthcheck). `runTestConnection` replaced `/api/test-connection`; it ran outside `/v1/*` to dodge the IP allow-list and a server function is likewise unaffected.

### UI

- TanStack Router file routes under `src/routes/` define both pages and API endpoints. Route paths come from filenames — renaming a route file changes its URL.
- `__root.tsx` renders the shell (`SiteHeader` + `SiteFooter`) for normal pages, but `/onboarding/*` is full-bleed. Dark theme is forced via `<html className="dark">`.
- Dashboard pages: `/` (overview), `/setup` (Cursor instructions), `/settings`, `/onboarding`. The dashboard auto-redirects to `/onboarding` if `probeOnboarding()` reports the flow is incomplete (no Codex token or zero Cursor traffic).
- UI primitives live in `src/components/ui/` (shadcn-style, built on `@base-ui/react`). Onboarding steps are split into `src/components/onboarding/step-*.tsx`. Use existing primitives before adding new ones.
- Styling: Tailwind CSS v4 with tokens in `src/styles.css`. Use CSS variables / existing tokens before introducing raw colors. `class-variance-authority` + `tailwind-merge` (`cn` helper in `src/lib/utils.ts`).

### Important conventions

- **Import aliases**: use `@/...` (maps to `src/...`).
- **TypeScript strict**: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports` all on. No `any`.
- **ESM + `verbatimModuleSyntax`**: use `import type { ... }` for type-only imports.
- **Server vs client split**: anything under `src/lib/server/**` and `src/routes/api/**` is server-only. Route components in `src/routes/*.tsx` may be isomorphic. `src/lib/api/server-fns.ts` is isomorphic-by-design — the plugin extracts `.handler()` bodies — so server-only modules there must be used **only inside handlers**. OAuth tokens, Convex admin operations, and upstream HTTP **never** touch client bundles.
- **Convex types**: import generated types from `#/../convex/_generated/api` and treat `convex/_generated/**` as read-only — regenerate via `pnpm convex:deploy`.
- **Validation at boundaries**: use `zod` for payloads that cross trust boundaries. Dashboard server-function inputs are validated via `.inputValidator(schema)` with the schemas in `src/lib/api/schemas.ts`.
- **Errors**: in server functions, `throw` on failure (the client mutation/query surfaces it). For the proxy HTTP path, return an explicit `Response`/JSON with the right status (`openaiErrorBody(...)`).

## Networking + env

- Dev server is pinned to `127.0.0.1:3221`, `strictPort: true`. `vite.config.ts` derives `allowedHosts` from `CLOUDFLARE_TUNNEL_URL` so the Cloudflare tunnel can reach the dev server without tripping Vite's anti-DNS-rebinding guard. Don't change `server.host/port/strictPort` or the `allowedHosts` derivation without explicit need.
- Env vars (see `.env.example`) — kept deliberately small: `CONVEX_INSTANCE_SECRET`, `CONVEX_SELF_HOSTED_ADMIN_KEY`, `CONVEX_SELF_HOSTED_URL`, `CLOUDFLARE_TUNNEL_TOKEN`, `CLOUDFLARE_TUNNEL_URL`, `ALLOWED_IPS`. Ports and other fixed values are baked into `docker-compose.yml`. `SHIM_MAX_UPSTREAM_CONCURRENCY` and `LOG_LEVEL` are undocumented code-only tuning knobs with defaults in `src/lib/server/config.ts` / `logger.ts`.
- The proxy is tunnel-only: `checkIPWhitelist` rejects any request lacking `CF-Connecting-IP` (it didn't transit the tunnel), then matches that IP against `ALLOWED_IPS`. The default `ALLOWED_IPS` targets Cursor's AWS us-east-1 BYOK egress IPs. There is no `disabled` bypass. Adding/refreshing IPs: watch logs for `[SECURITY] Blocked IP: <ip>` and append.
- `CLOUDFLARE_TUNNEL_URL` is required — `getConfig()` throws at startup if it's unset or not a valid URL.

## Guardrails for agents

- **Don't commit / push / deploy / run migrations / start tunnels** without explicit user approval (per `AGENTS.md`).
- **Don't store request or response bodies in Convex.** The `requests` table is metadata-only by design.
- **Don't edit `convex/\_generated/**`, `dist/**`, `node_modules/**`, or `pnpm-lock.yaml` by hand.\*\*
- **Don't add dependencies** without approval — prefer existing React/TanStack/Convex/Base UI/lucide/Tailwind/zod utilities.
- **Don't rename route files casually** — TanStack Router file names are public paths.
- Local debug logs (if you need them) go under `.cursor/`, never the repo root.
