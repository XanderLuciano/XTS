import { describe, it, expect } from 'vitest'
import { buildCheckoutReason, buildKitSummaryMarkdown } from '../kitSummary'
import type { KitItem } from '~/types/kit'

/**
 * Tests for the kit summary utilities: the checkout reason builder and the
 * markdown summary table generator.
 *
 * Feature: kit-list
 */

function makeItem(overrides: Partial<KitItem> = {}): KitItem {
  return {
    id: 'id-1',
    bomItemPk: 1,
    partPk: 10,
    ipn: 'PN-001',
    name: 'Widget',
    targetRevision: 'A',
    perBuildQty: 1,
    requiredQty: 2,
    kitQty: 2,
    inStock: 5,
    locations: [],
    resolving: false,
    scans: [],
    note: '',
    status: 'complete',
    thumbnail: null,
    ...overrides
  }
}

describe('buildCheckoutReason', () => {
  it('combines a note with the kit tag', () => {
    expect(buildCheckoutReason('for prototype', 'WIDGET-001')).toBe('for prototype [Kit: WIDGET-001]')
  })

  it('uses only the kit tag when there is no note', () => {
    expect(buildCheckoutReason('', 'WIDGET-001')).toBe('[Kit: WIDGET-001]')
    expect(buildCheckoutReason(null, 'WIDGET-001')).toBe('[Kit: WIDGET-001]')
    expect(buildCheckoutReason(undefined, 'WIDGET-001')).toBe('[Kit: WIDGET-001]')
  })

  it('trims surrounding whitespace from the note', () => {
    expect(buildCheckoutReason('  spaced  ', 'K-1')).toBe('spaced [Kit: K-1]')
  })
})

describe('buildKitSummaryMarkdown', () => {
  it('includes a header with kit name, assembly, and build qty', () => {
    const md = buildKitSummaryMarkdown({
      kitName: 'WIDGET-001',
      assemblyName: 'Widget Assembly',
      buildQty: 3,
      items: [makeItem()]
    })
    expect(md).toContain('# Kit: WIDGET-001')
    expect(md).toContain('**Assembly:** Widget Assembly')
    expect(md).toContain('**Build quantity:** 3')
  })

  it('renders a markdown table header', () => {
    const md = buildKitSummaryMarkdown({
      kitName: 'K', assemblyName: 'A', buildQty: 1, items: [makeItem()]
    })
    expect(md).toContain('| Part | IPN | Rev | Qty | Batches | Status | Notes |')
    expect(md).toContain('| --- | --- | --- | --- | --- | --- | --- |')
  })

  it('lists batches collected from scans, de-duplicated', () => {
    const item = makeItem({
      scans: [
        { barcode: 'b1', ipn: 'PN-001', revision: 'A', batch: 'NRG', stockItemPk: 1, matchKind: 'exact', scannedAt: 1 },
        { barcode: 'b2', ipn: 'PN-001', revision: 'A', batch: 'NRG', stockItemPk: 2, matchKind: 'exact', scannedAt: 2 },
        { barcode: 'b3', ipn: 'PN-001', revision: 'A', batch: 'UMT', stockItemPk: 3, matchKind: 'exact', scannedAt: 3 }
      ]
    })
    const md = buildKitSummaryMarkdown({ kitName: 'K', assemblyName: 'A', buildQty: 1, items: [item] })
    expect(md).toContain('NRG, UMT')
  })

  it('shows skipped items with reason and zero quantity', () => {
    const item = makeItem({ status: 'skipped', skipReason: 'out of stock', kitQty: 4 })
    const md = buildKitSummaryMarkdown({ kitName: 'K', assemblyName: 'A', buildQty: 1, items: [item] })
    expect(md).toContain('SKIPPED: out of stock')
    expect(md).toContain('| Skipped |')
    // Quantity column should be 0 for skipped items
    expect(md).toContain('| 0 |')
  })

  it('escapes pipe characters in notes so the table is not broken', () => {
    const item = makeItem({ note: 'a|b' })
    const md = buildKitSummaryMarkdown({ kitName: 'K', assemblyName: 'A', buildQty: 1, items: [item] })
    expect(md).toContain('a\\|b')
  })

  it('maps statuses to readable labels', () => {
    const items = [
      makeItem({ id: '1', status: 'complete' }),
      makeItem({ id: '2', status: 'rev-mismatch' }),
      makeItem({ id: '3', status: 'error' }),
      makeItem({ id: '4', status: 'partial' })
    ]
    const md = buildKitSummaryMarkdown({ kitName: 'K', assemblyName: 'A', buildQty: 1, items })
    expect(md).toContain('| OK |')
    expect(md).toContain('| Rev mismatch |')
    expect(md).toContain('| Error |')
    expect(md).toContain('| Partial |')
  })
})
