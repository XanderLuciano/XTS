# Implementation Plan: Stock Taking

## Overview

Implement the Stock Taking feature incrementally: types first, then service method, composable, page, and home page card. Tests are wired in alongside each component. The implementation mirrors existing patterns from the checkout page and `useCheckoutCart` composable.

## Tasks

- [x] 1. Define types and add `adjustStock` to InventreeService
  - [x] 1.1 Add StockTakeEntry, StockTakeResult, AdjustStockParams, and PersistedStockTakeLog interfaces to `app/types/inventree.ts`
    - StockTakeEntry: id, barcode, part, stockItemPk, systemCount, confirmedCount, status, errorMessage?, addedAt
    - StockTakeResult: success, processedItems, skippedItems, failedItems, message
    - AdjustStockParams: stockItemPk, currentQuantity, newQuantity, notes?
    - PersistedStockTakeLog: entries, savedAt
    - _Requirements: 2.6, 7.1, 9.1_

  - [x] 1.2 Implement `adjustStock` method on `InventreeService` in `app/services/inventree.service.ts`
    - Compute delta = newQuantity - currentQuantity
    - If delta > 0, call `POST /stock/add/` with `{ items: [{ pk, quantity: delta }], notes }`
    - If delta < 0, call `POST /stock/remove/` with `{ items: [{ pk, quantity: abs(delta) }], notes }`
    - If delta === 0, return immediately (no API call)
    - Throw descriptive error on API failure
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 1.3 Write property tests for `adjustStock` in `app/services/__tests__/inventree.service.adjustStock.spec.ts`
    - **Property 6: adjustStock positive delta calls add**
    - **Validates: Requirements 7.2, 9.2**
    - **Property 7: adjustStock negative delta calls remove**
    - **Validates: Requirements 7.3, 9.3**
    - **Property 8: adjustStock zero delta is no-op**
    - **Validates: Requirements 7.4, 9.4**

  - [x] 1.4 Write unit tests for `adjustStock` edge cases in `app/services/__tests__/inventree.service.adjustStock.spec.ts`
    - Test API error propagation with descriptive message
    - Test very large quantity values
    - Test zero-to-zero (both current and new are 0)
    - _Requirements: 9.5_

- [x] 2. Checkpoint - Ensure all adjustStock tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement `useStockTakingLog` composable
  - [x] 3.1 Create `app/composables/useStockTakingLog.ts` with core state management
    - Reactive state: logEntries, isSubmitting, searchMode
    - Barcode index map for duplicate detection
    - Entry order stack for undo (remove-last) functionality
    - UUID generation for entry IDs
    - `setSearchMode` method
    - _Requirements: 2.2, 3.1, 5.1_

  - [x] 3.2 Implement `addItem` method (async) for barcode/part resolution
    - In barcode mode: call `inventreeService.scanBarcode()`, then `getStockItems()` for the resolved part
    - In part mode: call `inventreeService.searchParts()`, then `getStockItems()` for the first matched part
    - Handle barcode-to-stock-item resolution (get associated part)
    - Check barcode index for duplicates — if duplicate, return existing entry ID (no new entry)
    - Create StockTakeEntry with part data, stockItemPk (first stock item), systemCount = stock item quantity, confirmedCount = systemCount
    - Set status to 'error' with message if barcode not found, part not found, or no stock items
    - Persist to localStorage after mutation
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 4.1, 6.1_

  - [x] 3.3 Implement `updateCount`, `removeEntry`, `removeLastEntry`, `clearLog` methods
    - `updateCount(entryId, newCount)`: validate non-negative, update confirmedCount, persist to localStorage
    - `removeEntry(entryId)`: remove from logEntries, barcode index, and order stack; persist
    - `removeLastEntry()`: pop last from order stack, call removeEntry; return null if empty
    - `clearLog()`: clear all state and remove from localStorage
    - _Requirements: 4.4, 5.1, 6.3, 8.2_

  - [x] 3.4 Implement localStorage persistence (`loadFromStorage`, auto-save)
    - Save: serialize logEntries to JSON under key `stock-taking-log` on every mutation
    - Load: parse JSON from localStorage on `loadFromStorage()` call, handle corrupted/missing data gracefully
    - Clear: remove key from localStorage on clearLog/applyStockTake success
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 3.5 Implement `applyStockTake` method for bulk submission
    - Iterate log entries, compute delta per entry
    - Skip entries with zero delta (count skippedItems)
    - Call `inventreeService.adjustStock()` for non-zero deltas
    - On full success: clear log, return success result
    - On partial failure: remove successful entries, retain failed entries with error status
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 3.6 Implement computed properties
    - `isEmpty`: logEntries.length === 0
    - `hasErrors`: any entry with status 'error'
    - `entryCount`: logEntries.length
    - `highlightEntry(entryId)`: set a reactive highlighted ID for UI scrolling
    - _Requirements: 8.3, 8.4_

  - [x] 3.7 Write property tests for composable in `app/composables/__tests__/useStockTakingLog.spec.ts`
    - **Property 1: Log entry creation invariant** — new entries have confirmedCount === systemCount, valid stockItemPk, correct part data
    - **Validates: Requirements 2.6, 4.1**
    - **Property 2: No duplicate log entries** — scanning same barcode twice does not increase log length
    - **Validates: Requirements 3.1**
    - **Property 3: Count update stores value** — updateCount sets confirmedCount to provided value
    - **Validates: Requirements 4.4**
    - **Property 4: Remove last entry** — removes most recently added, decreases length by 1
    - **Validates: Requirements 5.1**
    - **Property 5: localStorage round-trip** — save then load produces equivalent entries
    - **Validates: Requirements 6.1, 6.2**
    - **Property 9: Apply button disabled invariant** — disabled iff log empty or has error entries
    - **Validates: Requirements 8.4**

  - [x] 3.8 Write unit tests for composable edge cases in `app/composables/__tests__/useStockTakingLog.spec.ts`
    - Barcode resolving to stock item retrieves associated part and first stock item
    - Part with no stock items creates error entry
    - Network failure during scan creates error entry
    - Corrupted localStorage data handled gracefully (empty log, no crash)
    - Missing localStorage key handled gracefully
    - Apply with all zero deltas skips all API calls, returns correct skippedItems count
    - Apply with mixed deltas calls correct add/remove endpoints
    - Apply clears log on full success
    - Apply retains only failed entries on partial failure
    - Remove last from empty log returns null
    - _Requirements: 2.4, 2.7, 6.2, 7.4, 7.5, 7.6_

