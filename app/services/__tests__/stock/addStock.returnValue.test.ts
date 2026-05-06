import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { InventreeService } from '../../inventree.service'
import type { StockItem, AddStockDto } from '~/types/inventree'
import { partIdArb, quantityArb, notesArb, stockItemArb, existingStockArb } from '../shared/test-helpers'

/**
 * Property 4: Return Value Consistency
 * Tests that addStock returns the correct API response
 */

describe('addStock - Return Value Consistency', () => {
  it('should return the exact API response for add-to-existing operations', async () => {
    /**
     * **Validates: Requirements 2.3, 3.3**
     */
    const nonEmptyExistingStockArb = fc.array(stockItemArb, { minLength: 1, maxLength: 5 })

    await fc.assert(
      fc.asyncProperty(
        partIdArb,
        quantityArb,
        notesArb,
        nonEmptyExistingStockArb,
        stockItemArb,
        async (partId, quantity, notes, existingStock, apiResponse) => {
          const mockApi = vi.fn()
          const service = new InventreeService(mockApi)

          const addStockData: AddStockDto = {
            part: partId,
            quantity,
            notes: notes ?? undefined
          }

          const expectedApiResponse: StockItem = {
            ...apiResponse,
            part: partId
          }

          mockApi.mockImplementation(async (url: string, options?: any) => {
            if (url.startsWith('/stock/?part=') && url.includes('in_stock=true')) {
              return existingStock
            }
            
            if (url === '/stock/add/' && options?.method === 'POST') {
              return { success: true }
            }
            
            if (url.startsWith('/stock/?pk=')) {
              return [expectedApiResponse]
            }
            
            throw new Error(`Unexpected API call: ${url}`)
          })

          const result = await service.addStock(addStockData)

          expect(result.pk).toBe(expectedApiResponse.pk)
          expect(result.part).toBe(expectedApiResponse.part)
          expect(result.quantity).toBe(expectedApiResponse.quantity)
          expect(result.location).toBe(expectedApiResponse.location)
          expect(result.serial).toBe(expectedApiResponse.serial)
          expect(result.batch).toBe(expectedApiResponse.batch)
          expect(result.notes).toBe(expectedApiResponse.notes)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return the exact API response for create-new operations', async () => {
    /**
     * **Validates: Requirements 2.3, 3.3**
     */
    await fc.assert(
      fc.asyncProperty(
        partIdArb,
        quantityArb,
        notesArb,
        stockItemArb,
        async (partId, quantity, notes, apiResponse) => {
          const mockApi = vi.fn()
          const service = new InventreeService(mockApi)

          const addStockData: AddStockDto = {
            part: partId,
            quantity,
            notes: notes ?? undefined
          }

          const expectedApiResponse: StockItem = {
            ...apiResponse,
            part: partId
          }

          mockApi.mockImplementation(async (url: string, options?: any) => {
            if (url.startsWith('/stock/?part=') && url.includes('in_stock=true')) {
              return []
            }
            
            if (url === '/stock/' && options?.method === 'POST') {
              return expectedApiResponse
            }
            
            throw new Error(`Unexpected API call: ${url}`)
          })

          const result = await service.addStock(addStockData)

          expect(result).toBe(expectedApiResponse)
          expect(result.pk).toBe(expectedApiResponse.pk)
          expect(result.part).toBe(expectedApiResponse.part)
          expect(result.quantity).toBe(expectedApiResponse.quantity)
          expect(result.location).toBe(expectedApiResponse.location)
          expect(result.serial).toBe(expectedApiResponse.serial)
          expect(result.batch).toBe(expectedApiResponse.batch)
          expect(result.notes).toBe(expectedApiResponse.notes)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should not transform or modify the API response in any way', async () => {
    /**
     * **Validates: Requirements 2.3, 3.3**
     */
    await fc.assert(
      fc.asyncProperty(
        partIdArb,
        quantityArb,
        notesArb,
        existingStockArb,
        stockItemArb,
        async (partId, quantity, notes, existingStock, apiResponse) => {
          const mockApi = vi.fn()
          const service = new InventreeService(mockApi)

          const addStockData: AddStockDto = {
            part: partId,
            quantity,
            notes: notes ?? undefined
          }

          const expectedApiResponse: StockItem = {
            ...apiResponse,
            part: partId
          }

          mockApi.mockImplementation(async (url: string, options?: any) => {
            if (url.startsWith('/stock/?part=') && url.includes('in_stock=true')) {
              return existingStock
            }
            
            if (url === '/stock/add/' && options?.method === 'POST') {
              return { success: true }
            }
            
            if (url.startsWith('/stock/?pk=')) {
              return [expectedApiResponse]
            }
            
            if (url === '/stock/' && options?.method === 'POST') {
              return expectedApiResponse
            }
            
            throw new Error(`Unexpected API call: ${url}`)
          })

          const result = await service.addStock(addStockData)

          expect(result).toEqual(expectedApiResponse)
        }
      ),
      { numRuns: 100 }
    )
  })
})
