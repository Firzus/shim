// Extract readable text from Claude Code internal tool calls (CreatePlan,
// TodoWrite, Task/Agent subagent dispatch, ...) so they can be emitted as text
// to Cursor instead of being silently dropped.

const SUBAGENT_TOOL_NAMES = new Set(['Task', 'Agent', 'spawn_subagent', 'delegate'])

/** True when the tool name maps to a subagent-dispatch invocation. */
export function isSubagentToolName(name: string | undefined | null): boolean {
  if (!name) return false
  return SUBAGENT_TOOL_NAMES.has(name)
}

function appendList(parts: string[], value: unknown): void {
  if (!Array.isArray(value)) return
  for (const item of value) {
    if (typeof item === 'string') {
      parts.push(`- ${item}`)
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const text = o.content ?? o.text ?? o.title ?? o.description
      if (typeof text === 'string' && text) {
        const status = typeof o.status === 'string' ? `[${o.status}] ` : ''
        parts.push(`- ${status}${text}`)
      }
    }
  }
}

function genericExtract(obj: Record<string, unknown>): string | null {
  const parts: string[] = []
  for (const value of Object.values(obj)) {
    if (typeof value === 'string' && value.trim()) {
      parts.push(value)
    } else if (Array.isArray(value)) {
      appendList(parts, value)
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : null
}

function formatSubagentDispatch(toolName: string, obj: Record<string, unknown>): string | null {
  const parts: string[] = []
  const subagentType = typeof obj.subagent_type === 'string' ? obj.subagent_type : ''
  const description = typeof obj.description === 'string' ? obj.description : ''
  const prompt = typeof obj.prompt === 'string' ? obj.prompt : ''
  const model = typeof obj.model === 'string' ? obj.model : ''

  const headerBits = [subagentType, description].filter(Boolean)
  const headerLabel = headerBits.length > 0 ? `: ${headerBits.join(' — ')}` : ''
  parts.push(`▶ Subagent dispatch (${toolName}${headerLabel})${model ? ` [model: ${model}]` : ''}`)
  if (prompt) parts.push(prompt)
  return parts.length > 0 ? parts.join('\n\n') : null
}

/**
 * Parse the JSON payload of an internal tool call and return human-readable
 * text. Returns null if nothing useful can be extracted.
 */
export function formatInternalToolContent(toolName: string, data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>

  if (toolName === 'CreatePlan') {
    const parts: string[] = []
    if (typeof obj.title === 'string' && obj.title) parts.push(obj.title)
    if (typeof obj.summary === 'string' && obj.summary) parts.push(obj.summary)
    if (typeof obj.description === 'string' && obj.description) parts.push(obj.description)
    if (typeof obj.plan === 'string' && obj.plan) parts.push(obj.plan)
    appendList(parts, obj.todos)
    appendList(parts, obj.steps)
    return parts.length > 0 ? parts.join('\n\n') : null
  }

  if (toolName === 'TodoWrite') {
    const parts: string[] = []
    appendList(parts, obj.todos)
    appendList(parts, obj.items)
    appendList(parts, obj.tasks)
    return parts.length > 0 ? parts.join('\n\n') : null
  }

  if (isSubagentToolName(toolName)) {
    return formatSubagentDispatch(toolName, obj)
  }

  return genericExtract(obj)
}
