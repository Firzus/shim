// Codex OAuth constants — verbatim from openai/codex login/server.rs.
// These are the public client identifiers of the Codex CLI; refer to
// BLUEPRINT §3 for sourcing and rationale.

export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const CODEX_ISSUER = 'https://auth.openai.com'
export const CODEX_AUTHORIZE_URL = `${CODEX_ISSUER}/oauth/authorize`
export const CODEX_TOKEN_URL = `${CODEX_ISSUER}/oauth/token`

// Hardcoded on OpenAI's side — no choice.
export const CODEX_REDIRECT_PORT = 1455
export const CODEX_REDIRECT_URI = `http://localhost:${CODEX_REDIRECT_PORT}/auth/callback`

export const CODEX_SCOPES = 'openid profile email offline_access'

// JWT claim path for the chatgpt_account_id (mandatory on every upstream
// request via `Chatgpt-Account-Id` header).
export const CODEX_JWT_AUTH_CLAIM = 'https://api.openai.com/auth'

export const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex'
export const CODEX_RESPONSES_URL = `${CODEX_BASE_URL}/responses`
// `/usage` lives off `/backend-api/wham`, NOT under `/codex` (see
// openai/codex codex-rs/backend-client/src/client.rs::get_rate_limits_many).
// Using `/codex/usage` returns a Cloudflare 403 HTML page.
export const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'

export const CODEX_USER_AGENT = 'codex_cli_rs/0.150.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464'
export const CODEX_ORIGINATOR = 'codex_cli_rs'
export const CODEX_VERSION = '0.150.0'

// Additional authorize params required by the Codex CLI flow.
export const CODEX_AUTHORIZE_EXTRA_PARAMS = {
  id_token_add_organizations: 'true',
  codex_cli_simplified_flow: 'true',
  originator: CODEX_ORIGINATOR,
} as const

// Default model used for proxying. Confirmed Phase 0: gpt-5.4 is on the
// Codex allowlist; gpt-4o-mini is rejected upstream.
export const CODEX_DEFAULT_MODEL = 'gpt-5.4'
