# Requirements Document

## Introduction

This document specifies the requirements for improving the add-stock functionality in the InvenTree webapp. Currently, the `addStock` function always creates new stock item records, resulting in fragmented inventory data. The smart-stock-addition feature will consolidate stock by adding to existing stock items when available, only creating new records when necessary.

## Glossary

- **Stock_Item**: A record in InvenTree representing a quantity of a specific part at a location
- **Part**: A component or product tracked in the inventory system
- **Add_Stock_Service**: The service layer component responsible for managing stock additions
- **InvenTree_API**: The backend REST API that manages inventory data
- **Stock_Consolidation**: The process of adding quantity to an existing stock item rather than creating a new one

## Requirements

### Requirement 1: Check for Existing Stock Items

**User Story:** As a warehouse operator, I want the system to check for existing stock items before adding stock, so that inventory records remain consolidated.

#### Acceptance Criteria

1. WHEN a user initiates a stock addition for a part, THE Add_Stock_Service SHALL query existing stock items for that part before creating new records
2. THE Add_Stock_Service SHALL use the existing `getStockItems` method to retrieve stock items filtered by part ID
3. IF the stock items query fails, THEN THE Add_Stock_Service SHALL return an error and not proceed with stock addition

### Requirement 2: Add to Existing Stock Item

**User Story:** As a warehouse operator, I want stock to be added to existing stock items when available, so that I don't have multiple fragmented stock records for the same part.

#### Acceptance Criteria

1. WHEN existing stock items are found for a part, THE Add_Stock_Service SHALL add the quantity to the first available stock item
2. THE Add_Stock_Service SHALL call the InvenTree API endpoint `POST /stock/{stockItemId}/add/` with the quantity to add
3. WHEN the add-to-existing operation succeeds, THE Add_Stock_Service SHALL return the updated stock item information
4. IF the add-to-existing operation fails, THEN THE Add_Stock_Service SHALL return an error with a descriptive message

### Requirement 3: Create New Stock Item When None Exist

**User Story:** As a warehouse operator, I want a new stock item to be created when no existing stock exists, so that I can add stock for parts that have never been stocked before.

#### Acceptance Criteria

1. WHEN no existing stock items are found for a part, THE Add_Stock_Service SHALL create a new stock item using `POST /stock/`
2. THE Add_Stock_Service SHALL include the part ID, quantity, and optional notes in the new stock item creation
3. WHEN the new stock item creation succeeds, THE Add_Stock_Service SHALL return the created stock item information

### Requirement 4: Type Definitions for Add-to-Existing Operation

**User Story:** As a developer, I want proper TypeScript types for the add-to-existing stock operation, so that the codebase maintains type safety.

#### Acceptance Criteria

1. THE System SHALL define an `AddToExistingStockDto` type with required `quantity` field and optional `notes` field
2. THE System SHALL ensure the `AddToExistingStockDto` type is exported from the types module

### Requirement 5: Maintain Backward Compatibility

**User Story:** As a user, I want the add-stock UI to continue working seamlessly, so that my workflow is not disrupted by the backend changes.

#### Acceptance Criteria

1. THE add-stock page SHALL continue to accept part selection and quantity input without UI changes
2. WHEN stock is added successfully, THE add-stock page SHALL update the displayed stock count correctly
3. WHEN stock addition fails, THE add-stock page SHALL display an appropriate error message to the user
