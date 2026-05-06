import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { Part } from '~/types/inventree'

// Feature: smart-barcode-lookup, Property 10: localStorage round-trip persistence

/**
 * Property-based test for localStorage round-trip persistence of ScanRecord arrays.
 *
 * Validates: Requirements 4.6
 *
 * For any scan history containing records in various states (found with part data,
 * not_found, error with messages), serializing to JSON and deserializing should
 * produce an equivalent scan history with all lookupStatus, part, and errorMessage
 * fields preserved.
 */

interface ScanRecord {
  barcode: string
  type?: string
  timestamp: Date
  lookupStatus: 'loading' | 'found' | 'not_found' | 'error'
  part?: Part
  errorMessage?: string
}

// --- Arbitraries ---

const barcodeArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0)

const barcodeTypeArb = fc.constantFrom(
  '1D - EAN-13', '1D - EAN-8', '1D - UPC-A', '1D - Code 128',
  '2D - QR Code', '2D - Data Matrix',
)

const timestampArb = fc.date({
  min: new Date('2020-01-01T00:00:00.000Z'),
  max: new Date('2030-12-31T23:59:59.999Z'),
}).filter(d => !isNaN(d.getTime()))

const partArb: fc.Arbitrary<Part> = fc.record({
  pk: fc.integer({ min: 1, max: 100000 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.string({ maxLength: 200 }),
  IPN: fc.string({ minLength: 1, maxLength: 50 }),
  revision: fc.string({ maxLength: 10 }),
  category: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: null }),
  active: fc.boolean(),
  virtual: fc.boolean(),
  component: fc.boolean(),
  assembly: fc.boolean(),
  purchaseable: fc.boolean(),
  salable: fc.boolean(),
  trackable: fc.boolean(),
  in_stock: fc.integer({ min: 0, max: 10000 }),
  link: fc.string({ maxLength: 200 }),
  image: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
  thumbnail: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
})

const errorMessageArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0)

// Generate ScanRecords in persistable states (not 'loading' — those get re-triggered, not round-tripped)
const foundRecordArb: fc.Arbitrary<ScanRecord> = fc.record({
  barcode: barcodeArb,
  type: fc.option(barcodeTypeArb, { nil: undefined }),
  timestamp: timestampArb,
  lookupStatus: fc.constant('found' as const),
  part: partArb,
  errorMessage: fc.constant(undefined),
})

const notFoundRecordArb: fc.Arbitrary<ScanRecord> = fc.record({
  barcode: barcodeArb,
  type: fc.option(barcodeTypeArb, { nil: undefined }),
  timestamp: timestampArb,
  lookupStatus: fc.constant('not_found' as const),
  part: fc.constant(undefined),
  errorMessage: fc.constant(undefined),
})

const errorRecordArb: fc.Arbitrary<ScanRecord> = fc.record({
  barcode: barcodeArb,
  type: fc.option(barcodeTypeArb, { nil: undefined }),
  timestamp: timestampArb,
  lookupStatus: fc.constant('error' as const),
  part: fc.constant(undefined),
  errorMessage: errorMessageArb,
})

const scanRecordArb: fc.Arbitrary<ScanRecord> = fc.oneof(
  foundRecordArb,
  notFoundRecordArb,
  errorRecordArb,
)

const scanHistoryArb = fc.array(scanRecordArb, { minLength: 0, maxLength: 20 })

/**
 * Simulate the same round-trip that scan.vue performs:
 * 1. JSON.stringify (serializes Dates to ISO strings)
 * 2. JSON.parse
 * 3. Restore Date objects from timestamp strings (same as onMounted logic)
 */
function roundTrip(history: ScanRecord[]): ScanRecord[] {
  const serialized = JSON.stringify(history)
  const parsed = JSON.parse(serialized)
  return parsed.map((item: any) => ({
    ...item,
    timestamp: new Date(item.timestamp),
    lookupStatus: item.lookupStatus || 'not_found',
  }))
}

describe('ScanRecord localStorage round-trip', () => {
  // Feature: smart-barcode-lookup, Property 10: localStorage round-trip persistence
  it('should preserve all fields through JSON serialize/deserialize round-trip', () => {
    fc.assert(
      fc.property(
        scanHistoryArb,
        (history) => {
          const restored = roundTrip(history)

          expect(restored).toHaveLength(history.length)

          for (let i = 0; i < history.length; i++) {
            const original = history[i]
            const result = restored[i]

            // Core identity fields
            expect(result.barcode).toBe(original.barcode)
            expect(result.type).toBe(original.type)

            // Timestamp round-trips through ISO string
            expect(result.timestamp.getTime()).toBe(original.timestamp.getTime())

            // Lookup state fields
            expect(result.lookupStatus).toBe(original.lookupStatus)
            expect(result.errorMessage).toBe(original.errorMessage)

            // Part data deep equality
            if (original.part !== undefined) {
              expect(result.part).toEqual(original.part)
            } else {
              expect(result.part).toBeUndefined()
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
