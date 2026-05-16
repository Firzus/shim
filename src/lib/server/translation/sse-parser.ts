// Minimal, provider-agnostic SSE line-buffer parser. Yields parsed JSON event
// objects. Lines we ignore: keep-alive comments (`: ...`), empty lines.
//
// Both Codex and Anthropic SSE frames carry a JSON `data:` payload alongside
// a redundant `event:` line:
//   event: response.output_text.delta
//   data: {"type":"response.output_text.delta","delta":"hi"}
//
// We only consume `data:` JSON payloads — the `event:` line is redundant
// because the JSON already carries `type`.

// Open record: the upstream emits a long tail of event types; consumers
// narrow by inspecting `event.type`.
export interface SSEEvent {
  type: string
  [key: string]: unknown
}

export interface ParsedEvent {
  event: SSEEvent
  raw: string
}

export class SSELineBuffer {
  private buf = ''

  /**
   * Push a fresh chunk of UTF-8 text. Returns the array of complete events
   * extracted from the *combined* buffer. Partial events stay buffered until
   * the next chunk completes them.
   */
  push(chunk: string): ParsedEvent[] {
    this.buf += chunk
    const out: ParsedEvent[] = []

    // SSE event boundary is a blank line — handle both \n\n and \r\n\r\n.
    let boundary = this.findBoundary()
    while (boundary !== -1) {
      const raw = this.buf.slice(0, boundary)
      this.buf = this.buf.slice(boundary + this.boundaryLength)
      const parsed = parseFrame(raw)
      if (parsed) out.push({ event: parsed, raw })
      boundary = this.findBoundary()
    }
    return out
  }

  private boundaryLength = 0

  private findBoundary(): number {
    const lf = this.buf.indexOf('\n\n')
    const crlf = this.buf.indexOf('\r\n\r\n')
    if (lf === -1 && crlf === -1) return -1
    if (lf === -1) {
      this.boundaryLength = 4
      return crlf
    }
    if (crlf === -1) {
      this.boundaryLength = 2
      return lf
    }
    if (lf < crlf) {
      this.boundaryLength = 2
      return lf
    }
    this.boundaryLength = 4
    return crlf
  }

  /**
   * After upstream closes the connection, call this once to flush any
   * trailing frame that lacked a closing blank line.
   */
  flush(): ParsedEvent[] {
    if (!this.buf.trim()) {
      this.buf = ''
      return []
    }
    const raw = this.buf
    this.buf = ''
    const parsed = parseFrame(raw)
    return parsed ? [{ event: parsed, raw }] : []
  }
}

function parseFrame(frame: string): SSEEvent | null {
  const dataParts: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('data:')) {
      dataParts.push(line.slice(5).trimStart())
    }
  }
  if (dataParts.length === 0) return null
  const data = dataParts.join('\n')
  if (data === '[DONE]') return null
  try {
    return JSON.parse(data) as SSEEvent
  } catch {
    return null
  }
}
