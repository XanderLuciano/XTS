import type { KitItem } from '~/types/kit'

/**
 * Build the checkout "reason" string recorded against each stock removal.
 * Combines the per-part note with the kit name so InvenTree's stock tracking
 * shows both what was removed and which kit it went into.
 *
 * Examples:
 *   note "for prototype", kit "WIDGET-001"  -> "for prototype [Kit: WIDGET-001]"
 *   no note,             kit "WIDGET-001"   -> "[Kit: WIDGET-001]"
 */
export function buildCheckoutReason(note: string | undefined | null, kitName: string): string {
  const trimmedNote = (note || '').trim()
  const tag = `[Kit: ${kitName}]`
  return trimmedNote ? `${trimmedNote} ${tag}` : tag
}

/** Escape pipe characters so notes don't break markdown table cells. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()
}

/**
 * Render a markdown summary table of a completed (or in-progress) kit.
 * Suitable for copy/paste and printing.
 *
 * Columns: Part, IPN, Rev, Qty, Batches, Status, Notes
 */
export function buildKitSummaryMarkdown(params: {
  kitName: string
  assemblyName: string
  buildQty: number
  items: KitItem[]
}): string {
  const { kitName, assemblyName, buildQty, items } = params

  const lines: string[] = []
  lines.push(`# Kit: ${kitName}`)
  lines.push('')
  lines.push(`- **Assembly:** ${assemblyName}`)
  lines.push(`- **Build quantity:** ${buildQty}`)
  lines.push(`- **Generated:** ${new Date().toISOString()}`)
  lines.push('')
  lines.push('| Part | IPN | Rev | Qty | Batches | Status | Notes |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')

  for (const item of items) {
    const batches = [...new Set(item.scans.map(s => s.batch).filter((b): b is string => !!b))]
    const batchStr = batches.length > 0 ? batches.join(', ') : '—'
    const statusLabel = describeStatus(item)
    const note = item.status === 'skipped'
      ? `SKIPPED: ${item.skipReason || 'no reason given'}`
      : (item.note || '')
    lines.push(
      `| ${escapeCell(item.name)} | ${escapeCell(item.ipn || '—')} | ${escapeCell(item.targetRevision || '—')} `
      + `| ${item.status === 'skipped' ? 0 : item.kitQty} | ${escapeCell(batchStr)} | ${statusLabel} | ${escapeCell(note)} |`
    )
  }

  return lines.join('\n')
}

/** Human-readable status label used in the summary table. */
function describeStatus(item: KitItem): string {
  switch (item.status) {
    case 'complete': return 'OK'
    case 'rev-mismatch': return 'Rev mismatch'
    case 'skipped': return 'Skipped'
    case 'error': return 'Error'
    case 'partial': return 'Partial'
    default: return 'Pending'
  }
}
