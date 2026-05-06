# InventreeService Test Suite

Comprehensive test suite for the InventreeService class, which provides a type-safe interface for interacting with the InvenTree inventory management API.

## Overview

This test suite uses **property-based testing** with [fast-check](https://github.com/dubzzz/fast-check) to verify correctness properties across thousands of randomly generated test cases. All tests are organized into focused folders by domain.

**Test Coverage:**
- 28 property-based tests
- 100 iterations per test (2,800+ test cases total)
- 16 correctness properties validated
- All InventreeService methods covered

## Folder Structure

```
__tests__/
├── shared/              # Shared utilities and test data generators
│   ├── test-helpers.ts       # Fast-check arbitraries (data generators)
│   └── test-utilities.ts     # Common mocking and assertion utilities
│
├── parts/               # Part-related operations (5 test files)
│   ├── searchParts.test.ts
│   ├── getPartByIPN.test.ts
│   ├── getPartByName.test.ts
│   ├── checkPartExists.test.ts
│   └── createPart.test.ts
│
├── stock/               # Stock-related operations (6 test files)
│   ├── addStock-helpers.ts
│   ├── addStock.routing.test.ts
│   ├── addStock.errorPropagation.test.ts
│   ├── addStock.returnValue.test.ts
│   ├── getStockItems.test.ts
│   └── removeStock.test.ts
│
└── integration/         # Cross-method integration tests (1 test file)
    └── responseFormatConsistency.test.ts
```

## Shared Utilities (`shared/`)

### `test-helpers.ts`
Fast-check arbitraries for generating random test data:
- **Primitives**: `partIdArb`, `quantityArb`, `stringArb`, `notesArb`
- **Objects**: `partArb`, `stockItemArb`, `createPartDtoArb`
- **API Responses**: `arrayResponseArb`, `paginatedResponseArb`, `unexpectedResponseArb`

### `test-utilities.ts`
Common test utilities that eliminate boilerplate:
- `createMockService()` - Creates mock API and service instance
- `mockSuccessResponse()` - Sets up successful API response
- `mockErrorResponse()` - Sets up error response
- `expectErrorPropagation()` - Tests error propagation
- `getRequestBody()` - Extracts request body from mock calls
- `getRequestUrl()` - Extracts URL from mock calls

**Example usage:**
```typescript
const { mockApi, service } = createMockService()
mockSuccessResponse(mockApi, mockData)
await service.searchParts('query')
```

## Test Categories

### Parts Tests (`parts/`)

Tests for part management operations:

| Test File | Tests | Focus |
|-----------|-------|-------|
| `searchParts.test.ts` | 2 | URL encoding, error propagation |
| `getPartByIPN.test.ts` | 2 | IPN parameter passing, error propagation |
| `getPartByName.test.ts` | 2 | Name parameter passing, error propagation |
| `checkPartExists.test.ts` | 3 | Existence checking logic, error propagation |
| `createPart.test.ts` | 4 | POST requests, default values, return values |

### Stock Tests (`stock/`)

Tests for stock management operations:

| Test File | Tests | Focus |
|-----------|-------|-------|
| `addStock.routing.test.ts` | 1 | Stock consolidation routing logic |
| `addStock.errorPropagation.test.ts` | 2 | Error handling for query and add operations |
| `addStock.returnValue.test.ts` | 3 | Return value consistency |
| `getStockItems.test.ts` | 2 | Query parameters, error propagation |
| `removeStock.test.ts` | 4 | PATCH requests, negative quantities, notes |

**Note:** `addStock-helpers.ts` contains shared mock setup functions for the addStock tests.

### Integration Tests (`integration/`)

Tests that verify behavior across multiple methods:

| Test File | Tests | Focus |
|-----------|-------|-------|
| `responseFormatConsistency.test.ts` | 3 | Consistent handling of array, paginated, and unexpected API responses |

## Running Tests

```bash
# Run all tests
npm test

# Run tests by category
npm test -- parts
npm test -- stock
npm test -- integration

# Run specific test file
npm test -- searchParts
npm test -- addStock.routing
npm test -- responseFormatConsistency

# Run with coverage
npm test -- --coverage
```

## Property-Based Testing

This test suite uses property-based testing instead of traditional example-based tests. Instead of writing specific test cases, we define **properties** that should hold true for all inputs.

**Benefits:**
- Automatically generates 100 random test cases per property
- Finds edge cases you wouldn't think to test
- Shrinks failing examples to minimal counterexamples
- Provides stronger correctness guarantees

**Example:**
```typescript
// Instead of: "searchParts should encode '&' as '%26'"
// We test: "searchParts should URL-encode ANY query string"
await fc.assert(
  fc.asyncProperty(
    stringArb,  // Generates random strings
    async (query) => {
      await service.searchParts(query)
      expect(mockApi).toHaveBeenCalledWith(
        `/part/?search=${encodeURIComponent(query)}`
      )
    }
  ),
  { numRuns: 100 }  // Tests 100 random strings
)
```

## Key Correctness Properties

The test suite validates 16 correctness properties:

**Stock Operations:**
1. Stock consolidation routing (always query first, route correctly)
2. Query error propagation (no fallback on getStockItems failure)
3. Add-to-existing error propagation (no fallback on addToExistingStock failure)
4. Return value consistency (exact API response returned)

**Part Operations:**
5. URL encoding in searchParts
6. IPN parameter passing in getPartByIPN
7. Name parameter passing in getPartByName
8. checkPartExists returns correct existence status
9. createPart sends POST to correct endpoint
10. createPart applies correct default values
11. createPart returns exact API response

**Stock Item Operations:**
12. getStockItems uses correct query parameters
13. removeStock sends PATCH to correct endpoint
14. removeStock sends negative quantity
15. removeStock includes notes when provided

**Cross-Method:**
16. Universal error propagation (all methods propagate errors unchanged)

Plus 3 integration properties for API response format consistency.

## Design Documents

For detailed requirements and design specifications:
- `.kiro/specs/smart-stock-addition/` - Stock consolidation feature
- `.kiro/specs/inventree-test-coverage/` - Comprehensive test coverage feature

## Contributing

When adding new tests:
1. Place tests in the appropriate folder (`parts/`, `stock/`, or `integration/`)
2. Use shared utilities from `shared/` to reduce boilerplate
3. Write property-based tests when possible (test properties, not examples)
4. Run tests with `npm test` to ensure all pass
5. Update this README if adding new test categories
