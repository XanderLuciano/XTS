import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { InventreeService } from '../../inventree.service'
import type { StockItem } from '~/types/inventree'
import { partIdArb, quantityArb, stockItemArb } from '../shared/test-helpers'

/**
 * Preservation Property Tests
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * These tests verify that the existing stock path in addStock() works correctly
 * BEFORE the fix is applied. When existing stock items exist for a part,
 * addStock() should delegate to addToExistingStock() (POST /stock/add/),
 * NOT create new stock (POST /stock/), and return a valid StockItem with
 * a pk matching the first existing item.
 *
 * EXPECTED: These tests PASS on unfixed code — the existing stock path is not buggy.
 */
describe('addStock - Preservation Property: Existing stock path unchanged', () => {
  it('should delegate to addToExistingStock and return valid StockItem for all existing stock inputs', () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
     *
     * Property: For all (partId, quantity, existingStock) where existingStock.length > 0:
     * - addStock() calls POST /stock/add/ (addToExistingStock delegation)
     * - addStock() does NOT call POST /stock/ (create new)
     * - result.pk is a positive integer matching the first existing stock item's pk
     */
    const existingStockArb = fc.array(stockItemArb, { minLength: 1, maxLength: 5 })

    fc.assert(
      fc.asyncProperty(
        partIdArb,
        quantityArb,
        existingStockArb,
        async (partId, quantity, existingStock) => {
          const mockApi = vi.fn()
          const service = new InventreeService(mockApi)

          let postStockAddCalled = false
          let postStockCreateCalled = false

          // Align existing stock items to the partId under test
          const alignedStock: StockItem[] = existingStock.map(item => ({
            ...item,
            part: partId
          }))

          const firstItem = alignedStock[0]!

          mockApi.mockImplementation(async (url: string, options?: any) => {
            // GET /stock/?part=X&in_stock=true → return existing stock
            if (url.startsWith('/stock/?part=') && url.includes('in_stock=true')) {
              return alignedStock
            }

            // POST /stock/add/ → addToExistingStock bulk endpoint
            if (url === '/stock/add/' && options?.method === 'POST') {
              postStockAddCalled = true
              return { success: true }
            }

            // GET /stock/?pk=X → fetch updated stock item after add
            if (url.startsWith('/stock/?pk=')) {
              const updatedItem: StockItem = {
                pk: firstItem.pk,
                part: partId,
                quantity: firstItem.quantity + quantity,
                location: firstItem.location,
                serial: firstItem.serial,
                batch: firstItem.batch,
                barcode_hash: firstItem.barcode_hash,
                notes: firstItem.notes
              }
              return [updatedItem]
            }

            // POST /stock/ → create new stock (should NOT be called)
            if (url === '/stock/' && options?.method === 'POST') {
              postStockCreateCalled = true
              return [{ pk: 999, part: partId, quantity, location: null, serial: null, batch: null, barcode_hash: '', notes: '' }]
            }

            throw new Error(`Unexpected API call: ${url}`)
          })

          const result = await service.addStock({
            part: partId,
            quantity,
            location: null,
            notes: ''
          })

          // Assert delegation to addToExistingStock (POST /stock/add/)
          expect(postStockAddCalled).toBe(true)

          // Assert POST /stock/ (create new) was NOT called
          expect(postStockCreateCalled).toBe(false)

          // Assert result has a valid pk that is a positive integer
          expect(typeof result.pk).toBe('number')
          expect(result.pk).toBeGreaterThan(0)
          expect(Number.isInteger(result.pk)).toBe(true)

          // Assert result pk matches the first existing stock item's pk
          expect(result.pk).toBe(firstItem.pk)
        }
      ),
      { numRuns: 100 }
    )
  })
})