- [x] 4. Checkpoint - Ensure all composable tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Stock Taking page
  - [x] 5.1 Create `app/pages/stock-taking.vue` with page layout and barcode input section
    - Container, header, and UCard layout matching checkout page
    - Barcode input with auto-focus on mount
    - Search mode toggle (barcode / part search) buttons
    - Enter handler on input: call addItem, clear input, re-focus
    - _Requirements: 2.1, 2.2, 10.1, 10.2_

  - [x] 5.2 Implement log display section
    - UCard with log entries list
    - Each entry shows: part name, barcode, system stock count, editable Count_Field (defaults to systemCount)
    - Part thumbnail/image if available
    - Error state display for failed entries
    - Empty state message when log is empty
    - Highlight animation for duplicate scan scroll-to
    - Remove button per entry
    - _Requirements: 8.1, 8.3, 3.1_

  - [x] 5.3 Implement actions section and keyboard shortcuts
    - "Undo [Esc]" button calling removeLastEntry
    - "Clear Log" button calling clearLog
    - "Apply Stock Take" button calling applyStockTake
    - Apply button disabled when log empty or has errors (computed from composable)
    - Loading state on Apply button during submission
    - Escape key global handler for undo
    - Enter/Tab on Count_Field confirms and returns focus to barcode input
    - Toast notifications for success/error/void actions
    - _Requirements: 5.1, 5.2, 7.5, 7.6, 7.7, 8.2, 8.4, 4.2_

  - [x] 5.4 Wire localStorage restore on page mount
    - Call loadFromStorage on mounted
    - _Requirements: 6.2_

  - [x] 5.5 Write page integration tests in `app/pages/__tests__/stock-taking.spec.ts`
    - Page renders with barcode input focused
    - Barcode/part search mode toggle works
    - Scanning barcode adds entry to log display
    - Duplicate scan highlights existing entry (no new entry)
    - Enter/Tab on count field returns focus to barcode input
    - Escape key removes last entry
    - Clear Log button empties the log
    - Apply Stock Take button triggers bulk submission
    - Apply button disabled when log is empty
    - Apply button disabled when log has error entries
    - Loading state shown during submission
    - Success toast shown after successful apply
    - Error toast shown on failed apply
    - Empty state message shown when log is empty
    - _Requirements: 2.1, 3.1, 4.2, 5.1, 7.5, 7.6, 7.7, 8.2, 8.3, 8.4_

- [x] 6. Add home page navigation card
  - [x] 6.1 Add Stock Taking card to `app/pages/index.vue`
    - Teal-colored icon header with clipboard-check icon
    - Description: "Scan items to verify and adjust stock counts. Submit all changes in bulk."
    - Footer with NuxtLink to `/stock-taking`
    - Placed in the existing grid alongside other cards
    - _Requirements: 1.1, 1.2_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using `fast-check`
- Unit tests validate specific examples and edge cases
- The composable pattern mirrors `useCheckoutCart` for consistency
- The `adjustStock` method reuses existing `/stock/add/` and `/stock/remove/` endpoints rather than the `/stock/count/` endpoint
