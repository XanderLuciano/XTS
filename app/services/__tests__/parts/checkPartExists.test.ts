import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { stringArb, partArb } from '../shared/test-helpers'
import { createMockService, mockSuccessResponse, mockErrorResponse, expectErrorPropagation } from '../shared/test-utilities'

/**
 * Tests for checkPartExists method
 */

describe('checkPartExists', () => {
  it('should return exists:true with field:IPN for any non-empty parts array', async () => {
    const nonEmptyPartsArb = fc.array(partArb, { minLength: 1, maxLength: 10 })
    
    await fc.assert(
      fc.asyncProperty(
        stringArb,
        stringArb,
        nonEmptyPartsArb,
        async (ipn, name, mockParts) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, mockParts)
          
          const result = await service.checkPartExists(ipn, name)
          
          expect(result).toEqual({ exists: true, field: 'IPN' })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return exists:false when no parts found', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringArb,
        stringArb,
        async (ipn, name) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, [])
          
          const result = await service.checkPartExists(ipn, name)
          
          expect(result).toEqual({ exists: false })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should propagate API errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringArb,
        stringArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        async (ipn, name, errorMessage) => {
          const { mockApi, service } = createMockService()
          const expectedError = mockErrorResponse(mockApi, errorMessage)
          
          await expectErrorPropagation(
            () => service.checkPartExists(ipn, name),
            expectedError
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
