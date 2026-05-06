# Requirements Document

## Introduction

This document specifies requirements for adding comprehensive test coverage to all InvenTree-related code in the project. The InventreeService class provides methods for interacting with the InvenTree inventory management API, including part search/lookup, part creation, and stock management. Currently, only the `addStock` method and related error handling have property-based tests. This feature will add unit tests and property-based tests for all remaining untested methods.

## Glossary

- **InventreeService**: The service class that wraps InvenTree API calls and provides methods for part and stock management
- **Part**: An inventory item in InvenTree with properties like name, IPN (Internal Part Number), description, and stock levels
- **StockItem**: A record of physical stock for a part, including quantity and location
- **IPN**: Internal Part Number - a unique identifier for parts within the organization
- **Property-Based Test**: A test that verifies a property holds for all generated inputs rather than specific examples
- **Mock_API**: A test double that simulates the InvenTree API responses
- **API_Response**: The data structure returned by InvenTree API endpoints

## Requirements

### Requirement 1: searchParts Method Testing

**User Story:** As a developer, I want comprehensive tests for the searchParts method, so that I can ensure part search functionality works correctly across various inputs and API response formats.

#### Acceptance Criteria

1. WHEN searchParts is called with a query string, THE InventreeService SHALL URL-encode the query parameter before making the API request
2. WHEN the API returns an array of parts, THE InventreeService SHALL return that array directly
3. WHEN the API returns an object with a results property, THE InventreeService SHALL extract and return the results array
4. WHEN the API returns an unexpected format, THE InventreeService SHALL return an empty array
5. WHEN the API throws an error, THE InventreeService SHALL propagate the error to the caller

### Requirement 2: getPartByIPN Method Testing

**User Story:** As a developer, I want comprehensive tests for the getPartByIPN method, so that I can ensure IPN-based part lookup works correctly.

#### Acceptance Criteria

1. WHEN getPartByIPN is called with an IPN string, THE InventreeService SHALL pass the IPN as a query parameter to the API
2. WHEN the API returns an array of parts, THE InventreeService SHALL return that array directly
3. WHEN the API returns an object with a results property, THE InventreeService SHALL extract and return the results array
4. WHEN the API returns an unexpected format, THE InventreeService SHALL return an empty array
5. WHEN the API throws an error, THE InventreeService SHALL propagate the error to the caller

### Requirement 3: getPartByName Method Testing

**User Story:** As a developer, I want comprehensive tests for the getPartByName method, so that I can ensure name-based part lookup works correctly.

#### Acceptance Criteria

1. WHEN getPartByName is called with a name string, THE InventreeService SHALL pass the name as a query parameter to the API
2. WHEN the API returns an array of parts, THE InventreeService SHALL return that array directly
3. WHEN the API returns an object with a results property, THE InventreeService SHALL extract and return the results array
4. WHEN the API returns an unexpected format, THE InventreeService SHALL return an empty array
5. WHEN the API throws an error, THE InventreeService SHALL propagate the error to the caller

### Requirement 4: checkPartExists Method Testing

**User Story:** As a developer, I want comprehensive tests for the checkPartExists method, so that I can ensure part existence checking works correctly.

#### Acceptance Criteria

1. WHEN checkPartExists is called and getPartByIPN returns one or more parts, THE InventreeService SHALL return { exists: true, field: 'IPN' }
2. WHEN checkPartExists is called and getPartByIPN returns an empty array, THE InventreeService SHALL return { exists: false }
3. WHEN getPartByIPN throws an error during checkPartExists, THE InventreeService SHALL propagate the error to the caller

### Requirement 5: createPart Method Testing

**User Story:** As a developer, I want comprehensive tests for the createPart method, so that I can ensure part creation works correctly with various input configurations.

#### Acceptance Criteria

1. WHEN createPart is called with part data, THE InventreeService SHALL send a POST request to the /part/ endpoint
2. WHEN createPart is called without optional fields, THE InventreeService SHALL apply default values (category: null, active: true, virtual: false)
3. WHEN createPart is called with explicit optional fields, THE InventreeService SHALL use the provided values instead of defaults
4. WHEN the API returns a created part, THE InventreeService SHALL return that part object
5. WHEN the API throws an error, THE InventreeService SHALL propagate the error to the caller

### Requirement 6: getStockItems Method Testing

**User Story:** As a developer, I want direct tests for the getStockItems method, so that I can ensure stock item retrieval works correctly independent of addStock.

#### Acceptance Criteria

1. WHEN getStockItems is called with a part ID, THE InventreeService SHALL query the API with part and in_stock=true parameters
2. WHEN the API returns an array of stock items, THE InventreeService SHALL return that array directly
3. WHEN the API returns an object with a results property, THE InventreeService SHALL extract and return the results array
4. WHEN the API returns an unexpected format, THE InventreeService SHALL return an empty array
5. WHEN the API throws an error, THE InventreeService SHALL propagate the error to the caller

### Requirement 7: removeStock Method Testing

**User Story:** As a developer, I want comprehensive tests for the removeStock method, so that I can ensure stock removal works correctly.

#### Acceptance Criteria

1. WHEN removeStock is called with a stock item ID and quantity, THE InventreeService SHALL send a PATCH request to the stock item endpoint
2. WHEN removeStock is called, THE InventreeService SHALL send a negative quantity value in the request body
3. WHEN removeStock is called with notes, THE InventreeService SHALL include the notes in the request body
4. WHEN the API throws an error, THE InventreeService SHALL propagate the error to the caller

### Requirement 8: API Response Format Consistency

**User Story:** As a developer, I want property-based tests that verify consistent handling of API response formats, so that I can ensure the service handles both array and paginated responses correctly across all methods.

#### Acceptance Criteria

1. FOR ALL part query methods (searchParts, getPartByIPN, getPartByName), THE InventreeService SHALL handle array responses identically
2. FOR ALL part query methods, THE InventreeService SHALL handle paginated responses (with results property) identically
3. FOR ALL part query methods, THE InventreeService SHALL handle unexpected response formats by returning an empty array
