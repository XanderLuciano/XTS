# Implementation Plan: Smart Stock Addition

## Overview

This plan implements the smart stock addition feature by modifying the `InventreeService` to consolidate stock into existing items when available. The implementation follows a bottom-up approach: types first, then service methods, then integration.

## Tasks

- [x] 1. Add type definitions
  - [x] 1.1 Add `AddToExistingStockDto` interface to `app/types/inventree.ts`
    - Define interface with required `quantity: number` and optional `notes?: string`
    - Export the new type
    - _Requirements: 4.1, 4.2_

- [x] 2. Implement service layer changes
  - [x] 2.1 Add `addToExistingStock` method to `InventreeService`
    - Add method that calls `POST /stock/{stockItemId}/add/` endpoint
    - Accept `stockItemId: number` and `data: AddToExistingStockDto` parameters
    - Return `Promise<StockItem>`
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Modify `addStock` method with consolidation logic
    - Query existing stock items using `getStockItems(data.part)`
    - If existing items found, call `addToExistingStock` with first item's ID
    - If no existing items, create new stock item via `POST /stock/`
    - Maintain same return type `Promise<StockItem>`
    - _Requirements: 1.1, 2.1, 3.1, 3.2, 5.1_

  - [x] 2.3 Write property test for stock consolidation routing
    - **Property 1: Stock Consolidation Routing**
    - Test that addStock queries existing stock and routes correctly
    - Use fast-check to generate random part IDs, quantities, and existing stock arrays
    - **Validates: Requirements 1.1, 2.1, 3.1**

  - [x] 2.4 Write property test for error propagation
    - **Property 2: Query Error Propagation**
    - **Property 3: Add-to-Existing Error Propagation**
    - Test that errors from getStockItems and addToExistingStock propagate correctly
    - **Validates: Requirements 1.3, 2.4**

  - [x] 2.5 Write property test for return value consistency
    - **Property 4: Return Value Consistency**
    - Test that successful operations return the API response
    - **Validates: Requirements 2.3, 3.3**

- [x] 3. Checkpoint - Verify implementation
  - Ensure all tests pass, ask the user if questions arise.
  - Manually test the add-stock page to verify backward compatibility
  - _Requirements: 5.1, 5.2, 5.3_

## Notes

- All tasks including property tests are required
- The UI layer (`add-stock.vue`) requires no changes due to backward-compatible service interface
- Property tests use `fast-check` library for input generation
