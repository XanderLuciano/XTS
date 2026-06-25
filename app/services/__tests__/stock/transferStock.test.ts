import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  createMockService,
  mockSuccessResponse,
  mockErrorResponse,
  getRequestBody,
  getRequestUrl,
  getRequestOptions
} from '../shared/test-utilities'

/**
 * Tests for transferStock.
 *
 * InvenTree's /stock/transfer/ endpoint requires each item to include a
 * non-zero `quantity` and a non-null destination `location`. Moving an item to
 * "no location" (null) is done via a PATCH of the location field instead.
 *
 * Regression: previously the transfer body omitted `quantity`, which produced a
 * 400 error from InvenTree.
 */

describe('transferStock', () => {
  it('POSTs to /stock/transfer/ with pk, quantity, location and notes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 1000 }),
        async (stockItemPk, location, quantity) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, {})

          await service.transferStock(stockItemPk, location, quantity, 'note')

          expect(getRequestUrl(mockApi)).toBe('/stock/transfer/')
          const options = getRequestOptions(mockApi)
          expect(options.method).toBe('POST')
          const body = getRequestBody(mockApi)
          expect(body).toEqual({
            items: [{ pk: stockItemPk, quantity }],
            location,
            notes: 'note'
          })
        }
      ),
      { numRuns: 50 }
    )
  })

  it('always includes a quantity for the transferred item (regression for 400)', async () => {
    const { mockApi, service } = createMockService()
    mockSuccessResponse(mockApi, {})

    await service.transferStock(54, 9, 3)

    const body = getRequestBody(mockApi)
    expect(body.items[0]).toHaveProperty('quantity', 3)
  })

  it('defaults notes to an empty string when omitted', async () => {
    const { mockApi, service } = createMockService()
    mockSuccessResponse(mockApi, {})

    await service.transferStock(1, 2, 5)

    expect(getRequestBody(mockApi).notes).toBe('')
  })

  it('PATCHes the stock item location when destination is null (no transfer endpoint)', async () => {
    const { mockApi, service } = createMockService()
    mockSuccessResponse(mockApi, {})

    await service.transferStock(54, null, 3)

    expect(getRequestUrl(mockApi)).toBe('/stock/54/')
    const options = getRequestOptions(mockApi)
    expect(options.method).toBe('PATCH')
    expect(options.body).toEqual({ location: null })
  })

  it('propagates API errors', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (msg) => {
        const { mockApi, service } = createMockService()
        mockErrorResponse(mockApi, msg)
        // transferStock wraps the error, so assert the wrapped message contains the original
        await expect(service.transferStock(1, 2, 5)).rejects.toThrow(msg)
      }),
      { numRuns: 30 }
    )
  })
})
