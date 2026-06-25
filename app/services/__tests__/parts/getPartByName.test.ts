import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { stringArb, partArb, arrayResponseArb } from '../shared/test-helpers'
import { createMockService, mockSuccessResponse, mockErrorResponse, expectErrorPropagation } from '../shared/test-utilities'

/**
 * Tests for getPartByName method
 */

describe('getPartByName', () => {
  it('should pass name as query parameter', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringArb,
        arrayResponseArb(partArb),
        async (name, mockResponse) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, mockResponse)

          await service.getPartByName(name)

          expect(mockApi).toHaveBeenCalledWith('/part/', {
            method: 'GET',
            query: { name }
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
        async (name, errorMessage) => {
          const { mockApi, service } = createMockService()
          const expectedError = mockErrorResponse(mockApi, errorMessage)

          await expectErrorPropagation(
            () => service.getPartByName(name),
            expectedError
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
