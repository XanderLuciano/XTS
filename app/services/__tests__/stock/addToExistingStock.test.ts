import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { InventreeService } from '../../inventree.service'
import { quantityArb, optionalStringArb } from '../shared/test-helpers'

/**
 * Tests for addToExistingStock method
 * Covers edge cases for complete coverage
 */

describe('addToExistingStock', () => {
  it('should throw error when updated stock item cannot be retrieved', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        quantityArb,
        optionalStringArb,
        async (stockItemId, quantity, notes) => {
          const mockApi = vi.fn()
          const service = new InventreeService(mockApi)

          mockApi.mockImplementation(async (url: string, options?: any) => {
            // Handle bulk add endpoint - succeeds
            if (url === '/stock/add/' && options?.method === 'POST') {
              return { success: true }
            }

            // Handle fetch updated stock item - returns empty array (edge case)
            if (url.startsWith('/stock/?pk=')) {
              return []
            }

            throw new Error(`Unexpected API call: ${url}`)
          })

          let thrownError: Error | null = null
          try {
            await service.addToExistingStock(stockItemId, {
              quantity,
              notes: notes ?? undefined
            })
          } catch (error) {
            thrownError = error as Error
          }

          // Verify error is thrown when stock item cannot be retrieved
          expect(thrownError).toBeDefined()
          expect(thrownError!.message).toBe('Failed to retrieve updated stock item')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should successfully add to existing stock and return updated item', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        quantityArb,
        optionalStringArb,
        async (stockItemId, quantity, notes) => {
          const mockApi = vi.fn()
          const service = new InventreeService(mockApi)

          const updatedStockItem = {
            pk: stockItemId,
            part: 123,
            quantity: 100,
            location: null,
            serial: null,
            batch: null,
            notes: notes ?? ''
          }

          mockApi.mockImplementation(async (url: string, options?: any) => {
            // Handle bulk add endpoint
            if (url === '/stock/add/' && options?.method === 'POST') {
              return { success: true }
            }

            // Handle fetch updated stock item
            if (url.startsWith('/stock/?pk=')) {
              return [updatedStockItem]
            }

            throw new Error(`Unexpected API call: ${url}`)
          })

          const result = await service.addToExistingStock(stockItemId, {
            quantity,
            notes: notes ?? undefined
          })

          // Verify the updated stock item is returned
          expect(result).toEqual(updatedStockItem)
          expect(result.pk).toBe(stockItemId)
        }
      ),
      { numRuns: 100 }
    )
  })
})

it('should handle paginated response when fetching updated stock item', async () => {
  const mockApi = vi.fn()
  const service = new InventreeService(mockApi)

  const stockItemId = 456
  const updatedStockItem = {
    pk: stockItemId,
    part: 789,
    quantity: 200,
    location: null,
    serial: null,
    batch: null,
    notes: 'Updated'
  }

  mockApi.mockImplementation(async (url: string, options?: any) => {
    // Handle bulk add endpoint
    if (url === '/stock/add/' && options?.method === 'POST') {
      return { success: true }
    }

    // Handle fetch updated stock item - return paginated response
    if (url.startsWith('/stock/?pk=')) {
      return {
        count: 1,
        results: [updatedStockItem],
        next: null,
        previous: null
      }
    }

    throw new Error(`Unexpected API call: ${url}`)
  })

  const result = await service.addToExistingStock(stockItemId, {
    quantity: 50,
    notes: 'Test'
  })

  // Verify the updated stock item is extracted from paginated response
  expect(result).toEqual(updatedStockItem)
})

it('should return empty array fallback when response.results is null', async () => {
  const mockApi = vi.fn()
  const service = new InventreeService(mockApi)

  const stockItemId = 789

  mockApi.mockImplementation(async (url: string, options?: any) => {
    // Handle bulk add endpoint
    if (url === '/stock/add/' && options?.method === 'POST') {
      return { success: true }
    }

    // Handle fetch updated stock item - return object with null results
    if (url.startsWith('/stock/?pk=')) {
      return { results: null }
    }

    throw new Error(`Unexpected API call: ${url}`)
  })

  let thrownError: Error | null = null
  try {
    await service.addToExistingStock(stockItemId, {
      quantity: 50,
      notes: 'Test'
    })
  } catch (error) {
    thrownError = error as Error
  }

  // Verify error is thrown when results is null (empty array fallback triggers error)
  expect(thrownError).toBeDefined()
  expect(thrownError!.message).toBe('Failed to retrieve updated stock item')
})
