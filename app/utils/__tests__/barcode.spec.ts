import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { classifyBarcodeMatch, type BarcodeMatchKind } from '../barcode'

/**
 * Tests for classifyBarcodeMatch — the helper that decides whether a manually
 * entered barcode that is already in use belongs to the same part, a different
 * revision of the same part, or a completely different part.
 *
 * Feature: create-part-existing-barcode
 */
describe('classifyBarcodeMatch', () => {
  it('returns "same-part" when IPN and revision both match', () => {
    expect(
      classifyBarcodeMatch({
        existingIpn: '165801-001',
        existingRevision: 'A',
        enteredIpn: '165801-001',
        enteredRevision: 'A'
      })
    ).toBe<BarcodeMatchKind>('same-part')
  })

  it('returns "same-ipn-diff-rev" when IPN matches but revision differs', () => {
    expect(
      classifyBarcodeMatch({
        existingIpn: '165801-001',
        existingRevision: 'A',
        enteredIpn: '165801-001',
        enteredRevision: 'B'
      })
    ).toBe<BarcodeMatchKind>('same-ipn-diff-rev')
  })

  it('returns "different-part" when IPN differs', () => {
    expect(
      classifyBarcodeMatch({
        existingIpn: '165801-001',
        existingRevision: 'A',
        enteredIpn: '999999-001',
        enteredRevision: 'A'
      })
    ).toBe<BarcodeMatchKind>('different-part')
  })

  it('treats empty/blank entered IPN as "different-part" (cannot be a true match)', () => {
    expect(
      classifyBarcodeMatch({
        existingIpn: '',
        existingRevision: 'A',
        enteredIpn: '',
        enteredRevision: 'A'
      })
    ).toBe<BarcodeMatchKind>('different-part')
  })

  it('treats missing revisions on both sides as matching revisions', () => {
    expect(
      classifyBarcodeMatch({
        existingIpn: '165801-001',
        existingRevision: null,
        enteredIpn: '165801-001',
        enteredRevision: undefined
      })
    ).toBe<BarcodeMatchKind>('same-part')
  })

  it('trims surrounding whitespace before comparing', () => {
    expect(
      classifyBarcodeMatch({
        existingIpn: ' 165801-001 ',
        existingRevision: ' A ',
        enteredIpn: '165801-001',
        enteredRevision: 'A'
      })
    ).toBe<BarcodeMatchKind>('same-part')
  })

  // Property: same IPN + same revision (both non-empty) is always 'same-part'
  it('Property: identical non-empty IPN and revision always classify as same-part', () => {
    const nonEmpty = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
    fc.assert(
      fc.property(nonEmpty, nonEmpty, (ipn, rev) => {
        expect(
          classifyBarcodeMatch({
            existingIpn: ipn,
            existingRevision: rev,
            enteredIpn: ipn,
            enteredRevision: rev
          })
        ).toBe('same-part')
      }),
      { numRuns: 100 }
    )
  })

  // Property: differing IPNs always classify as different-part regardless of revision
  it('Property: differing IPNs always classify as different-part', () => {
    const ipnArb = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
    const revArb = fc.string({ maxLength: 10 })
    fc.assert(
      fc.property(ipnArb, ipnArb, revArb, revArb, (ipnA, ipnB, revA, revB) => {
        fc.pre(ipnA.trim() !== ipnB.trim())
        expect(
          classifyBarcodeMatch({
            existingIpn: ipnA,
            existingRevision: revA,
            enteredIpn: ipnB,
            enteredRevision: revB
          })
        ).toBe('different-part')
      }),
      { numRuns: 100 }
    )
  })

  // Property: the result is always one of the three valid kinds
  it('Property: result is always a valid BarcodeMatchKind', () => {
    const strArb = fc.option(fc.string({ maxLength: 20 }), { nil: undefined })
    fc.assert(
      fc.property(strArb, strArb, strArb, strArb, (a, b, c, d) => {
        const kind = classifyBarcodeMatch({
          existingIpn: a,
          existingRevision: b,
          enteredIpn: c,
          enteredRevision: d
        })
        expect(['same-part', 'same-ipn-diff-rev', 'different-part']).toContain(kind)
      }),
      { numRuns: 200 }
    )
  })
})

/**
 * Static verification that create-part.vue wires the barcode-in-use check
 * into the part-creation flow as designed.
 */
describe('create-part.vue existing-barcode handling', () => {
  const content = readFileSync(resolve(__dirname, '../../pages/create-part.vue'), 'utf-8')

  it('declares a barcode field on the form', () => {
    expect(content).toContain('barcode: string')
  })

  it('checks an entered barcode against InvenTree before creating', () => {
    expect(content).toContain('inventree.scanBarcode(manualBarcode)')
  })

  it('uses classifyBarcodeMatch to compare the existing part', () => {
    expect(content).toContain('classifyBarcodeMatch(')
  })

  it('blocks creation when the barcode is already in use', () => {
    expect(content).toContain('title: \'Barcode already in use\'')
  })

  it('links a manually entered barcode even when label printing is off', () => {
    expect(content).toContain('manualBarcode || partForm.printLabels')
    expect(content).toContain('manualBarcode || generateBarcode(')
  })
})
