// Pretty labels for Codex model ids and reasoning-effort tokens. The
// upstream values are kebab-case (e.g. `gpt-5.4-mini`, `extra-high`); the UI
// shows them in title case (e.g. `GPT 5.4 Mini`, `Extra High`).

export function formatModel(id: string): string {
  return id
    .split('-')
    .map((part, idx) => {
      if (idx === 0 && part === 'gpt') return 'GPT'
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

export function formatEffort(id: string): string {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
