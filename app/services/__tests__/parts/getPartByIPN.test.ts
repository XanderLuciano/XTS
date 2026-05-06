import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { stringArb, partArb, arrayResponseArb } from '../shared/test-helpers'
import { createMockService, mockSuccessResponse, mockErrorResponse, expectErrorPropagation } from '../shared/test-utilities'

/**
 * Tests for getPartByIPN method
 */

describe('getPartByIPN', () => {
  it('should pass IPN as query parameter', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringArb,
        arrayResponseArb(partArb),
        async (ipn, mockResponse) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, mockResponse)
          
          await service.getPartByIPN(ipn)
          
          expect(mockApi).toHaveBeenCalledWith('/part/', {
            method: 'GET',
            query: { IPN: ipn }
          })
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
        async (ipn, errorMessage) => {
          const { mockApi, service } = createMockService()
          const expectedError = mockErrorResponse(mockApi, errorMessage)
          
          await expectErrorPropagation(
            () => service.getPartByIPN(ipn),
            expectedError
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
