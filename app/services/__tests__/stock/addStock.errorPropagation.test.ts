import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { InventreeService } from '../../inventree.service'
import type { AddStockDto } from '~/types/inventree'
import { partIdArb, quantityArb, notesArb, stockItemArb } from '../shared/test-helpers'
import { createGetStockItemsErrorMockApi, createAddToExistingErrorMockApi } from './addStock-helpers'

/**
 * Property 2 & 3: Error Propagation Tests
 * Tests that addStock correctly propagates errors from underlying operations
 */

describe('addStock - Error Propagation', () => {
  describe('Property 2: Query Error Propagation', () => {
    it('should propagate getStockItems errors without calling any other endpoints', async () => {
      /**
       * **Validates: Requirements 1.3**
       */
      await fc.assert(
        fc.asyncProperty(
          partIdArb,
          quantityArb,
          notesArb,
          fc.string({ minLength: 1, maxLength: 100 }),
          async (partId, quantity, notes, errorMessage) => {
            const mockApi = createGetStockItemsErrorMockApi(errorMessage)
            const service = new InventreeService(mockApi)

            const addStockData: AddStockDto = {
              part: partId,
              quantity,
              notes: notes ?? undefined
            }

            let thrownError: Error | null = null
            try {
              await service.addStock(addStockData)
            } catch (error) {
              thrownError = error as Error
            }

            // Verify: Error is propagated
            expect(thrownError).toBeDefined()
            expect(thrownError!.message).toBe(errorMessage)

            // Verify: getStockItems was called
            const getStockItemsCall = mockApi.mock.calls.find(
              call => call[0].startsWith('/stock/?part=') && call[0].includes('in_stock=true')
            )
            expect(getStockItemsCall).toBeDefined()

            // Verify: No other endpoints were called
            const addToExistingCall = mockApi.mock.calls.find(
              call => call[0] === '/stock/add/'
            )
            expect(addToExistingCall).toBeUndefined()

            const createNewCall = mockApi.mock.calls.find(
              call => call[0] === '/stock/' && call[1]?.method === 'POST'
            )
            expect(createNewCall).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 3: Add-to-Existing Error Propagation', () => {
    it('should propagate addToExistingStock errors without falling back to creating new stock', async () => {
      /**
       * **Validates: Requirements 2.4**
       */
      const nonEmptyExistingStockArb = fc.array(stockItemArb, { minLength: 1, maxLength: 5 })

      await fc.assert(
        fc.asyncProperty(
          partIdArb,
          quantityArb,
          notesArb,
          nonEmptyExistingStockArb,
          fc.string({ minLength: 1, maxLength: 100 }),
          async (partId, quantity, notes, existingStock, errorMessage) => {
            const mockApi = createAddToExistingErrorMockApi(existingStock, errorMessage)
            const service = new InventreeService(mockApi)

            const addStockData: AddStockDto = {
              part: partId,
              quantity,
              notes: notes ?? undefined
            }

            let thrownError: Error | null = null
            try {
              await service.addStock(addStockData)
            } catch (error) {
              thrownError = error as Error
            }

            // Verify: Error is propagated
            expect(thrownError).toBeDefined()
            expect(thrownError!.message).toBe(errorMessage)

            // Verify: getStockItems was called
            const getStockItemsCall = mockApi.mock.calls.find(
              call => call[0].startsWith('/stock/?part=') && call[0].includes('in_stock=true')
            )
            expect(getStockItemsCall).toBeDefined()

            // Verify: addToExistingStock bulk endpoint was called
            const addToExistingCall = mockApi.mock.calls.find(
              call => call[0] === '/stock/add/' && call[1]?.method === 'POST'
            )
            expect(addToExistingCall).toBeDefined()
            expect(addToExistingCall![1].body.items[0].pk).toBe(existingStock[0]!.pk)

            // Verify: No POST /stock/ call was made (no fallback to creating new)
            const createNewCall = mockApi.mock.calls.find(
              call => call[0] === '/stock/' && call[1]?.method === 'POST'
            )
            expect(createNewCall).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
