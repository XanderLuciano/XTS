import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { stringArb, partArb, arrayResponseArb } from '../shared/test-helpers'
import { createMockService, mockSuccessResponse, mockErrorResponse, expectErrorPropagation } from '../shared/test-utilities'

/**
 * Tests for searchParts method
 */

describe('searchParts', () => {
  it('should URL-encode query parameters', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringArb,
        arrayResponseArb(partArb),
        async (query, mockResponse) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, mockResponse)
          
          await service.searchParts(query)
          
          expect(mockApi).toHaveBeenCalledWith(`/part/?search=${encodeURIComponent(query)}`)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should propagate API errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        async (query, errorMessage) => {
          const { mockApi, service } = createMockService()
          const expectedError = mockErrorResponse(mockApi, errorMessage)
          
          await expectErrorPropagation(
            () => service.searchParts(query),
            expectedError
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})