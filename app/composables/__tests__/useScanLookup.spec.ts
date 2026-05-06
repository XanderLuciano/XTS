import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import { ref, triggerRef, type Ref } from 'vue'
import type { Part } from '~/types/inventree'

/**
 * Property-based tests for useScanLookup composable
 *
 * These tests validate correctness properties across many randomly generated inputs
 * using the fast-check library.
 */

// --- ScanRecord interface (mirrors the composable's internal type) ---
interface ScanRecord {
  barcode: string
  type?: string
  timestamp: Date
  lookupStatus: 'loading' | 'found' | 'not_found' | 'error'
  part?: Part
  errorMessage?: string
}

// --- Mock setup ---
// useInventreeApi and triggerRef are Nuxt auto-imports (globals at runtime).
// We stub them globally so the composable can call them without explicit imports.

let mockScanBarcode: ReturnType<typeof vi.fn>

vi.stubGlobal('useInventreeApi', () => ({
  scanBarcode: (...args: unknown[]) => mockScanBarcode(...args),
}))

vi.stubGlobal('triggerRef', triggerRef)

// Import composable AFTER globals are stubbed
const { useScanLookup } = await import('../useScanLookup')

// --- Arbitraries ---

const barcodeArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0)

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

// --- Helper ---
function makeScanRecord(barcode: string, overrides?: Partial<ScanRecord>): ScanRecord {
  return {
    barcode,
    timestamp: new Date(),
    lookupStatus: 'loading',
    ...overrides,
  }
}


