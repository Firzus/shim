// Stable no-deps FNV-1a key for routing the same static prompt prefix to the
// same upstream server, improving cache locality across Cursor turns.

export function deriveCacheKey(instructions: string): string {
  if (!instructions) return 'shim-default'
  let h = 0x811c9dc5
  for (let i = 0; i < instructions.length; i++) {
    h ^= instructions.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `shim-${h.toString(16).padStart(8, '0')}`
}
