/**
 * Generate a deterministic barcode string for a stock item.
 * Format: {IPN}-{REV}-{BATCH}-{PK}
 * Components are sanitized (spaces → dashes, uppercased).
 */
export function generateBarcode(params: {
  ipn: string
  revision: string
  batch: string
  stockItemPk: number
}): string {
  const sanitize = (s: string) => s.replace(/\s+/g, '-').replace(/[^A-Za-z0-9-]/g, '').toUpperCase()

  const parts = [
    sanitize(params.ipn || 'NOIPN'),
    sanitize(params.revision || '0'),
    sanitize(params.batch || 'NOBATCH'),
    String(params.stockItemPk)
  ]

  return parts.join('-')
}

/**
 * Extract a stored barcode from a stock item's notes field.
 * Looks for a line starting with "barcode:" prefix.
 */
export function extractBarcodeFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  const match = notes.match(/barcode:(\S+)/)
  return match ? match[1]! : null
}

/**
 * Extract JIRA ticket references from a stock item's notes field.
 * Looks for a line starting with "tickets:" prefix.
 * Returns an array of ticket strings (e.g. ['PI-1234', 'MFG-12345']) or empty array.
 */
export function extractTicketsFromNotes(notes: string | null | undefined): string[] {
  if (!notes) return []
  const match = notes.match(/tickets:(.+)/)
  if (!match || !match[1]) return []
  return match[1].split(',').map(t => t.trim()).filter(Boolean)
}

/**
 * Sanitize and validate a raw JIRA ticket input string.
 * Accepts comma-separated tickets, trims whitespace, uppercases,
 * and validates each matches {TEXT}-{NUMBER} format.
 * Returns { valid: true, tickets: [...] } or { valid: false, invalid: [...] }
 */
export function sanitizeTickets(input: string): { valid: true, tickets: string[] } | { valid: false, invalid: string[] } {
  if (!input.trim()) return { valid: true, tickets: [] }

  const raw = input.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  const ticketPattern = /^[A-Z]+-\d+$/
  const invalid = raw.filter(t => !ticketPattern.test(t))

  if (invalid.length > 0) {
    return { valid: false, invalid }
  }

  return { valid: true, tickets: raw }
}

/**
 * Append or update JIRA ticket references in notes text.
 * Stores as "tickets:PI-1234,MFG-12345" (comma-separated, no spaces).
 * Replaces an existing tickets: line if present, otherwise appends.
 */
export function setTicketsInNotes(existingNotes: string | null | undefined, tickets: string[]): string {
  const prefix = `tickets:${tickets.join(',')}`
  if (!existingNotes) return prefix

  // Replace existing tickets line
  if (existingNotes.match(/tickets:.+/)) {
    return existingNotes.replace(/tickets:.+/, prefix)
  }

  // Append
  return `${existingNotes}\n${prefix}`
}

/**
 * Append or update a barcode reference in notes text.
 * Replaces an existing barcode: line if present, otherwise appends.
 */
export function setBarcodeInNotes(existingNotes: string | null | undefined, barcode: string): string {
  const prefix = `barcode:${barcode}`
  if (!existingNotes) return prefix

  // Replace existing barcode line
  if (existingNotes.match(/barcode:\S+/)) {
    return existingNotes.replace(/barcode:\S+/, prefix)
  }

  // Append
  return `${existingNotes}\n${prefix}`
}

/**
 * The kind of conflict detected when a manually-entered barcode is already
 * linked to an existing part in InvenTree.
 *
 * - 'same-part'        — same IPN and same revision (a true match)
 * - 'same-ipn-diff-rev' — same IPN but a different revision of that part
 * - 'different-part'   — a different part entirely (IPN mismatch)
 */
export type BarcodeMatchKind = 'same-part' | 'same-ipn-diff-rev' | 'different-part'

/**
 * Compare an existing barcode-linked part against the part being created.
 *
 * Barcodes encode partnumber-rev-vendor, so a genuine match requires both the
 * IPN and the revision to line up. A blank IPN on either side can never be a
 * "same part" match because it is not a meaningful part identifier.
 */
export function classifyBarcodeMatch(params: {
  existingIpn: string | null | undefined
  existingRevision: string | null | undefined
  enteredIpn: string | null | undefined
  enteredRevision: string | null | undefined
}): BarcodeMatchKind {
  const existingIpn = (params.existingIpn || '').trim()
  const enteredIpn = (params.enteredIpn || '').trim()
  const existingRev = (params.existingRevision || '').trim()
  const enteredRev = (params.enteredRevision || '').trim()

  const ipnMatches = enteredIpn.length > 0 && existingIpn === enteredIpn
  const revMatches = existingRev === enteredRev

  if (ipnMatches && revMatches) return 'same-part'
  if (ipnMatches) return 'same-ipn-diff-rev'
  return 'different-part'
}
