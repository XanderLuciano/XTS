# Implementation Plan: Barcode Link to Stock Item

## Overview

The implementation adds a `linkBarcode` method to `InventreeService` and extends `scan.vue` with a conditional checkbox, a `currentBarcode` ref, and a barcode linking step in `createPart`. Tests go in `app/pages/__tests__/scan-barcode-link.spec.ts`, following the same pattern as `scan-stock.spec.ts`.

## Tasks

- [x] 1. Add `linkBarcode` method to InventreeService
  - [x] 1.1 Add the `linkBarcode(barcode, stockItemPk)` method to `app/services/inventree.service.ts`
    - Add `async linkBarcode(barcode: string, stockItemPk: number): Promise<void>` that POSTs to `/barcode/link/` with `{ barcode, stockitem: stockItemPk }`
    - The method lets errors propagate to the caller (no internal catch)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.2 Write property test: Service linkBarcode POSTs correct payload (Property 5)
    - **Property 5: Service linkBarcode POSTs correct payload**
    - For any non-empty barcode string and positive integer stock item pk, `linkBarcode(barcode, pk)` sends POST to `/barcode/link/` with body `{ barcode, stockitem: pk }`
    - **Validates: Requirements 3.2**

- [x] 2. Add reactive state and capture barcode in `lookupProduct`
  - [x] 2.1 Add `linkBarcode` ref and `currentBarcode` ref to `scan.vue`
    - Add `const linkBarcode = ref(true)` alongside existing stock state
    - Add `const currentBarcode = ref<string | null>(null)` to capture the barcode from lookups
    - _Requirements: 1.3, 4.1_

  - [x] 2.2 Capture barcode and reset state in `lookupProduct`
    - Inside `lookupProduct`, after setting `partForm` and existing resets, add `currentBarcode.value = barcode` and `linkBarcode.value = true`
    - These must come before `isModalOpen.value = true`
    - _Requirements: 4.1, 5.1, 5.2_

  - [x] 2.3 Write property test: currentBarcode captures the lookup barcode (Property 6)
    - **Property 6: currentBarcode captures the lookup barcode**
    - For any non-empty barcode string passed to `lookupProduct` that results in a successful scrape, `currentBarcode` equals that barcode string
    - **Validates: Requirements 4.1, 4.2**

  - [x] 2.4 Write property test: linkBarcode resets to checked on every modal open (Property 2)
    - **Property 2: linkBarcode resets to checked on every modal open**
    - For any sequence of modal interactions, each time the modal opens via `lookupProduct`, `linkBarcode` resets to `true`
    - **Validates: Requirements 1.3, 5.1, 5.2**

- [x] 3. Add Link Barcode checkbox to the Scraper Modal template
  - [x] 3.1 Add the checkbox UI inside the `createStock` conditional block
    - Add a `div` with `v-if="createStock"` containing `UCheckbox` bound to `linkBarcode`, label "Link Barcode to Stock Item", and description showing `currentBarcode`
    - Place it after the Stock Quantity `UFormField`, inside the existing stock controls section
    - _Requirements: 1.1, 1.2, 1.4, 4.3_

  - [x] 3.2 Write property test: Link checkbox visibility matches createStock state (Property 1)
    - **Property 1: Link checkbox visibility matches createStock state**
    - For any sequence of `createStock` toggles, the Link Barcode checkbox is visible iff `createStock` is checked
    - **Validates: Requirements 1.1, 1.2**

  - [x] 3.3 Write property test: Checkbox description displays the barcode value (Property 7)
    - **Property 7: Checkbox description displays the barcode value**
    - For any barcode string stored in `currentBarcode`, the checkbox description text contains that barcode string
    - **Validates: Requirements 4.3**

- [x] 4. Checkpoint - Verify UI and state management
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Extend `createPart` with barcode linking step
  - [x] 5.1 Add barcode link call after successful stock creation in `createPart`
    - Capture `stockItem` from `addStock` return value (change `await inventree.addStock(stockData)` to `stockItem = await inventree.addStock(stockData)`)
    - After the stock try/catch, add: `if (stockItem && linkBarcode.value && currentBarcode.value)` block
    - Inside, call `await inventree.linkBarcode(currentBarcode.value, stockItem.pk)`
    - On success: show toast with title "Barcode linked to stock item" and description showing the barcode
    - On failure: show error toast with failure reason; part and stock remain intact
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 5.2 Write property test: Barcode link API called if and only if all preconditions met (Property 3)
    - **Property 3: Barcode link API called if and only if all preconditions met**
    - For any combination of createStock (bool), linkBarcode (bool), and stock creation outcome (success/failure), `linkBarcode` service method is called exactly when all three hold: createStock checked, linkBarcode checked, stock creation succeeded
    - **Validates: Requirements 2.1, 2.4, 2.5**

  - [x] 5.3 Write property test: Successful barcode link shows success toast with barcode value (Property 4)
    - **Property 4: Successful barcode link shows success toast with barcode value**
    - For any barcode string and stock item pk where the link API succeeds, a success toast containing the barcode value is displayed
    - **Validates: Requirements 2.2**

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Changes touch two files: `app/services/inventree.service.ts` (new method) and `app/pages/scan.vue` (state, template, logic)
- No new files, types, or components are created
- Property tests use fast-check with vitest in `app/pages/__tests__/scan-barcode-link.spec.ts`
- Each task references specific requirements for traceability
- The barcode link step is best-effort: failure does not undo part or stock creation
