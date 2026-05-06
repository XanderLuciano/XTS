# Implementation Plan: InventreeService Test Coverage

## Overview

This plan adds comprehensive test coverage for all InventreeService methods. The implementation will add both unit tests and property-based tests for `searchParts`, `getPartByIPN`, `getPartByName`, `checkPartExists`, `createPart`, `getStockItems`, and `removeStock`. Tests will be added to the existing test file using Vitest and fast-check, following the patterns established by the existing `addStock` tests.

## Tasks

- [x] 1. Set up test data generators (arbitraries)
  - Add fast-check arbitraries for Part objects, query strings, and API responses
  - Add arbitraries for array, paginated, and unexpected response formats
  - Add arbitraries for CreatePartDto with optional fields
  - _Requirements: All requirements (foundation for all tests)_

- [x] 2. Implement searchParts tests
  - [x] 2.1 Write unit tests for searchParts
    - Test basic search with simple query
    - Test search with empty results
    - Test search with special characters in query
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 2.2 Write property test for URL encoding
    - **Property 1: URL Encoding in searchParts**
    - **Validates: Requirements 1.1**
  
  - [x] 2.3 Write property test for searchParts error propagation
    - **Property 16: Universal Error Propagation (searchParts)**
    - **Validates: Requirements 1.5**

- [x] 3. Implement getPartByIPN tests
  - [x] 3.1 Write unit tests for getPartByIPN
    - Test lookup with valid IPN
    - Test lookup with non-existent IPN
    - Test lookup with empty results
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 3.2 Write property test for IPN parameter passing
    - **Property 2: IPN Parameter Passing in getPartByIPN**
    - **Validates: Requirements 2.1**
  
  - [x] 3.3 Write property test for getPartByIPN error propagation
    - **Property 16: Universal Error Propagation (getPartByIPN)**
    - **Validates: Requirements 2.5**

- [x] 4. Implement getPartByName tests
  - [x] 4.1 Write unit tests for getPartByName
    - Test lookup with valid name
    - Test lookup with non-existent name
    - Test lookup with empty results
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 4.2 Write property test for name parameter passing
    - **Property 3: Name Parameter Passing in getPartByName**
    - **Validates: Requirements 3.1**
  
  - [x] 4.3 Write property test for getPartByName error propagation
    - **Property 16: Universal Error Propagation (getPartByName)**
    - **Validates: Requirements 3.5**

- [x] 5. Implement API response format consistency tests
  - [x] 5.1 Write property test for array response handling
    - **Property 13: API Response Format Consistency - Array Responses**
    - Test all query methods (searchParts, getPartByIPN, getPartByName, getStockItems)
    - **Validates: Requirements 1.2, 2.2, 3.2, 6.2, 8.1**
  
  - [x] 5.2 Write property test for paginated response handling
    - **Property 14: API Response Format Consistency - Paginated Responses**
    - Test all query methods (searchParts, getPartByIPN, getPartByName, getStockItems)
    - **Validates: Requirements 1.3, 2.3, 3.3, 6.3, 8.2**
  
  - [x] 5.3 Write property test for unexpected format handling
    - **Property 15: API Response Format Consistency - Unexpected Formats**
    - Test all query methods (searchParts, getPartByIPN, getPartByName, getStockItems)
    - **Validates: Requirements 1.4, 2.4, 3.4, 6.4, 8.3**

- [x] 6. Checkpoint - Ensure all query method tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement checkPartExists tests
  - [x] 7.1 Write unit tests for checkPartExists
    - Test when part exists by IPN
    - Test when part does not exist (edge case)
    - Test integration with getPartByIPN
    - _Requirements: 4.1, 4.2_
  
  - [x] 7.2 Write property test for checkPartExists with existing parts
    - **Property 4: checkPartExists Returns True When Parts Found**
    - **Validates: Requirements 4.1**
  
  - [x] 7.3 Write property test for checkPartExists error propagation
    - **Property 5: checkPartExists Error Propagation**
    - **Validates: Requirements 4.3**

- [x] 8. Implement createPart tests
  - [x] 8.1 Write unit tests for createPart
    - Test creating part with all fields
    - Test creating part with minimal fields (defaults applied)
    - Test creating part with explicit optional fields
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 8.2 Write property test for createPart POST request
    - **Property 6: createPart POST Request**
    - **Validates: Requirements 5.1**
  
  - [x] 8.3 Write property test for createPart default values
    - **Property 7: createPart Default Values**
    - **Validates: Requirements 5.2, 5.3**
  
  - [x] 8.4 Write property test for createPart return value
    - **Property 8: createPart Return Value**
    - **Validates: Requirements 5.4**
  
  - [x] 8.5 Write property test for createPart error propagation
    - **Property 16: Universal Error Propagation (createPart)**
    - **Validates: Requirements 5.5**

- [x] 9. Implement getStockItems tests
  - [x] 9.1 Write unit tests for getStockItems
    - Test getting stock items for a part
    - Test getting stock items with empty results
    - Test query parameters are correct
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  
  - [x] 9.2 Write property test for getStockItems query parameters
    - **Property 9: getStockItems Query Parameters**
    - **Validates: Requirements 6.1**
  
  - [x] 9.3 Write property test for getStockItems error propagation
    - **Property 16: Universal Error Propagation (getStockItems)**
    - **Validates: Requirements 6.5**

- [x] 10. Implement removeStock tests
  - [x] 10.1 Write unit tests for removeStock
    - Test removing stock with quantity
    - Test removing stock with notes
    - Test removing stock without notes
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [x] 10.2 Write property test for removeStock PATCH request
    - **Property 10: removeStock PATCH Request**
    - **Validates: Requirements 7.1**
  
  - [x] 10.3 Write property test for removeStock negative quantity
    - **Property 11: removeStock Negative Quantity**
    - **Validates: Requirements 7.2**
  
  - [x] 10.4 Write property test for removeStock notes inclusion
    - **Property 12: removeStock Notes Inclusion**
    - **Validates: Requirements 7.3**
  
  - [x] 10.5 Write property test for removeStock error propagation
    - **Property 16: Universal Error Propagation (removeStock)**
    - **Validates: Requirements 7.4**

- [x] 11. Final checkpoint - Run full test suite
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All property tests should run with minimum 100 iterations (`{ numRuns: 100 }`)
- Each property test must include a comment referencing the design document property
- Tests will be added to existing file: `app/services/__tests__/inventree.service.test.ts`
- Existing `addStock` tests remain unchanged
- Use Vitest and fast-check (already configured)
- Follow patterns established by existing tests
