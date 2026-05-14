// No Convex Auth — the OAuth tokens stored in `oauthTokens` are ChatGPT's,
// not Convex's. This shim is single-user and admin endpoints are gated by
// IP whitelist + the `ipWhitelistGuard()` middleware planned for Phase 7.
export default { providers: [] }
