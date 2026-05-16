<p align="center">
  <img src="./public/logo-lockup-240.webp" alt="shim" width="240" />
</p>

# shim

> Cursor BYOK proxy that routes OpenAI-compatible chat completions through Codex (ChatGPT) and Anthropic (Claude) sessions.

[![Build Status](https://img.shields.io/github/actions/workflow/status/Firzus/shim/ci.yml?style=flat-square&label=CI)](https://github.com/Firzus/shim/actions)
![Node.js](https://img.shields.io/badge/Node.js->=22-3c873a?style=flat-square)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-11.1.2-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)

[Overview](#overview) • [Features](#features) • [Getting started](#getting-started) • [Run locally](#run-locally) • [Configuration](#configuration) • [API surface](#api-surface) • [Troubleshooting](#troubleshooting)

> [!IMPORTANT]
> shim is a private single-user proxy. Keep OAuth tokens, Convex admin keys, and the dashboard off public surfaces. Expose only the OpenAI-compatible `/v1/*` route through your tunnel.

## Overview

shim is a TanStack Start application that lets Cursor BYOK talk to multiple upstream sessions through a single OpenAI-compatible `/v1/chat/completions` endpoint. It accepts Cursor's Responses-API-shaped payloads, dispatches them to the configured provider (Codex or Anthropic), applies dashboard-controlled model and reasoning settings, streams replies back as OpenAI chat completion chunks, and records only request metadata in Convex.

The app is made of:

- A local **dashboard** (React 19 + TanStack Router + Tailwind CSS v4) with a multi-provider console (`src/components/console/`).
- Thin **route handlers** under `src/routes/` that delegate proxy, OAuth, settings, and health work to `src/lib/server/`.
- A **provider registry** under `src/lib/server/providers/` that abstracts each upstream (Codex Responses API, Anthropic Messages API) behind a shared interface.
- A self-hosted **Convex backend** for OAuth tokens, PKCE state, settings, plan-usage snapshots, and request metadata.
- **Docker Compose** services for Convex, the Convex dashboard, a mandatory Cloudflare Tunnel, and an optional production-like app container.

## Features

- **Cursor BYOK endpoint** — serves `POST /v1/chat/completions` and `GET /v1/models` in the shape Cursor expects.
- **Multi-provider routing** — pluggable Codex and Anthropic providers behind one OpenAI-compatible surface; add more in `src/lib/server/providers/`.
- **Dashboard-controlled model + effort** — Cursor enters the sentinel model `shim`; the dashboard picks the real provider, model, and reasoning effort server-side.
- **Live console** — activity, provider, routing, and usage panels driven by Convex subscriptions.
- **Local onboarding** — guided flow for OAuth, tunnel setup, Cursor BYOK config, and connection testing.
- **Plan-usage tracking** — pull (Codex) and header-driven (Anthropic) strategies, normalized into a shared usage table.
- **Metadata-only analytics** — counters, latency, token counts, tool counts, cache keys; no request or response bodies persisted.
- **Tunnel-aware security** — dashboard stays local; the public proxy enforces a `CF-Connecting-IP` allow-list.
- **i18n out of the box** — Paraglide-compiled messages for `de`, `en`, `es`, `fr` (`messages/*.json`).
- **Vite+ toolchain** — `vp` drives dev, build, test, lint, format, and staged checks.

## Getting started

### Use your local environment

You need:

- [Node.js](https://nodejs.org/) `>=22`
- [pnpm](https://pnpm.io/) `11.1.2`
- [Docker Compose](https://docs.docker.com/compose/) for the self-hosted Convex services
- A Codex-capable ChatGPT account **and/or** a Claude account for OAuth
- A public HTTPS URL for Cursor BYOK, usually via [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

Clone and install:

```bash
git clone https://github.com/Firzus/shim.git
cd shim
pnpm install --frozen-lockfile
cp .env.example .env
```

Set `CONVEX_INSTANCE_SECRET` in `.env` before starting Convex — the container refuses to boot without it.

## Run locally

Start Convex and the dashboard backend:

```bash
docker compose up -d convex convex-dashboard
```

After Convex prints its admin key, add it to `.env` as `CONVEX_SELF_HOSTED_ADMIN_KEY`, then sync the schema and start the app:

```bash
pnpm convex:deploy
pnpm dev
```

Open <http://127.0.0.1:3221> and follow the onboarding flow.

> [!NOTE]
> `pnpm convex:deploy` runs `vpx convex dev --once`. It is the local Convex sync command in this project, not a production deploy.

### Connect Cursor BYOK

Once onboarding has a public tunnel URL, plug these values into Cursor's custom model setup:

```text
Base URL:   https://your-public-tunnel.example/v1
Model name: shim
API key:    any non-empty string
```

Cursor rejects `localhost` and other private network URLs. Point your tunnel ingress at `http://host.docker.internal:3221` (Docker) or `http://127.0.0.1:3221` (host process) and, when your tunnel provider supports path rules, restrict public ingress to `^/v1/.*`.

> [!TIP]
> The dashboard chooses which provider, model, and effort `shim` resolves to — change them anytime without touching Cursor.

## Configuration

`.env.example` is the source of truth for local config — six variables. Ports and other fixed values live in `docker-compose.yml`.

| Variable                       | Description                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `CONVEX_INSTANCE_SECRET`       | Secret the Convex container requires on first boot.                                    |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | Admin key printed by the Convex backend; used by `pnpm convex:deploy`.                 |
| `CONVEX_SELF_HOSTED_URL`       | Server-side Convex URL — `http://127.0.0.1:3220` for host dev.                         |
| `CLOUDFLARE_TUNNEL_TOKEN`      | Token for the mandatory `cloudflared` container.                                       |
| `CLOUDFLARE_TUNNEL_URL`        | Public tunnel origin. shim throws at startup if unset; used for setup, CORS, dev host. |
| `ALLOWED_IPS`                  | `CF-Connecting-IP` allow-list for the proxy (Cursor's BYOK egress IPs).                |

`SHIM_MAX_UPSTREAM_CONCURRENCY` (default `3`) and `LOG_LEVEL` (default `INFO`) are undocumented code-only tuning knobs; set them in the environment only if needed.

## Scripts

| Command                       | Description                                                            |
| ----------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                    | Start the TanStack Start dev server on `127.0.0.1:3221`.               |
| `pnpm build`                  | Build the app with Vite+.                                              |
| `pnpm preview`                | Preview the built app from `.output/`.                                 |
| `pnpm test`                   | Run the Vitest suite through `vp test run`.                            |
| `pnpm check`                  | Run the type-aware lint + check used by CI (`vp check`).               |
| `pnpm fmt`                    | Format the repo with `vp fmt`.                                         |
| `pnpm i18n:compile`           | Compile `messages/*.json` into `src/paraglide/`.                       |
| `pnpm convex:deploy`          | Run local Convex schema/function sync with `vpx convex dev --once`.    |

## Docker profiles

```bash
docker compose up -d
docker compose --profile prod up -d app
```

- **Default services** — local Convex, the Convex dashboard, and the Cloudflare tunnel (`cloudflared`). The tunnel is mandatory and requires `CLOUDFLARE_TUNNEL_TOKEN`.
- **`prod` profile** — builds and runs the app container behind the same local ports.

## API surface

Public-facing HTTP endpoints, exposed through the tunnel:

| Endpoint                        | Purpose                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `POST /v1/chat/completions`     | OpenAI-compatible chat completion proxy for Cursor BYOK.             |
| `POST /api/v1/chat/completions` | API-prefixed mirror of the chat completion proxy.                    |
| `GET /v1/models`                | OpenAI-style model list (`shim` sentinel + every provider's models). |
| `GET /api/health`               | Health check used by the Docker healthcheck.                         |

The dashboard talks to the server through **TanStack Start server functions** (typed RPC, validated with Zod) — see `src/lib/api/server-fns.ts`: settings read/write, plan-usage refresh, analytics, the connection test, and per-provider OAuth (`initLogin`, `exchangeCallback`, `getAuthStatus`, `logout`).

## Project structure

```text
convex/                              Convex schema, functions, generated client bindings (read-only)
messages/                            Paraglide source catalogs (de, en, es, fr)
public/                              Manifest and app logos
src/components/                      React UI components
src/components/console/              Multi-provider dashboard console
src/components/ui/                   Reusable shadcn-style primitives
src/lib/                             Shared client utilities (cursor-byok, labels, query client)
src/lib/api/                         Server functions, Zod schemas, query/mutation hooks
src/lib/server/                      Server handlers, Convex client, settings, OAuth, middleware
src/lib/server/providers/            Provider registry + per-provider folders
src/lib/server/providers/codex/      Codex provider (Responses API)
src/lib/server/providers/anthropic/  Anthropic provider (Messages API + Claude Code translation)
src/lib/server/translation/          Shared SSE parser + cross-provider translation helpers
src/routes/                          TanStack Router pages (`/`, `/onboarding`, `/setup`, `/v1/*`, `/api/*`)
vite.config.ts                       Vite+ app, test, lint, format, and staged config
```

## Troubleshooting

<details>
<summary>Cursor says private network URLs are forbidden</summary>

Use a public HTTPS origin and set Cursor's base URL to `<public-origin>/v1`. Keep dashboard routes local; expose only `/v1/*` through the tunnel when possible.

</details>

<details>
<summary>Convex refuses to start</summary>

Set `CONVEX_INSTANCE_SECRET` in `.env` before the first `docker compose up -d convex convex-dashboard`. The Compose file passes it as a required container environment variable.

</details>

<details>
<summary>Proxy requests return 403</summary>

Check the server logs. `[SECURITY] Blocked IP: <ip>` means the IP isn't in `ALLOWED_IPS` — add Cursor's egress IP if appropriate. `[SECURITY] Blocked request: no CF-Connecting-IP` means the request didn't come through the Cloudflare tunnel; the proxy is tunnel-only and there is no bypass.

</details>

<details>
<summary>Anthropic OAuth shows a code instead of redirecting</summary>

Anthropic's OAuth client only accepts its hosted callback page. Copy the `code#state` value it shows and paste it back into the dashboard prompt — shim's onboarding handles the exchange from there.

</details>

## Resources

- [AGENTS.md](./AGENTS.md) — repository-specific coding rules and validation expectations.
- [TanStack Start](https://tanstack.com/start) — full-stack React framework powering the dashboard and API routes.
- [Convex self-hosting](https://docs.convex.dev/self-hosting) — backend used for settings, OAuth state, counters, and metadata.
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — common way to expose the proxy route to Cursor BYOK.
- [Vite+](https://vite.dev/) — toolchain accessed through the `vp` and `vpx` commands in this repo.
- [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) — i18n compiler used for `messages/*.json`.
