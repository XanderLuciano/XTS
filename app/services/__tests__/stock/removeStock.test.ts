import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { optionalStringArb } from '../shared/test-helpers'
import { createMockService, mockSuccessResponse, mockErrorResponse, expectErrorPropagation, getRequestBody } from '../shared/test-utilities'

/**
 * Tests for removeStock method
 */

describe('removeStock', () => {
  it('should send POST request to /stock/remove/ endpoint', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 1000 }),
        optionalStringArb,
        async (stockItemId, quantity, notes) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, undefined)

          await service.removeStock(stockItemId, { quantity, notes: notes ?? undefined })

          expect(mockApi).toHaveBeenCalledWith('/stock/remove/', expect.objectContaining({
            method: 'POST',
            body: expect.any(Object)
          }))
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should send items array with positive quantity in request body', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 1000 }),
        optionalStringArb,
        async (stockItemId, quantity, notes) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, undefined)

          await service.removeStock(stockItemId, { quantity, notes: notes ?? undefined })

          const requestBody = getRequestBody(mockApi)
          expect(requestBody.items).toBeDefined()
          expect(requestBody.items).toHaveLength(1)
          expect(requestBody.items[0].pk).toBe(stockItemId)
          expect(requestBody.items[0].quantity).toBe(quantity)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should include notes in request body when provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (stockItemId, quantity, notes) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, undefined)

          await service.removeStock(stockItemId, { quantity, notes })

          const requestBody = getRequestBody(mockApi)
          expect(requestBody.notes).toBe(notes)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should propagate API errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 1000 }),
        optionalStringArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        async (stockItemId, quantity, notes, errorMessage) => {
          const { mockApi, service } = createMockService()
          const expectedError = mockErrorResponse(mockApi, errorMessage)

          await expectErrorPropagation(
            () => service.removeStock(stockItemId, { quantity, notes: notes ?? undefined }),
            expectedError
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
