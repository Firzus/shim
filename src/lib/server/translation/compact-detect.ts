// Sentinel-based /compact detection. A custom Cursor slash command
// (.cursor/commands/compact.md) injects the marker at the start of a user
// message; the handler swaps into summarization mode on match. The V1 suffix
// reserves room for rotating the marker.

export const SHIM_COMPACT_SENTINEL = '<<<SHIM_COMPACT_V1>>>'

export const COMPACT_INSTRUCTIONS = [
  'You are producing a hand-off summary of the preceding conversation so the user can paste it into a fresh Cursor chat and continue without losing context.',
  '',
  'Output Markdown only. Do not call tools. Do not ask follow-up questions.',
  '',
  'Wrap the entire response between these exact markers on their own lines:',
  '',
  '=== SHIM COMPACTION ARTIFACT ===',
  '',
  'and',
  '',
  '=== END COMPACTION — open a new Cursor chat and paste the "Hand-off snippet" section above ===',
  '',
  'Inside the markers, produce these sections with `##` headings, in order:',
  '',
  '## Goal',
  'One-sentence description of what the user is trying to accomplish.',
  '',
  '## Decisions made',
  'Bullet list of concrete decisions, conventions, or constraints established so far.',
  '',
  '## Files touched',
  'Bullet list of file paths read or modified, with a one-line note on each.',
  '',
  '## Open tasks',
  'Numbered list of remaining work, ordered by priority.',
  '',
  '## Latest state',
  'Where the conversation stands right now — what was just attempted, what is blocking, what the next step is.',
  '',
  '## Hand-off snippet',
  'A copy-pasteable kickoff prompt for a fresh chat: include the goal, the relevant files, the open tasks, and any critical constraints. Self-contained. The user will paste this verbatim as the first message of a new chat.',
].join('\n')

interface InputItem extends Record<string, unknown> {
  type?: string
  role?: string
  content?: unknown
}

interface ContentPart extends Record<string, unknown> {
  type?: string
  text?: unknown
}

export type CompactDetectResult = { matched: false } | { matched: true; strippedInput: InputItem[] }

// Matches only when the sentinel appears in the *last* user message — echoed
// history and assistant text are ignored. On match, the sentinel substring is
// stripped; if a text part becomes empty it's dropped, and an empty message
// gets a fallback part (Codex 400s on empty content).
export function detectCompactSentinel(input: readonly InputItem[]): CompactDetectResult {
  if (!Array.isArray(input) || input.length === 0) return { matched: false }

  let targetIndex = -1
  for (let i = input.length - 1; i >= 0; i--) {
    const item = input[i]
    if (!item || typeof item !== 'object') continue
    if (item.type === 'message' && item.role === 'user') {
      targetIndex = i
      break
    }
  }
  if (targetIndex < 0) return { matched: false }

  const target = input[targetIndex]
  if (!target) return { matched: false }

  const parts = Array.isArray(target.content) ? (target.content as ContentPart[]) : []
  const hasSentinel = parts.some(
    (p) =>
      p &&
      typeof p === 'object' &&
      typeof p.text === 'string' &&
      p.text.includes(SHIM_COMPACT_SENTINEL),
  )
  if (!hasSentinel) return { matched: false }

  const strippedParts: ContentPart[] = []
  for (const part of parts) {
    if (!part || typeof part !== 'object') {
      strippedParts.push(part)
      continue
    }
    if (typeof part.text !== 'string' || !part.text.includes(SHIM_COMPACT_SENTINEL)) {
      strippedParts.push(part)
      continue
    }
    const cleaned = part.text.split(SHIM_COMPACT_SENTINEL).join('').trim()
    if (cleaned.length === 0) continue
    strippedParts.push({ ...part, text: cleaned })
  }
  if (strippedParts.length === 0) {
    strippedParts.push({ type: 'input_text', text: 'Please summarize the conversation so far.' })
  }

  const strippedInput = input.slice()
  strippedInput[targetIndex] = { ...target, content: strippedParts }
  return { matched: true, strippedInput }
}
