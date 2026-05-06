import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { partArb, createPartDtoArb } from '../shared/test-helpers'
import { createMockService, mockSuccessResponse, mockErrorResponse, expectErrorPropagation, getRequestBody } from '../shared/test-utilities'

/**
 * Tests for createPart method
 */

describe('createPart', () => {
  it('should send POST request to /part/ endpoint', async () => {
    await fc.assert(
      fc.asyncProperty(
        createPartDtoArb,
        partArb,
        async (partData, mockResponse) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, mockResponse)
          
          await service.createPart(partData)
          
          expect(mockApi).toHaveBeenCalledWith('/part/', expect.objectContaining({
            method: 'POST',
            body: expect.any(Object)
          }))
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should apply correct default values', async () => {
    await fc.assert(
      fc.asyncProperty(
        createPartDtoArb,
        partArb,
        async (partData, mockResponse) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, mockResponse)
          
          await service.createPart(partData)
          
          const requestBody = getRequestBody(mockApi)
          
          if (partData.category === undefined) {
            expect(requestBody.category).toBe(null)
          } else {
            expect(requestBody.category).toBe(partData.category)
          }
          
          if (partData.active === undefined) {
            expect(requestBody.active).toBe(true)
          } else {
            expect(requestBody.active).toBe(partData.active)
          }
          
          if (partData.virtual === undefined) {
            expect(requestBody.virtual).toBe(false)
          } else {
            expect(requestBody.virtual).toBe(partData.virtual)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return exact API response without modification', async () => {
    await fc.assert(
      fc.asyncProperty(
        createPartDtoArb,
        partArb,
        async (partData, mockResponse) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, mockResponse)
          
          const result = await service.createPart(partData)
          
          expect(result).toBe(mockResponse)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should propagate API errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        createPartDtoArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        async (partData, errorMessage) => {
          const { mockApi, service } = createMockService()
          const expectedError = mockErrorResponse(mockApi, errorMessage)
          
          await expectErrorPropagation(
            () => service.createPart(partData),
            expectedError
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
