import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { InventreeService } from '../../inventree.service'
import {
  stringArb,
  partArb,
  arrayResponseArb,
  paginatedResponseArb,
  unexpectedResponseArb
} from '../shared/test-helpers'

/**
 * Tests for API Response Format Consistency across all query methods
 */

describe('API Response Format Consistency', () => {
  it('should return array responses directly for all query methods', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringArb,
        arrayResponseArb(partArb),
        async (queryParam, mockParts) => {
          // Test searchParts
          const mockApi1 = vi.fn()
          const service1 = new InventreeService(mockApi1)
          mockApi1.mockResolvedValue(mockParts)
          const result1 = await service1.searchParts(queryParam)
          expect(result1).toBe(mockParts)

          // Test getPartByIPN
          const mockApi2 = vi.fn()
          const service2 = new InventreeService(mockApi2)
          mockApi2.mockResolvedValue(mockParts)
          const result2 = await service2.getPartByIPN(queryParam)
          expect(result2).toBe(mockParts)

          // Test getPartByName
          const mockApi3 = vi.fn()
          const service3 = new InventreeService(mockApi3)
          mockApi3.mockResolvedValue(mockParts)
          const result3 = await service3.getPartByName(queryParam)
          expect(result3).toBe(mockParts)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should extract results from paginated responses for all query methods', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringArb,
        paginatedResponseArb(partArb),
        async (queryParam, mockResponse) => {
          // Test searchParts
          const mockApi1 = vi.fn()
          const service1 = new InventreeService(mockApi1)
          mockApi1.mockResolvedValue(mockResponse)
          const result1 = await service1.searchParts(queryParam)
          expect(result1).toEqual(mockResponse.results)

          // Test getPartByIPN
          const mockApi2 = vi.fn()
          const service2 = new InventreeService(mockApi2)
          mockApi2.mockResolvedValue(mockResponse)
          const result2 = await service2.getPartByIPN(queryParam)
          expect(result2).toEqual(mockResponse.results)

          // Test getPartByName
          const mockApi3 = vi.fn()
          const service3 = new InventreeService(mockApi3)
          mockApi3.mockResolvedValue(mockResponse)
          const result3 = await service3.getPartByName(queryParam)
          expect(result3).toEqual(mockResponse.results)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return empty array for unexpected formats in all query methods', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringArb,
        unexpectedResponseArb,
        async (queryParam, mockResponse) => {
          // Test searchParts
          const mockApi1 = vi.fn()
          const service1 = new InventreeService(mockApi1)
          mockApi1.mockResolvedValue(mockResponse)
          const result1 = await service1.searchParts(queryParam)
          expect(result1).toEqual([])

          // Test getPartByIPN
          const mockApi2 = vi.fn()
          const service2 = new InventreeService(mockApi2)
          mockApi2.mockResolvedValue(mockResponse)
          const result2 = await service2.getPartByIPN(queryParam)
          expect(result2).toEqual([])

          // Test getPartByName
          const mockApi3 = vi.fn()
          const service3 = new InventreeService(mockApi3)
          mockApi3.mockResolvedValue(mockResponse)
          const result3 = await service3.getPartByName(queryParam)
          expect(result3).toEqual([])
        }
      ),
      { numRuns: 100 }
    )
  })
})
