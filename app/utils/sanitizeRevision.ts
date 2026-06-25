/**
 * Sanitize a revision string:
 * - Strip "Rev " or "rev " prefix if present
 * - Trim whitespace
 * - If it's a single digit (0-9), zero-pad to two digits (e.g. "1" → "01")
 * - If it's a letter, uppercase it (e.g. "a" → "A")
 */
export function sanitizeRevision(input: string): string {
  // Strip common prefixes
  const rev = input.replace(/^rev\s*/i, '').trim()

  if (!rev) return ''

  // Single digit → zero-pad
  if (/^\d$/.test(rev)) {
    return `0${rev}`
  }

  // Multi-digit number — leave as-is
  if (/^\d+$/.test(rev)) {
    return rev
  }

  // Letter(s) — uppercase
  return rev.toUpperCase()
}
