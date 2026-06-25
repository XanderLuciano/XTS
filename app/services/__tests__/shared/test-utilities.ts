import { vi, expect } from 'vitest'
import { InventreeService } from '../../inventree.service'

/**
 * Common test utilities for InventreeService tests
 */

/**
 * Creates a mock API and InventreeService instance
 */
export function createMockService() {
  const mockApi = vi.fn()
  const service = new InventreeService(mockApi)
  return { mockApi, service }
}

/**
 * Sets up a mock API to return a successful response
 */
export function mockSuccessResponse(mockApi: ReturnType<typeof vi.fn>, response: any) {
  mockApi.mockResolvedValue(response)
}

/**
 * Sets up a mock API to throw an error
 */
export function mockErrorResponse(mockApi: ReturnType<typeof vi.fn>, errorMessage: string) {
  const error = new Error(errorMessage)
  mockApi.mockRejectedValue(error)
  return error
}

/**
 * Tests that a method propagates API errors correctly
 * This is a common pattern across all methods
 */
export async function expectErrorPropagation(
  methodCall: () => Promise<any>,
  expectedError: Error
) {
  let thrownError: Error | null = null

  try {
    await methodCall()
  } catch (error) {
    thrownError = error as Error
  }

  expect(thrownError).toBeDefined()
  expect(thrownError).toBe(expectedError)
  expect(thrownError!.message).toBe(expectedError.message)
}

/**
 * Extracts the request body from the first mock API call
 */
export function getRequestBody(mockApi: ReturnType<typeof vi.fn>) {
  const callArgs = mockApi.mock.calls[0]
  if (!callArgs || !callArgs[1]) {
    throw new Error('No API call was made or call has no options')
  }
  return callArgs[1].body
}

/**
 * Extracts the URL from the first mock API call
 */
export function getRequestUrl(mockApi: ReturnType<typeof vi.fn>) {
  const callArgs = mockApi.mock.calls[0]
  if (!callArgs) {
    throw new Error('No API call was made')
  }
  return callArgs[0]
}

/**
 * Extracts the full request options from the first mock API call
 */
export function getRequestOptions(mockApi: ReturnType<typeof vi.fn>) {
  const callArgs = mockApi.mock.calls[0]
  if (!callArgs) {
    throw new Error('No API call was made')
  }
  return callArgs[1]
}
