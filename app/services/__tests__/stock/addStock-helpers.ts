import { vi } from 'vitest'
import type { StockItem } from '~/types/inventree'

/**
 * Helper functions for addStock tests
 */

export interface MockApiSetup {
  mockApi: ReturnType<typeof vi.fn>
  existingStock: StockItem[]
  partId: number
  quantity: number
  notes: string
}

/**
 * Creates a mock API that simulates the addStock flow
 */
export function createAddStockMockApi(
  existingStock: StockItem[],
  partId: number,
  quantity: number,
  notes: string
) {
  const mockApi = vi.fn()

  mockApi.mockImplementation(async (url: string, options?: any) => {
    // Handle getStockItems call
    if (url.startsWith('/stock/?part=') && url.includes('in_stock=true')) {
      return existingStock
    }

    // Handle addToExistingStock bulk endpoint call
    if (url === '/stock/add/' && options?.method === 'POST') {
      return { success: true }
    }

    // Handle fetch updated stock item after add
    if (url.startsWith('/stock/?pk=')) {
      const updatedItem: StockItem = {
        pk: existingStock[0]?.pk ?? 1,
        part: partId,
        quantity: (existingStock[0]?.quantity ?? 0) + quantity,
        location: null,
        serial: null,
        batch: null,
        barcode_hash: '',
        notes: notes ?? ''
      }
      return [updatedItem]
    }

    // Handle create new stock item call
    if (url === '/stock/' && options?.method === 'POST') {
      const newItem: StockItem = {
        pk: 999,
        part: partId,
        quantity,
        location: null,
        serial: null,
        batch: null,
        barcode_hash: '',
        notes: notes ?? ''
      }
      return newItem
    }

    throw new Error(`Unexpected API call: ${url}`)
  })

  return mockApi
}

/**
 * Creates a mock API that throws an error on getStockItems
 */
export function createGetStockItemsErrorMockApi(errorMessage: string) {
  const mockApi = vi.fn()

  mockApi.mockImplementation(async (url: string, options?: any) => {
    if (url.startsWith('/stock/?part=') && url.includes('in_stock=true')) {
      throw new Error(errorMessage)
    }

    if (url === '/stock/add/' && options?.method === 'POST') {
      throw new Error('addToExistingStock should not be called when getStockItems fails')
    }

    if (url === '/stock/' && options?.method === 'POST') {
      throw new Error('POST /stock/ should not be called when getStockItems fails')
    }

    throw new Error(`Unexpected API call: ${url}`)
  })

  return mockApi
}

/**
 * Creates a mock API that throws an error on addToExistingStock
 */
export function createAddToExistingErrorMockApi(
  existingStock: StockItem[],
  errorMessage: string
) {
  const mockApi = vi.fn()

  mockApi.mockImplementation(async (url: string, options?: any) => {
    if (url.startsWith('/stock/?part=') && url.includes('in_stock=true')) {
      return existingStock
    }

    if (url === '/stock/add/' && options?.method === 'POST') {
      throw new Error(errorMessage)
    }

    if (url === '/stock/' && options?.method === 'POST') {
      throw new Error('POST /stock/ should not be called when addToExistingStock fails')
    }

    throw new Error(`Unexpected API call: ${url}`)
  })

  return mockApi
}
