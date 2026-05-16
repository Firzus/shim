// Anthropic / Claude Code OAuth + API constants — ported verbatim from the
// claude-code-to-cursor prototype. These are the public client identifiers of
// the Claude Code CLI.

export const CLAUDE_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
export const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
export const ANTHROPIC_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize'

// Hosted callback page that displays a `code#state` string for the user to
// paste back. Anthropic does not register arbitrary localhost redirect URIs.
export const OAUTH_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback'

export const OAUTH_SCOPES = 'org:create_api_key user:profile user:inference'

export const ANTHROPIC_API_URL = 'https://api.anthropic.com'
export const ANTHROPIC_MESSAGES_URL = `${ANTHROPIC_API_URL}/v1/messages`

// Beta headers required for Claude Code OAuth. Missing either flag makes the
// upstream reject the request.
export const CLAUDE_CODE_BETA_HEADERS = 'oauth-2025-04-20,interleaved-thinking-2025-05-14'
export const ANTHROPIC_VERSION = '2023-06-01'
export const CLAUDE_CODE_USER_AGENT = 'claude-cli/2.1.97 (external, cli)'

// System prompt prefix that identifies requests as coming from Claude Code.
// This EXACT string is required for Claude Code OAuth to work — removing or
// modifying it makes the upstream reject the OAuth token.
export const CLAUDE_CODE_SYSTEM_PROMPT = "You are Claude Code, Anthropic's official CLI for Claude."

// Legacy chat-transcript turn marker Claude can leak at conversation tails.
export const TURN_MARKER = 'Human:'

// Internal Claude Code tools are namespaced with this prefix before being
// sent upstream.
export const TOOL_PREFIX = 'mcp_'

// Anthropic caps cache_control breakpoints and stop_sequences at 4 each.
export const MAX_CACHE_BREAKPOINTS = 4
export const MAX_STOP_SEQUENCES = 4

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-4-7'
