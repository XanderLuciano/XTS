# Implementation Plan: Smart Barcode Lookup

## Overview

Enhance the scanner page to automatically look up scanned barcodes against InvenTree. Each scan record gains a state machine (`loading` → `found` | `not_found` | `error`) that drives visual rendering and available actions. A new `useScanLookup` composable encapsulates the lookup logic, following the same pattern as `useCheckoutCart`. The implementation is entirely frontend — no new server endpoints needed.

## Tasks

- [x] 1. Extend ScanRecord interface and add resolveImageUrl helper
  - [x] 1.1 Update `ScanRecord` in `app/pages/scan.vue` to add `lookupStatus`, `part`, and `errorMessage` fields; remove the old `loading?: boolean` field
    - Add `lookupStatus: 'loading' | 'found' | 'not_found' | 'error'` field
    - Add `part?: Part` field (import from `~/types/inventree`)
    - Add `errorMessage?: string` field
    - Remove `loading?: boolean` field
    - _Requirements: 4.1_

  - [x] 1.2 Extract `resolveImageUrl` helper into `app/utils/resolveImageUrl.ts`
    - Create a function that resolves relative InvenTree image paths to absolute URLs using `runtimeConfig.public.inventreeApiUrl`
    - Reuse the same logic currently in `checkout.vue`
    - _Requirements: 2.2_

- [x] 2. Create `useScanLookup` composable
  - [x] 2.1 Implement `useScanLookup` composable at `app/composables/useScanLookup.ts`
    - Export `lookupBarcode(record, scanHistory)` — sets record to `loading`, calls `InventreeService.scanBarcode()`, transitions to `found`/`not_found`/`error`
    - Export `reLookupBarcode(record, scanHistory)` — clears previous error/part data, delegates to same core lookup logic
    - Use `useInventreeApi()` internally to get the service instance
    - On success with part: set `lookupStatus = 'found'`, populate `record.part`
    - On success with null: set `lookupStatus = 'not_found'`
    - On error: set `lookupStatus = 'error'`, populate `record.errorMessage`
    - Handle non-Error thrown objects with generic "Failed to look up barcode" message
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.2, 5.4_

  - [x] 2.2 Write property test: Lookup initiation on scan
    - **Property 1: Lookup initiation on scan**
    - **Validates: Requirements 1.1, 1.2**
    - File: `app/composables/__tests__/useScanLookup.spec.ts`

  - [x] 2.3 Write property test: Found state transition
    - **Property 2: Found state transition**
    - **Validates: Requirements 1.3, 6.2**
    - File: `app/composables/__tests__/useScanLookup.spec.ts`

  - [x] 2.4 Write property test: Not-found state transition
    - **Property 3: Not-found state transition**
    - **Validates: Requirements 1.4**
    - File: `app/composables/__tests__/useScanLookup.spec.ts`

  - [x] 2.5 Write property test: Error state transition
    - **Property 4: Error state transition**
    - **Validates: Requirements 1.5**
    - File: `app/composables/__tests__/useScanLookup.spec.ts`

  - [x] 2.6 Write property test: State invariant
    - **Property 5: State invariant**
    - **Validates: Requirements 4.1**
    - File: `app/composables/__tests__/useScanLookup.spec.ts`

  - [x] 2.7 Write property test: Re-lookup resets state and re-calls API
    - **Property 9: Re-lookup resets state and re-calls API**
    - **Validates: Requirements 5.2, 5.4**
    - File: `app/composables/__tests__/useScanLookup.spec.ts`

- [x] 3. Checkpoint - Ensure composable tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update scan.vue template for state-based rendering
  - [x] 4.1 Update `handleScan` and `handleBarcodeDetected` to trigger automatic lookup
    - After pushing a new `ScanRecord` with `lookupStatus: 'loading'`, call `useScanLookup.lookupBarcode()`
    - _Requirements: 1.1_

  - [x] 4.2 Render `found` state: part info display with green styling
    - Show part name, IPN, description, stock level, and link
    - Show part image using `resolveImageUrl` (fallback icon when no image/thumbnail)
    - Show green "Found" badge
    - Hide the Manufacturer Lookup button for found records
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.3_

  - [x] 4.3 Render `not_found` state: lookup and creation options with amber styling
    - Show amber "Not Found" badge
    - Show Manufacturer Lookup button
    - Show "Create Part" button
    - Show "Re-check" button that calls `reLookupBarcode`
    - _Requirements: 3.1, 3.2, 3.3, 4.4, 5.3, 5.4_

  - [x] 4.4 Render `error` state: error display with red styling
    - Show red "Error" badge
    - Display the error message text
    - Show "Retry" button that calls `reLookupBarcode`
    - _Requirements: 4.5, 5.1, 5.2_

  - [x] 4.5 Render `loading` state: spinner on scan record
    - Show spinner/loading animation on the record while lookup is in progress
    - _Requirements: 1.2, 4.2_

  - [x] 4.6 Write component test: Found record UI rendering
    - **Property 6: Found record UI rendering**
    - **Validates: Requirements 2.1, 2.3, 2.4, 4.3**
    - File: `app/pages/__tests__/scan.spec.ts`

  - [x] 4.7 Write component test: Not-found record UI rendering
    - **Property 7: Not-found record UI rendering**
    - **Validates: Requirements 3.1, 3.2, 3.3, 4.4, 5.3**
    - File: `app/pages/__tests__/scan.spec.ts`

  - [x] 4.8 Write component test: Error record UI rendering
    - **Property 8: Error record UI rendering**
    - **Validates: Requirements 4.5, 5.1**
    - File: `app/pages/__tests__/scan.spec.ts`

- [x] 5. Checkpoint - Ensure UI rendering tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update localStorage persistence and part creation callback
  - [x] 6.1 Update localStorage serialization to persist `lookupStatus`, `part`, and `errorMessage`
    - Extend the existing `scanHistory` watcher to serialize the new fields
    - On page load, restore `found` records with their part data; re-trigger `loading` records automatically
    - _Requirements: 4.6_

  - [x] 6.2 Write property test: localStorage round-trip persistence
    - **Property 10: localStorage round-trip persistence**
    - **Validates: Requirements 4.6**
    - File: `app/types/__tests__/scanRecord.spec.ts`

  - [x] 6.3 Implement part creation callback for auto re-lookup
    - When `isModalOpen` closes after successful part creation with `linkBarcode` enabled, call `reLookupBarcode` on the corresponding scan record
    - Update the record state to `found` and display Part_Info_Display on successful re-lookup
    - _Requirements: 6.1, 6.2_

  - [x] 6.4 Wire manufacturer lookup button to existing scrape workflow
    - Ensure clicking Manufacturer Lookup on a `not_found` record triggers `lookupProduct` with the existing scrape flow and opens the Part_Creation_Flow modal
    - _Requirements: 3.4_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The implementation follows the same patterns as `useCheckoutCart` (composable + inline part display)
- No new server endpoints are needed — uses existing `InventreeService.scanBarcode()`
