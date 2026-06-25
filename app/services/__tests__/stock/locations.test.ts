import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  createMockService,
  mockSuccessResponse,
  mockErrorResponse,
  expectErrorPropagation,
  getRequestBody,
  getRequestUrl,
  getRequestOptions
} from '../shared/test-utilities'

/**
 * Tests for stock location methods:
 *   findLocationByName, createLocation, linkLocationBarcode
 *
 * Feature: bin-locations
 */

const locationArb = fc.record({
  pk: fc.integer({ min: 1, max: 10000 }),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  description: fc.string({ maxLength: 60 })
})

describe('findLocationByName', () => {
  it('queries /stock/location/ with the name filter', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 30 }), async (name) => {
        const { mockApi, service } = createMockService()
        mockSuccessResponse(mockApi, { results: [] })

        await service.findLocationByName(name)

        expect(getRequestUrl(mockApi)).toBe('/stock/location/')
        expect(getRequestOptions(mockApi)).toEqual(
          expect.objectContaining({ method: 'GET', query: { name } })
        )
      }),
      { numRuns: 50 }
    )
  })

  it('returns the exact-name match when present', async () => {
    const { mockApi, service } = createMockService()
    mockSuccessResponse(mockApi, {
      results: [
        { pk: 1, name: '001.002.003.004', description: '' },
        { pk: 2, name: '001.002.003.005', description: '' }
      ]
    })

    const result = await service.findLocationByName('001.002.003.005')
    expect(result?.pk).toBe(2)
  })

  it('returns null when no exact match exists', async () => {
    const { mockApi, service } = createMockService()
    mockSuccessResponse(mockApi, { results: [{ pk: 1, name: 'other', description: '' }] })

    const result = await service.findLocationByName('001.002.003.004')
    expect(result).toBeNull()
  })

  it('handles a plain array response', async () => {
    const { mockApi, service } = createMockService()
    mockSuccessResponse(mockApi, [{ pk: 9, name: 'A', description: '' }])

    const result = await service.findLocationByName('A')
    expect(result?.pk).toBe(9)
  })

  it('propagates API errors', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (msg) => {
        const { mockApi, service } = createMockService()
        const expectedError = mockErrorResponse(mockApi, msg)
        await expectErrorPropagation(() => service.findLocationByName('x'), expectedError)
      }),
      { numRuns: 50 }
    )
  })
})

describe('createLocation', () => {
  it('POSTs to /stock/location/ with name, description and parent', async () => {
    await fc.assert(
      fc.asyncProperty(locationArb, async (loc) => {
        const { mockApi, service } = createMockService()
        mockSuccessResponse(mockApi, loc)

        await service.createLocation({ name: loc.name, description: loc.description })

        expect(getRequestUrl(mockApi)).toBe('/stock/location/')
        const body = getRequestBody(mockApi)
        expect(body.name).toBe(loc.name)
        expect(body.description).toBe(loc.description)
        expect(body.parent).toBe(null)
      }),
      { numRuns: 50 }
    )
  })

  it('defaults description to empty string and parent to null', async () => {
    const { mockApi, service } = createMockService()
    mockSuccessResponse(mockApi, { pk: 1, name: 'X' })

    await service.createLocation({ name: 'X' })

    const body = getRequestBody(mockApi)
    expect(body.description).toBe('')
    expect(body.parent).toBe(null)
  })

  it('returns the created location unchanged', async () => {
    const { mockApi, service } = createMockService()
    const response = { pk: 42, name: '001.002.003.004', description: 'desc' }
    mockSuccessResponse(mockApi, response)

    const result = await service.createLocation({ name: '001.002.003.004' })
    expect(result).toBe(response)
  })

  it('propagates API errors', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (msg) => {
        const { mockApi, service } = createMockService()
        const expectedError = mockErrorResponse(mockApi, msg)
        await expectErrorPropagation(() => service.createLocation({ name: 'x' }), expectedError)
      }),
      { numRuns: 50 }
    )
  })
})

describe('linkLocationBarcode', () => {
  it('POSTs to /barcode/link/ with the stocklocation field', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.integer({ min: 1, max: 10000 }),
        async (barcode, pk) => {
          const { mockApi, service } = createMockService()
          mockSuccessResponse(mockApi, {})

          await service.linkLocationBarcode(barcode, pk)

          expect(getRequestUrl(mockApi)).toBe('/barcode/link/')
          const body = getRequestBody(mockApi)
          expect(body).toEqual({ barcode, stocklocation: pk })
        }
      ),
      { numRuns: 50 }
    )
  })

  it('propagates API errors', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (msg) => {
        const { mockApi, service } = createMockService()
        const expectedError = mockErrorResponse(mockApi, msg)
        await expectErrorPropagation(() => service.linkLocationBarcode('b', 1), expectedError)
      }),
      { numRuns: 50 }
    )
  })
})
