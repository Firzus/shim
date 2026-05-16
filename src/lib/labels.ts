// Pretty labels for provider model ids and reasoning-effort tokens. Upstream
// values are kebab-case (`gpt-5.4-mini`, `claude-opus-4-7`, `extra-high`); the
// UI shows them title-cased with version segments rejoined (`GPT 5.4 Mini`,
// `Claude Opus 4.7`, `Extra High`).

export function formatModel(id: string): string {
  const words: string[] = []
  for (const part of id.split('-')) {
    const prev = words[words.length - 1]
    // Rejoin a bare version segment onto the previous numeric word so
    // `claude-opus-4-7` reads `Claude Opus 4.7`, not `... 4 7`.
    if (/^\d+$/.test(part) && prev && /[\d.]$/.test(prev)) {
      words[words.length - 1] = `${prev}.${part}`
    } else if (part === 'gpt') {
      words.push('GPT')
    } else {
      words.push(part.charAt(0).toUpperCase() + part.slice(1))
    }
  }
  return words.join(' ')
}

// Anthropic uses `xhigh`; spell it out rather than rendering a bare `Xhigh`.
const EFFORT_OVERRIDES: Record<string, string> = { xhigh: 'X-High' }

export function formatEffort(id: string): string {
  if (EFFORT_OVERRIDES[id]) return EFFORT_OVERRIDES[id]
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
