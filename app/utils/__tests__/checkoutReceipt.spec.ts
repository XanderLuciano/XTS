import { describe, it, expect } from 'vitest'
import { buildCheckoutReceiptMarkdown, type ReceiptLine } from '../checkoutReceipt'

/**
 * Tests for the checkout receipt markdown builder.
 *
 * Feature: checkout-receipt
 */

function makeLine(overrides: Partial<ReceiptLine> = {}): ReceiptLine {
  return {
    partName: 'Widget',
    ipn: 'PN-001',
    revision: 'A',
    vendor: 'NRG',
    quantity: 2,
    stockNotes: 'top shelf',
    stockItemPk: 10,
    ...overrides
  }
}

describe('buildCheckoutReceiptMarkdown', () => {
  it('includes a header with generated timestamp and total quantity', () => {
    const md = buildCheckoutReceiptMarkdown({
      lines: [makeLine({ quantity: 2 }), makeLine({ quantity: 3, stockItemPk: 11 })],
      generatedAt: new Date('2026-06-29T12:00:00.000Z')
    })
    expect(md).toContain('# Checkout Receipt')
    expect(md).toContain('**Generated:** 2026-06-29T12:00:00.000Z')
    expect(md).toContain('**Total items removed:** 5')
  })

  it('renders a markdown table header', () => {
    const md = buildCheckoutReceiptMarkdown({ lines: [makeLine()] })
    expect(md).toContain('| Part | IPN | Rev | Vendor | Qty | Stock Notes |')
    expect(md).toContain('| --- | --- | --- | --- | --- | --- |')
  })

  it('renders a row with part, ipn, rev, vendor, qty and notes', () => {
    const md = buildCheckoutReceiptMarkdown({ lines: [makeLine()] })
    expect(md).toContain('| Widget | PN-001 | A | NRG | 2 | top shelf |')
  })

  it('includes the reason line when provided', () => {
    const md = buildCheckoutReceiptMarkdown({ lines: [makeLine()], reason: 'prototype build' })
    expect(md).toContain('**Reason:** prototype build')
  })

  it('omits the reason line when blank', () => {
    const md = buildCheckoutReceiptMarkdown({ lines: [makeLine()], reason: '   ' })
    expect(md).not.toContain('**Reason:**')
  })

  it('falls back to an em dash for missing vendor and notes', () => {
    const md = buildCheckoutReceiptMarkdown({
      lines: [makeLine({ vendor: null, stockNotes: '', ipn: '', revision: '' })]
    })
    expect(md).toContain('| Widget | — | — | — | 2 | — |')
  })

  it('escapes pipe characters so the table is not broken', () => {
    const md = buildCheckoutReceiptMarkdown({ lines: [makeLine({ stockNotes: 'a|b' })] })
    expect(md).toContain('a\\|b')
  })
})
