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
  const sanitize = (s: string) => s.replace(/\s+/g, '-').replace(/[^A-Za-z0-9\-]/g, '').toUpperCase()

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
