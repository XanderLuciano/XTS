# Technical Design Document

## Introduction

This document describes the technical approach for adding comprehensive test coverage to the InventreeService class. The service provides methods for interacting with the InvenTree inventory management API, and currently only has property-based tests for the `addStock` method. This design covers testing strategies for all remaining methods.

## Design Overview

The testing approach uses a combination of unit tests and property-based tests (PBT) using Vitest and fast-check. All tests will mock the API dependency to isolate the service logic. The key insight is that most methods share common response handling patterns (array vs paginated vs unexpected), which can be tested with shared arbitraries and consistent property definitions.

## Test Architecture

### Test File Organization
All tests will be added to the existing test file: `app/services/__tests__/inventree.service.test.ts`

### Testing Framework
- **Vitest**: Test runner and assertion library
- **fast-check**: Property-based testing library

### Shared Arbitraries

```typescript
// Part arbitrary for generating test parts
const partArb = fc.record({
  pk: fc.integer({ min: 1, max: 10000 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  IPN: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.string({ maxLength: 500 }),
  category: fc.option(fc.integer({ min: 1 })),
  active: fc.boolean(),
  virtual: fc.boolean(),
  in_stock: fc.integer({ min: 0 })
})

// Response format arbitraries
const arrayResponseArb = <T>(itemArb: fc.Arbitrary<T>) => fc.array(itemArb, { minLength: 0, maxLength: 10 })
const paginatedResponseArb = <T>(itemArb: fc.Arbitrary<T>) => fc.record({
  count: fc.integer({ min: 0 }),
  results: fc.array(itemArb, { minLength: 0, maxLength: 10 })
})
const unexpectedResponseArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.integer(),
  fc.record({ data: fc.array(fc.string()) }) // object without results property
)
```

## Correctness Properties

### Property 1: Query Parameter Encoding (Requirement 1.1)
For any searchParts call with a query string containing special characters, the service SHALL URL-encode the query parameter in the API request URL.

### Property 2: Array Response Pass-Through (Requirements 1.2, 2.2, 3.2, 6.2)
For any part query method (searchParts, getPartByIPN, getPartByName, getStockItems) when the API returns an array, the service SHALL return that exact array unchanged.

### Property 3: Paginated Response Extraction (Requirements 1.3, 2.3, 3.3, 6.3)
For any part query method when the API returns an object with a `results` property, the service SHALL extract and return the results array.

### Property 4: Unexpected Format Fallback (Requirements 1.4, 2.4, 3.4, 6.4)
For any part query method when the API returns an unexpected format (null, undefined, string, number, or object without results), the service SHALL return an empty array.

### Property 5: Error Propagation (Requirements 1.5, 2.5, 3.5, 4.3, 5.5, 6.5, 7.4)
For any service method when the API throws an error, the service SHALL propagate that exact error to the caller without modification.

### Property 6: Part Existence Check Logic (Requirements 4.1, 4.2)
For checkPartExists, when getPartByIPN returns a non-empty array, the service SHALL return `{ exists: true, field: 'IPN' }`. When getPartByIPN returns an empty array, the service SHALL return `{ exists: false }`.

### Property 7: CreatePart Default Values (Requirements 5.2, 5.3)
For createPart, when optional fields (category, active, virtual) are not provided, the service SHALL apply defaults (null, true, false). When explicitly provided, the service SHALL use those values.

### Property 8: CreatePart API Call (Requirements 5.1, 5.4)
For createPart, the service SHALL send a POST request to /part/ with the part data and return the API response unchanged.

### Property 9: RemoveStock Request Format (Requirements 7.1, 7.2, 7.3)
For removeStock, the service SHALL send a PATCH request to `/stock/{id}/` with a negative quantity value and include notes if provided.

## Test Strategy

### Method-Specific Tests

Each method will have tests covering:
1. Correct API call format (URL, method, parameters)
2. Response format handling (array, paginated, unexpected)
3. Error propagation

### Shared Behavior Tests

A dedicated describe block will test the consistent response handling across all query methods using parameterized tests.

## Dependencies

- Existing test infrastructure (Vitest, fast-check)
- Mock API pattern already established in existing tests
- Type definitions from `~/types/inventree`

## Out of Scope

- Integration tests with real InvenTree API
- Performance testing
- Tests for `addStock` and `addToExistingStock` (already covered)
