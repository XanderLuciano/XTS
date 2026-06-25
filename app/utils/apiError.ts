/**
 * Error-narrowing helpers for handling `unknown` caught errors.
 *
 * Catch bindings are typed as `unknown` (TypeScript's `useUnknownInCatchVariables`).
 * Rather than casting to `any` — which throws away type safety for the whole
 * block — these helpers narrow `unknown` internally so callers can write:
 *
 *   catch (error) {                       // stays `unknown`
 *     message.value = extractApiError(error, 'Something failed')
 *   }
 */

/**
 * Shape of a typical API/$fetch error. `$fetch` (ofetch) attaches the parsed
 * response body to `error.data`; many backends nest a human-readable message
 * and an application error code inside it.
 */
interface ApiErrorShape {
  data?: {
    message?: string
    detail?: string
    code?: string
    non_field_errors?: string[]
  }
  status?: number
  statusCode?: number
  message?: string
}

/**
 * Type guard: is this an object-shaped error we can read fields off of?
 */
export function isApiError(error: unknown): error is ApiErrorShape {
  return typeof error === 'object' && error !== null
}

/**
 * Extract a human-readable message from an unknown caught error.
 *
 * Resolution order:
 *  1. `error.data.message` / `error.data.detail` / `error.data.non_field_errors[0]`
 *  2. `error.message` (covers `Error` instances and ofetch errors)
 *  3. the provided fallback
 */
export function extractApiError(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (isApiError(error)) {
    const data = error.data
    if (data) {
      if (data.message) return data.message
      if (data.detail) return data.detail
      if (data.non_field_errors && data.non_field_errors.length > 0) {
        return data.non_field_errors[0]!
      }
    }
    if (typeof error.message === 'string' && error.message) {
      return error.message
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

/**
 * Extract an application error code (e.g. 'STEP_ALREADY_COMPLETE') from an
 * unknown caught error, or `undefined` if none is present.
 */
export function extractApiErrorCode(error: unknown): string | undefined {
  if (isApiError(error) && error.data?.code) {
    return error.data.code
  }
  return undefined
}

/**
 * Extract an HTTP status code from an unknown caught error, if available.
 * Handles both `status` and ofetch's `statusCode`.
 */
export function extractApiErrorStatus(error: unknown): number | undefined {
  if (isApiError(error)) {
    return error.status ?? error.statusCode
  }
  return undefined
}
