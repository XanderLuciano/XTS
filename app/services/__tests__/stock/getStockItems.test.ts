import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { partIdArb, stockItemArb, arrayResponseArb } from '../shared/test-helpers'
import { createMockService, mockSuccessResponse, mockErrorResponse, expectErrorPropagation } from '../shared/test-utilities'

/**
 * Tests for getStockItems method
 */

describe('getStockItems', () => {
  it('should query with correct parameters', async () => {
    await fc.assert(
      fc.asyncProperty(
        partIdArb,
        arrayResponseArb(stockItemArb),
        async (partId, mockResponse) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, mockResponse)

          await service.getStockItems(partId)

          expect(mockApi).toHaveBeenCalledWith(`/stock/?part=${partId}&in_stock=true`)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should propagate API errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        partIdArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        async (partId, errorMessage) => {
          const { mockApi, service } = createMockService()
          const expectedError = mockErrorResponse(mockApi, errorMessage)

          await expectErrorPropagation(
            () => service.getStockItems(partId),
            expectedError
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return empty array when response has no results property', async () => {
    const { mockApi, service } = createMockService()

    // Mock response that is an object but has no results property
    mockApi.mockResolvedValue({ count: 0, data: [] })

    const result = await service.getStockItems(123)

    expect(result).toEqual([])
  })

  it('should return empty array when response.results is null', async () => {
    const { mockApi, service } = createMockService()

    // Mock response with results: null
    mockApi.mockResolvedValue({ results: null })

    const result = await service.getStockItems(123)

    expect(result).toEqual([])
  })
})
