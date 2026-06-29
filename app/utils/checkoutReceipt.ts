/**
 * Utilities for the self-checkout "receipt".
 *
 * When a user opts in to "make a receipt", each stock removal performed during
 * checkout is recorded as a {@link ReceiptLine}. These lines capture what was
 * physically pulled from InvenTree — part number, revision, vendor (batch), the
 * quantity removed, and the stock item's own notes — so the removal can be
 * noted down and reconciled later.
 *
 * The markdown table mirrors the kit-list summary so the two screens feel
 * uniform and the output can be copy/pasted or printed.
 */

/**
 * One removal line on a checkout receipt. A single cart item may produce
 * several lines when its quantity is drawn from multiple stock items (each
 * potentially a different vendor/batch).
 */
export interface ReceiptLine {
  /** Part display name. */
  partName: string
  /** Internal part number. */
  ipn: string
  /** Part revision. */
  revision: string
  /** Vendor / batch of the stock line the quantity was pulled from. */
  vendor: string | null
  /** Quantity removed from this stock line. */
  quantity: number
  /** Notes recorded on the InvenTree stock item. */
  stockNotes: string
  /** Stock item pk the quantity was removed from. */
  stockItemPk: number
}

/** Escape pipe characters so values don't break markdown table cells. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()
}

/**
 * Render a markdown receipt table of everything removed during a checkout.
 * Suitable for copy/paste and printing.
 *
 * Columns: Part, IPN, Rev, Vendor, Qty, Stock Notes
 */
export function buildCheckoutReceiptMarkdown(params: {
  lines: ReceiptLine[]
  reason?: string
  generatedAt?: Date
}): string {
  const { lines, reason, generatedAt = new Date() } = params

  const out: string[] = []
  out.push('# Checkout Receipt')
  out.push('')
  out.push(`- **Generated:** ${generatedAt.toISOString()}`)
  if (reason && reason.trim()) {
    out.push(`- **Reason:** ${reason.trim()}`)
  }
  const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0)
  out.push(`- **Total items removed:** ${totalQty}`)
  out.push('')
  out.push('| Part | IPN | Rev | Vendor | Qty | Stock Notes |')
  out.push('| --- | --- | --- | --- | --- | --- |')

  for (const line of lines) {
    out.push(
      `| ${escapeCell(line.partName)} | ${escapeCell(line.ipn || '—')} `
      + `| ${escapeCell(line.revision || '—')} | ${escapeCell(line.vendor || '—')} `
      + `| ${line.quantity} | ${escapeCell(line.stockNotes || '—')} |`
    )
  }

  return out.join('\n')
}

/** Quote a CSV field, escaping embedded quotes and wrapping when needed. */
function csvCell(value: string | number): string {
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Render the receipt as CSV text suitable for "Save CSV".
 *
 * Columns: Part, IPN, Rev, Vendor, Qty, Stock Notes
 * Uses CRLF line endings for broad spreadsheet compatibility.
 */
export function buildCheckoutReceiptCsv(lines: ReceiptLine[]): string {
  const rows: string[] = []
  rows.push(['Part', 'IPN', 'Rev', 'Vendor', 'Qty', 'Stock Notes'].join(','))

  for (const line of lines) {
    rows.push([
      csvCell(line.partName),
      csvCell(line.ipn || ''),
      csvCell(line.revision || ''),
      csvCell(line.vendor || ''),
      csvCell(line.quantity),
      csvCell(line.stockNotes || '')
    ].join(','))
  }

  return rows.join('\r\n')
}
