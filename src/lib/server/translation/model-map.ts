import { CODEX_DEFAULT_MODEL } from '../oauth/constants'

// Codex upstream enforces a strict allowlist tied to the subscription plan
// AND to the declared client version (`Version` header). Any unknown model
// is rejected with 400: "The 'X' model is not supported when using Codex
// with a ChatGPT account.". Some newer models additionally require a bumped
// `Version` header (see CODEX_VERSION in ../oauth/constants).
//
// Confirmed allowlist on prolite plan + Codex CLI v0.150.0:
//  - gpt-5.2        ✓
//  - gpt-5.4        ✓ (default)
//  - gpt-5.4-mini   ✓
//  - gpt-5.5        ✓ (requires Codex CLI >= 0.150)
//
// Confirmed REJECTED on this plan: gpt-5, gpt-5.0/.1/.3/.6, gpt-5-mini/-nano/
// -pro/-thinking/-instant, gpt-5.4-nano, gpt-5.5-mini/-pro, gpt-5-codex, gpt-4o
// family, gpt-4.1, o3 family, o4-mini. Higher subscription tiers may unlock
// more — re-run the probe script if you upgrade and add findings here.

const KNOWN_CODEX_MODELS = new Set<string>(['gpt-5.2', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.5'])

// Map Cursor-side names (and other unsupported variants) to the closest
// accepted model so the user doesn't lose their flow when picking an
// unavailable model. The mapping reflects intent (smaller / faster / smarter)
// rather than just defaulting everything to the flagship.
const ALIASES: Record<string, string> = {
  // gpt-5 generic / unaccepted point releases → flagship gpt-5.4
  'gpt-5': 'gpt-5.4',
  'gpt-5.0': 'gpt-5.4',
  'gpt-5.1': 'gpt-5.4',
  'gpt-5.3': 'gpt-5.4',
  'gpt-5.6': 'gpt-5.5',
  'gpt-5-turbo': 'gpt-5.4',
  'gpt-5-pro': 'gpt-5.5',
  'gpt-5-thinking': 'gpt-5.5',
  'gpt-5-instant': 'gpt-5.4',
  // mini variants → gpt-5.4-mini
  'gpt-5-mini': 'gpt-5.4-mini',
  'gpt-5-nano': 'gpt-5.4-mini',
  'gpt-5.4-nano': 'gpt-5.4-mini',
  'gpt-5.5-mini': 'gpt-5.4-mini',
  'gpt-5.5-pro': 'gpt-5.5',
  // codex specialist → flagship (gpt-5-codex is plan-gated)
  'gpt-5-codex': 'gpt-5.4',
  // gpt-4 family → flagship
  'gpt-4o': 'gpt-5.4',
  'gpt-4o-2024-11-20': 'gpt-5.4',
  'gpt-4o-mini': 'gpt-5.4-mini',
  'gpt-4.1': 'gpt-5.4',
  'gpt-4-turbo': 'gpt-5.4',
  // o-series → flagship
  o3: 'gpt-5.4',
  'o3-mini': 'gpt-5.4-mini',
  'o4-mini': 'gpt-5.4-mini',
}

export const ACCEPTED_CODEX_MODELS: readonly string[] = Array.from(KNOWN_CODEX_MODELS)

export interface ModelMappingResult {
  applied: string
  requested: string
  fellBack: boolean
}

export function mapToCodexModel(requested: string | undefined): ModelMappingResult {
  const trimmed = (requested ?? '').trim()
  if (!trimmed) {
    return { applied: CODEX_DEFAULT_MODEL, requested: '', fellBack: true }
  }
  if (KNOWN_CODEX_MODELS.has(trimmed)) {
    return { applied: trimmed, requested: trimmed, fellBack: false }
  }
  const aliased = ALIASES[trimmed]
  if (aliased) {
    return { applied: aliased, requested: trimmed, fellBack: true }
  }
  return { applied: CODEX_DEFAULT_MODEL, requested: trimmed, fellBack: true }
}
