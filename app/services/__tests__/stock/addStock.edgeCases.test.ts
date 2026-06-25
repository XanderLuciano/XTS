import { describe, it, expect, vi } from 'vitest'
import { InventreeService } from '../../inventree.service'
import type { AddStockDto } from '~/types/inventree'

/**
 * Edge case tests for addStock method
 * Covers defensive programming checks
 */

describe('addStock - Edge Cases', () => {
  it('should throw error when firstItem is unexpectedly undefined', async () => {
    const mockApi = vi.fn()
    const service = new InventreeService(mockApi)

    const addStockData: AddStockDto = {
      part: 123,
      quantity: 10,
      notes: 'Test'
    }

    // Mock getStockItems to return an array with undefined first element
    // This is a defensive check that should never happen in practice
    mockApi.mockImplementation(async (url: string, _options?: any) => {
      if (url.startsWith('/stock/?part=') && url.includes('in_stock=true')) {
        // Return array with length > 0 but first element is undefined
        // This simulates a corrupted/malformed API response
        const corruptedArray: any[] = []
        corruptedArray.length = 1
        return corruptedArray
      }

      throw new Error(`Unexpected API call: ${url}`)
    })

    let thrownError: Error | null = null
    try {
      await service.addStock(addStockData)
    } catch (error) {
      thrownError = error as Error
    }

    // Verify the defensive check catches this edge case
    expect(thrownError).toBeDefined()
    expect(thrownError!.message).toBe('Unexpected error: stock item is undefined')
  })
})
