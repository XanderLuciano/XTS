import { describe, it, expect, vi } from 'vitest'
import { InventreeService } from '../../inventree.service'
import type { StockItem, AddStockDto } from '~/types/inventree'

/**
 * Bug Condition Exploration Test
 *
 * Validates: Requirements 1.1, 1.2, 2.1, 2.3
 *
 * The InvenTree POST /stock/ endpoint returns StockItem[] (an array),
 * but addStock() returns the raw response directly. When the caller
 * accesses .pk on the array, it gets undefined.
 *
 * This test mocks POST /stock/ to return an array (real API behavior)
 * and asserts that result.pk is a positive integer.
 *
 * EXPECTED: This test FAILS on unfixed code — confirming the bug exists.
 */
describe('addStock - Bug Condition Exploration', () => {
  it('should return a StockItem with a valid pk when creating new stock (no existing stock)', async () => {
    /**
     * **Validates: Requirements 1.1, 1.2, 2.1, 2.3**
     */
    const partId = 7
    const quantity = 3

    const mockApi = vi.fn()
    const service = new InventreeService(mockApi)

    const addStockData: AddStockDto = {
      part: partId,
      quantity,
      location: null,
      notes: ''
    }

    mockApi.mockImplementation(async (url: string, options?: any) => {
      // GET /stock/?part=X&in_stock=true → no existing stock (bug condition)
      if (url.startsWith('/stock/?part=') && url.includes('in_stock=true')) {
        return []
      }

      // POST /stock/ → returns an ARRAY as the real InvenTree API does
      if (url === '/stock/' && options?.method === 'POST') {
        const created: StockItem[] = [
          {
            pk: 42,
            part: partId,
            quantity,
            location: null,
            serial: null,
            batch: null,
            barcode_hash: '',
            notes: ''
          }
        ]
        return created
      }

      throw new Error(`Unexpected API call: ${url}`)
    })

    const result = await service.addStock(addStockData)

    // These assertions will FAIL on unfixed code because result is the raw array,
    // and accessing .pk on an array yields undefined
    expect(typeof result.pk).toBe('number')
    expect(result.pk).toBeGreaterThan(0)
    expect(Number.isInteger(result.pk)).toBe(true)
  })
})
