import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { InventreeService } from '../../inventree.service'
import type { AddStockDto } from '~/types/inventree'
import { partIdArb, quantityArb, notesArb, existingStockArb } from '../shared/test-helpers'
import { createAddStockMockApi } from './addStock-helpers'

/**
 * Property 1: Stock Consolidation Routing
 * Tests that addStock correctly routes to either add-to-existing or create-new
 */

describe('addStock - Routing Logic', () => {
  it('should always query existing stock first and route correctly based on results', async () => {
    /**
     * **Validates: Requirements 1.1, 2.1, 3.1**
     *
     * For any addStock call with a valid part ID and quantity, the service SHALL:
     * 1. First query existing stock items (getStockItems is always called)
     * 2. If existing stock found → addToExistingStock is called with first item's pk
     * 3. If no existing stock → POST /stock/ is called to create new item
     */
    await fc.assert(
      fc.asyncProperty(
        partIdArb,
        quantityArb,
        notesArb,
        existingStockArb,
        async (partId, quantity, notes, existingStock) => {
          const mockApi = createAddStockMockApi(existingStock, partId, quantity, notes ?? '')
          const service = new InventreeService(mockApi)

          const addStockData: AddStockDto = {
            part: partId,
            quantity,
            notes: notes ?? undefined
          }

          const result = await service.addStock(addStockData)

          // Verify: getStockItems is ALWAYS called first
          const getStockItemsCall = mockApi.mock.calls.find(
            call => call[0].startsWith('/stock/?part=') && call[0].includes('in_stock=true')
          )
          expect(getStockItemsCall).toBeDefined()
          expect(getStockItemsCall![0]).toContain(`part=${partId}`)

          if (existingStock.length > 0) {
            // Verify: addToExistingStock bulk endpoint is called
            const addToExistingCall = mockApi.mock.calls.find(
              call => call[0] === '/stock/add/' && call[1]?.method === 'POST'
            )
            expect(addToExistingCall).toBeDefined()
            expect(addToExistingCall![1].body).toEqual({
              items: [{ pk: existingStock[0]!.pk, quantity }],
              notes: notes ?? ''
            })

            // Verify: Fetch updated stock item was called
            const fetchUpdatedCall = mockApi.mock.calls.find(
              call => call[0].startsWith('/stock/?pk=')
            )
            expect(fetchUpdatedCall).toBeDefined()

            // Verify: POST /stock/ is NOT called
            const createNewCall = mockApi.mock.calls.find(
              call => call[0] === '/stock/' && call[1]?.method === 'POST'
            )
            expect(createNewCall).toBeUndefined()
          } else {
            // Verify: POST /stock/ is called to create new item
            const createNewCall = mockApi.mock.calls.find(
              call => call[0] === '/stock/' && call[1]?.method === 'POST'
            )
            expect(createNewCall).toBeDefined()
            expect(createNewCall![1].body).toEqual(addStockData)

            // Verify: addToExistingStock bulk endpoint is NOT called
            const addToExistingCall = mockApi.mock.calls.find(
              call => call[0] === '/stock/add/'
            )
            expect(addToExistingCall).toBeUndefined()
          }

          // Verify: A StockItem is returned
          expect(result).toBeDefined()
          expect(result.pk).toBeDefined()
          expect(result.part).toBe(partId)
        }
      ),
      { numRuns: 100 }
    )
  })
})
