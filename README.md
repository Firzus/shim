<p align="center">
  <img src="./public/logo-lockup-240.webp" alt="shim" width="240" />
</p>

# shim

Cursor BYOK proxy for routing OpenAI-compatible chat completions through a Codex-backed session.

[![Build Status](https://img.shields.io/github/actions/workflow/status/Firzus/shim/ci.yml?style=flat-square&label=CI)](https://github.com/Firzus/shim/actions)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-3c873a?style=flat-square)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-11.1.2-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)

[Overview](#overview) • [Features](#features) • [Getting started](#getting-started) • [Run locally](#run-locally) • [Configuration](#configuration) • [API surface](#api-surface) • [Troubleshooting](#troubleshooting)

> [!IMPORTANT]
> This is a private single-user proxy. Keep OAuth tokens, Convex admin keys, and the dashboard off public surfaces; expose only the OpenAI-compatible `/v1/*` route when you need Cursor BYOK access.

## Overview

shim is a TanStack Start application that lets Cursor BYOK talk to a Codex-backed session through an OpenAI-compatible `/v1/chat/completions` endpoint. It preserves Cursor's Responses-API-shaped payloads, applies dashboard-controlled model settings, streams replies back as OpenAI chat completion chunks, and records only request metadata in Convex.

The app is made of:

- A local dashboard built with React 19, TanStack Router, and Tailwind CSS v4.
- Thin API routes under `src/routes/` that delegate proxy, OAuth, settings, health, and usage work to `src/lib/server/`.
- A self-hosted Convex backend for OAuth tokens, PKCE state, settings, counters, usage snapshots, and request metadata.
- Docker Compose services for local Convex, the Convex dashboard, optional Cloudflare Tunnel, and a production-like app container.

## Features

- **Cursor BYOK endpoint** — serves `POST /v1/chat/completions` and `GET /v1/models` in the shape Cursor expects.
- **Codex session bridge** — forwards requests to the upstream Codex responses endpoint with the required OAuth headers.
- **Dashboard-controlled model settings** — treats Cursor's `codex` model as a sentinel and applies the configured Codex model and reasoning effort server-side.
- **Local onboarding flow** — walks through model selection, tunnel setup, Cursor configuration, companion skill install, and connection testing.
- **Metadata-only analytics** — stores counters, latency, token counts, tool counts, and cache keys without persisting request or response bodies.
- **Tunnel-aware security** — keeps the dashboard local and uses an IP allow-list for the public proxy route.
- **Vite+ toolchain** — uses `vp` for dev, build, test, lint, format, and staged checks.

## Getting started

### Use your local environment

You need:

- [Node.js](https://nodejs.org/) `>=22`
- [pnpm](https://pnpm.io/) `11.1.2`
- [Docker Compose](https://docs.docker.com/compose/) for the self-hosted Convex services
- A Codex-capable ChatGPT account for the OAuth flow
- A public HTTPS URL for Cursor BYOK, usually via [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

Clone and install:

```bash
git clone https://github.com/Firzus/shim.git
cd shim
pnpm install --frozen-lockfile
cp .env.example .env
```

Before starting Convex, set `CONVEX_INSTANCE_SECRET` in `.env`. The Convex container requires it on first boot.

## Run locally

Start Convex and the dashboard backend:

```bash
docker compose up -d convex convex-dashboard
```

After Convex prints its local admin key, add it to `.env` as `CONVEX_SELF_HOSTED_ADMIN_KEY`, then sync the schema and start the app:

```bash
pnpm convex:deploy
pnpm dev
```

Open <http://127.0.0.1:3221> and follow onboarding.

> [!NOTE]
> `pnpm convex:deploy` runs `vpx convex dev --once`. In this project it is the local Convex sync command, not a production deploy.

### Connect Cursor BYOK

Once onboarding has a public tunnel URL, use these values in Cursor's custom model setup:

```text
Base URL: https://your-public-tunnel.example/v1
Model name: codex
API key: any non-empty string
```

Cursor rejects `localhost` and other private network URLs. Point the tunnel ingress at `http://host.docker.internal:3221` from Docker or `http://127.0.0.1:3221` from a host process, then restrict public ingress to `^/v1/.*` when your tunnel provider supports path rules.

## Configuration

The `.env.example` file is the source of truth for local configuration.

| Variable | Required | Description |
| --- | --- | --- |
| `CONVEX_INSTANCE_NAME` | yes | Local Convex instance name. Defaults to `shim` in examples. |
| `CONVEX_INSTANCE_SECRET` | yes | Secret required before the Convex backend container starts. |
| `CONVEX_SELF_HOSTED_URL` | yes | Server-side Convex URL, usually `http://127.0.0.1:3220` in local dev. |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | yes | Admin key printed by the local Convex backend. |
| `VITE_CONVEX_URL` | yes | Browser-side Convex URL baked into the client bundle. |
| `CLOUDFLARE_TUNNEL_TOKEN` | only for tunnel profile | Token used by the `cloudflared` Docker profile. |
| `CLOUDFLARE_TUNNEL_URL` | no | Public origin shown in setup and allowed by CORS. |
| `ALLOWED_IPS` | no | Comma-separated allow-list for proxy endpoints; use `disabled` only for local testing. |
| `ALLOWED_ORIGIN` | no | Additional comma-separated CORS origins. |
| `SHIM_MAX_UPSTREAM_CONCURRENCY` | no | Maximum upstream Codex requests in flight. Defaults to `3`. |
| `APP_PORT` | no | App port. Defaults to `3221`. |
| `CONVEX_PORT` | no | Local Convex backend port. Defaults to `3220`. |
| `CONVEX_SITE_PROXY_PORT` | no | Local Convex site proxy port. Defaults to `3222`. |
| `CONVEX_DASHBOARD_PORT` | no | Local Convex dashboard port. Defaults to `6792`. |

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the TanStack Start dev server on `127.0.0.1:3221`. |
| `pnpm build` | Build the app with Vite+. |
| `pnpm preview` | Preview the built app with Vite+. |
| `pnpm test` | Run the Vitest suite through `vp test run`. |
| `pnpm convex:deploy` | Run local Convex schema/function sync with `vpx convex dev --once`. |
| `pnpm exec vp check --no-fmt` | Run the same lint and type-aware checks used by CI. |

## Docker profiles

```bash
docker compose up -d convex convex-dashboard
docker compose --profile tunnel up -d cloudflared
docker compose --profile prod up -d app
```

- **Default services** — run local Convex and the Convex dashboard.
- **`tunnel` profile** — runs Cloudflare Tunnel and requires `CLOUDFLARE_TUNNEL_TOKEN`.
- **`prod` profile** — builds and runs the app container behind the same local ports.

## API surface

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/chat/completions` | OpenAI-compatible chat completion proxy for Cursor BYOK. |
| `POST /api/v1/chat/completions` | API-prefixed mirror of the chat completion proxy. |
| `GET /v1/models` | OpenAI-style model list including the `codex` sentinel. |
| `GET /api/health` | Health check endpoint. |
| `GET /api/settings` | Read dashboard model, reasoning, and tunnel settings. |
| `POST /api/settings` | Update dashboard model, reasoning, and tunnel settings. |
| `GET /api/usage` | Read the latest plan usage snapshot. |
| `POST /api/usage` | Trigger a manual plan usage refresh. |
| `GET /api/auth/login` | Start the Codex OAuth flow. |
| `GET /api/auth/callback` | Complete the Codex OAuth callback. |
| `GET /api/auth/status` | Check whether a Codex session is available. |
| `GET /api/auth/logout` | Clear the stored Codex OAuth session. |

## Project structure

```text
convex/                 Convex schema, functions, and generated client bindings
public/                 Manifest and app logos
src/components/         React UI components
src/components/ui/      Reusable shadcn-style primitives
src/lib/                Shared client utilities
src/lib/server/         Server handlers, OAuth, translation, settings, and middleware
src/routes/             TanStack Router pages and API routes
vite.config.ts          Vite+ app, test, lint, format, and staged config
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

Check the server logs for a blocked IP message and update `ALLOWED_IPS` with Cursor's egress IP if appropriate. Use `ALLOWED_IPS=disabled` only for local development.

</details>

## Resources

- [AGENTS.md](./AGENTS.md) — repository-specific coding rules and validation expectations.
- [TanStack Start](https://tanstack.com/start) — full-stack React framework used by the dashboard and API routes.
- [Convex self-hosting](https://docs.convex.dev/self-hosting) — backend used for settings, OAuth state, counters, and metadata.
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — common way to expose the proxy route to Cursor BYOK.
- [Vite+](https://vite.dev/) — toolchain accessed through the `vp` and `vpx` commands in this repo.
