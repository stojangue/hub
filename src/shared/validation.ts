/**
 * Helpers for validating untrusted input (file contents, IPC payloads).
 * Must stay free of runtime dependencies on Node or the DOM.
 */

export type UnknownRecord = Record<string, unknown>

export function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** True for strings that parse as a date, e.g. ISO 8601 timestamps. */
export function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

/** Maps a list with `sanitize`, dropping entries it rejects and entries with a duplicate `id`. */
export function sanitizeList<T extends { id: string }>(
  value: unknown,
  sanitize: (item: unknown) => T | null,
): T[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of value) {
    const entry = sanitize(item)
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    result.push(entry)
  }
  return result
}