describe('useScanLookup', () => {
  beforeEach(() => {
    mockScanBarcode = vi.fn()
  })

  // Feature: smart-barcode-lookup, Property 1: Lookup initiation on scan
  describe('Property 1: Lookup initiation on scan', () => {
    /**
     * **Validates: Requirements 1.1, 1.2**
     *
     * For any valid barcode string added to the scan history, the corresponding
     * ScanRecord should immediately have lookupStatus === 'loading' and
     * InventreeService.scanBarcode should be called with that barcode value.
     */
    it('should set loading status and call scanBarcode for any valid barcode', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            mockScanBarcode.mockReset()
            let capturedStatus: string | undefined

            // Capture the record's lookupStatus at the moment scanBarcode is called
            mockScanBarcode.mockImplementation(() => {
              capturedStatus = record.lookupStatus
              return Promise.resolve(null)
            })

            const { lookupBarcode } = useScanLookup()
            const record = makeScanRecord(barcode)
            const scanHistory: Ref<ScanRecord[]> = ref([record])

            await lookupBarcode(record, scanHistory)

            // The record was set to 'loading' before scanBarcode was invoked
            expect(capturedStatus).toBe('loading')

            // scanBarcode was called exactly once with the barcode value
            expect(mockScanBarcode).toHaveBeenCalledTimes(1)
            expect(mockScanBarcode).toHaveBeenCalledWith(barcode)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // Feature: smart-barcode-lookup, Property 2: Found state transition
  describe('Property 2: Found state transition', () => {
    /**
     * **Validates: Requirements 1.3, 6.2**
     *
     * For any barcode where InventreeService.scanBarcode returns a Part object,
     * the corresponding ScanRecord should transition to lookupStatus === 'found'
     * and its part field should contain the returned Part data.
     */
    it('should transition to found with part data when scanBarcode returns a Part', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          partArb,
          async (barcode, part) => {
            mockScanBarcode.mockReset()
            mockScanBarcode.mockResolvedValue(part)

            const { lookupBarcode } = useScanLookup()
            const record = makeScanRecord(barcode)
            const scanHistory: Ref<ScanRecord[]> = ref([record])

            await lookupBarcode(record, scanHistory)

            expect(record.lookupStatus).toBe('found')
            expect(record.part).toEqual(part)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // Feature: smart-barcode-lookup, Property 3: Not-found state transition
  describe('Property 3: Not-found state transition', () => {
    /**
     * **Validates: Requirements 1.4**
     *
     * For any barcode where InventreeService.scanBarcode returns null,
     * the corresponding ScanRecord should transition to lookupStatus === 'not_found'
     * with no part data.
     */
    it('should transition to not_found with no part when scanBarcode returns null', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            mockScanBarcode.mockReset()
            mockScanBarcode.mockResolvedValue(null)

            const { lookupBarcode } = useScanLookup()
            const record = makeScanRecord(barcode)
            const scanHistory: Ref<ScanRecord[]> = ref([record])

            await lookupBarcode(record, scanHistory)

            expect(record.lookupStatus).toBe('not_found')
            expect(record.part).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // Feature: smart-barcode-lookup, Property 4: Error state transition
  describe('Property 4: Error state transition', () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * For any barcode where InventreeService.scanBarcode throws an error,
     * the corresponding ScanRecord should transition to lookupStatus === 'error'
     * and its errorMessage should contain the thrown error's message.
     */
    it('should transition to error with errorMessage when scanBarcode throws', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          errorMessageArb,
          async (barcode, errMsg) => {
            mockScanBarcode.mockReset()
            mockScanBarcode.mockRejectedValue(new Error(errMsg))

            const { lookupBarcode } = useScanLookup()
            const record = makeScanRecord(barcode)
            const scanHistory: Ref<ScanRecord[]> = ref([record])

            await lookupBarcode(record, scanHistory)

            expect(record.lookupStatus).toBe('error')
            expect(record.errorMessage).toBe(errMsg)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should use generic message when scanBarcode throws a non-Error object', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            mockScanBarcode.mockReset()
            mockScanBarcode.mockRejectedValue('some string error')

            const { lookupBarcode } = useScanLookup()
            const record = makeScanRecord(barcode)
            const scanHistory: Ref<ScanRecord[]> = ref([record])

            await lookupBarcode(record, scanHistory)

            expect(record.lookupStatus).toBe('error')
            expect(record.errorMessage).toBe('Failed to look up barcode')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // Feature: smart-barcode-lookup, Property 5: State invariant
  describe('Property 5: State invariant', () => {
    /**
     * **Validates: Requirements 4.1**
     *
     * For any ScanRecord in the scan history at any point in time, its lookupStatus
     * field must be exactly one of 'loading', 'found', 'not_found', or 'error'.
     */
    it('should always have a valid lookupStatus after lookupBarcode completes', async () => {
      const validStatuses = new Set(['loading', 'found', 'not_found', 'error'])

      // Generate a random outcome: found (Part), not_found (null), or error (throw)
      const outcomeArb = fc.oneof(
        partArb.map(p => ({ type: 'found' as const, value: p })),
        fc.constant({ type: 'not_found' as const, value: null }),
        errorMessageArb.map(m => ({ type: 'error' as const, value: m })),
      )

      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          outcomeArb,
          async (barcode, outcome) => {
            mockScanBarcode.mockReset()

            if (outcome.type === 'error') {
              mockScanBarcode.mockRejectedValue(new Error(outcome.value as string))
            } else {
              mockScanBarcode.mockResolvedValue(outcome.value)
            }

            const { lookupBarcode } = useScanLookup()
            const record = makeScanRecord(barcode)
            const scanHistory: Ref<ScanRecord[]> = ref([record])

            await lookupBarcode(record, scanHistory)

            expect(validStatuses.has(record.lookupStatus)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // Feature: smart-barcode-lookup, Property 9: Re-lookup resets state and re-calls API
  describe('Property 9: Re-lookup resets state and re-calls API', () => {
    /**
     * **Validates: Requirements 5.2, 5.4**
     *
     * For any ScanRecord with lookupStatus === 'error' or 'not_found', invoking
     * re-lookup should reset lookupStatus to 'loading', clear any previous
     * errorMessage, and call InventreeService.scanBarcode with the record's barcode.
     */
    it('should reset error records and re-call scanBarcode on reLookupBarcode', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          errorMessageArb,
          async (barcode, prevError) => {
            mockScanBarcode.mockReset()
            let capturedStatus: string | undefined
            let capturedErrorMessage: string | undefined

            mockScanBarcode.mockImplementation(() => {
              capturedStatus = record.lookupStatus
              capturedErrorMessage = record.errorMessage
              return Promise.resolve(null)
            })

            const { reLookupBarcode } = useScanLookup()
            const record = makeScanRecord(barcode, {
              lookupStatus: 'error',
              errorMessage: prevError,
            })
            const scanHistory: Ref<ScanRecord[]> = ref([record])

            await reLookupBarcode(record, scanHistory)

            // At the moment scanBarcode was called, status should be 'loading'
            expect(capturedStatus).toBe('loading')
            // errorMessage should have been cleared before the call
            expect(capturedErrorMessage).toBeUndefined()
            // scanBarcode was called with the record's barcode
            expect(mockScanBarcode).toHaveBeenCalledWith(barcode)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reset not_found records and re-call scanBarcode on reLookupBarcode', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            mockScanBarcode.mockReset()
            let capturedStatus: string | undefined

            mockScanBarcode.mockImplementation(() => {
              capturedStatus = record.lookupStatus
              return Promise.resolve(null)
            })

            const { reLookupBarcode } = useScanLookup()
            const record = makeScanRecord(barcode, {
              lookupStatus: 'not_found',
            })
            const scanHistory: Ref<ScanRecord[]> = ref([record])

            await reLookupBarcode(record, scanHistory)

            expect(capturedStatus).toBe('loading')
            expect(mockScanBarcode).toHaveBeenCalledWith(barcode)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should clear previous part data on reLookupBarcode', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          partArb,
          async (barcode, prevPart) => {
            mockScanBarcode.mockReset()
            let capturedPart: Part | undefined

            mockScanBarcode.mockImplementation(() => {
              capturedPart = record.part
              return Promise.resolve(null)
            })

            const { reLookupBarcode } = useScanLookup()
            const record = makeScanRecord(barcode, {
              lookupStatus: 'not_found',
              part: prevPart,
            })
            const scanHistory: Ref<ScanRecord[]> = ref([record])

            await reLookupBarcode(record, scanHistory)

            // part should have been cleared before the API call
            expect(capturedPart).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
