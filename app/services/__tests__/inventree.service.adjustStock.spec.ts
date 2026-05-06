import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { createMockService, mockSuccessResponse, getRequestUrl, getRequestBody } from './shared/test-utilities'

/**
 * Property-based tests for InventreeService.adjustStock
 */
describe('adjustStock — property tests', () => {
  /**
   * Property 6: adjustStock positive delta calls add
   * For any pair (currentQuantity, newQuantity) where newQuantity > currentQuantity,
   * adjustStock SHALL invoke the stock add endpoint with quantity = (newQuantity - currentQuantity).
   * **Validates: Requirements 7.2, 9.2**
   */
  it('Property 6: positive delta calls /stock/add/ with correct quantity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100000 }),
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 1, max: 10000 }),
        async (currentQuantity, positiveOffset, stockItemPk) => {
          const newQuantity = currentQuantity + positiveOffset
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, undefined)

          await service.adjustStock({ stockItemPk, currentQuantity, newQuantity })

          expect(mockApi).toHaveBeenCalledOnce()
          expect(getRequestUrl(mockApi)).toBe('/stock/add/')
          const body = getRequestBody(mockApi)
          expect(body.items).toHaveLength(1)
          expect(body.items[0].pk).toBe(stockItemPk)
          expect(body.items[0].quantity).toBe(positiveOffset)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 7: adjustStock negative delta calls remove
   * For any pair (currentQuantity, newQuantity) where newQuantity < currentQuantity,
   * adjustStock SHALL invoke the stock remove endpoint with quantity = (currentQuantity - newQuantity).
   * **Validates: Requirements 7.3, 9.3**
   */
  it('Property 7: negative delta calls /stock/remove/ with correct quantity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100000 }),
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 1, max: 10000 }),
        async (newQuantity, positiveOffset, stockItemPk) => {
          const currentQuantity = newQuantity + positiveOffset
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, undefined)

          await service.adjustStock({ stockItemPk, currentQuantity, newQuantity })

          expect(mockApi).toHaveBeenCalledOnce()
          expect(getRequestUrl(mockApi)).toBe('/stock/remove/')
          const body = getRequestBody(mockApi)
          expect(body.items).toHaveLength(1)
          expect(body.items[0].pk).toBe(stockItemPk)
          expect(body.items[0].quantity).toBe(positiveOffset)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 8: adjustStock zero delta is no-op
   * For any pair where newQuantity === currentQuantity,
   * adjustStock SHALL NOT invoke any API endpoint.
   * **Validates: Requirements 7.4, 9.4**
   */
  it('Property 8: zero delta makes no API call', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100000 }),
        fc.integer({ min: 1, max: 10000 }),
        async (quantity, stockItemPk) => {
          const { mockApi, service } = createMockService()

          await service.adjustStock({
            stockItemPk,
            currentQuantity: quantity,
            newQuantity: quantity
          })

          expect(mockApi).not.toHaveBeenCalled()
        }
      ),
      { numRuns: 100 }
    )
  })
})


/**
 * Unit tests for InventreeService.adjustStock edge cases
 * **Validates: Requirements 9.5**
 */
describe('adjustStock — unit tests', () => {
  it('propagates API errors with a descriptive message', async () => {
    const { mockApi, service } = createMockService()
    mockApi.mockRejectedValue(new Error('Network timeout'))

    await expect(
      service.adjustStock({ stockItemPk: 42, currentQuantity: 5, newQuantity: 10 })
    ).rejects.toThrow('Failed to add stock for item 42: Network timeout')

    // Also verify remove path wraps errors
    mockApi.mockRejectedValue(new Error('Server error'))

    await expect(
      service.adjustStock({ stockItemPk: 7, currentQuantity: 10, newQuantity: 3 })
    ).rejects.toThrow('Failed to remove stock for item 7: Server error')
  })

  it('handles very large quantity values correctly', async () => {
    const { mockApi, service } = createMockService()
    mockSuccessResponse(mockApi, undefined)

    await service.adjustStock({
      stockItemPk: 1,
      currentQuantity: 0,
      newQuantity: 999999999
    })

    expect(mockApi).toHaveBeenCalledOnce()
    expect(getRequestUrl(mockApi)).toBe('/stock/add/')
    expect(getRequestBody(mockApi).items[0].quantity).toBe(999999999)

    mockApi.mockClear()
    mockSuccessResponse(mockApi, undefined)

    await service.adjustStock({
      stockItemPk: 1,
      currentQuantity: 999999999,
      newQuantity: 0
    })

    expect(mockApi).toHaveBeenCalledOnce()
    expect(getRequestUrl(mockApi)).toBe('/stock/remove/')
    expect(getRequestBody(mockApi).items[0].quantity).toBe(999999999)
  })

  it('zero-to-zero is a no-op (no API call)', async () => {
    const { mockApi, service } = createMockService()

    await service.adjustStock({
      stockItemPk: 1,
      currentQuantity: 0,
      newQuantity: 0
    })

    expect(mockApi).not.toHaveBeenCalled()
  })
})
