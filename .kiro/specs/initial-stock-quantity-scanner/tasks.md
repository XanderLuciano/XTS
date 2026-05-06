# Implementation Plan: Initial Stock Quantity in Scraper Modal

## Overview

All changes are scoped to `app/pages/scan.vue`. The implementation adds reactive state for stock controls, extends the template with a checkbox and quantity input, modifies the `createPart` function to sequentially create stock after part creation, and resets state on modal open. Tests go in `app/pages/__tests__/scan-stock.spec.ts`.

## Tasks

- [x] 1. Add reactive state and auto-focus watcher
  - [x] 1.1 Add `createStock`, `stockQuantity`, and `stockQuantityInput` refs to `scan.vue`
    - Add `const createStock = ref(false)` and `const stockQuantity = ref(1)` alongside existing state
    - Add `const stockQuantityInput = ref<HTMLInputElement | null>(null)` template ref
    - Add `watch(createStock, ...)` with `nextTick` to auto-focus and select the quantity input when checkbox is checked
    - _Requirements: 1.2, 1.3, 1.6_

  - [x] 1.2 Write property test: Quantity input visibility matches checkbox state (Property 1)
    - **Property 1: Quantity input visibility matches checkbox state**
    - For any sequence of checkbox toggles, the quantity input is visible iff the checkbox is checked
    - **Validates: Requirements 1.3, 1.4**

  - [x] 1.3 Write property test: Quantity input rejects non-positive values (Property 2)
    - **Property 2: Quantity input rejects non-positive values**
    - For any numeric value < 1, the quantity input constrains or rejects the value, ensuring submitted quantity is always ≥ 1
    - **Validates: Requirements 1.5**

- [x] 2. Add stock controls to the Scraper Modal template
  - [x] 2.1 Add `USeparator`, `UCheckbox`, `UFormField`, and `UInput` for stock controls in the modal `#body` slot
    - Insert after the Image URL field and before the modal `#footer`
    - `USeparator` with label "Initial Stock"
    - `UCheckbox` bound to `createStock` with label "Create Initial Stock" and description text
    - Conditional `UFormField` + `UInput` (type="number", min="1") bound to `stockQuantity` via `v-model.number`, with `ref="stockQuantityInput"`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 3. Extend `createPart` function with stock creation logic
  - [x] 3.1 Add sequential stock creation step after successful part creation
    - Import `AddStockDto` from `~/types/inventree`
    - After `await inventree.createPart(partData)` succeeds, check `createStock.value`
    - If checked, call `await inventree.addStock({ part: response.pk, quantity: stockQuantity.value, notes: 'Initial stock created with part' })`
    - Show success toast for stock with quantity in description
    - Wrap stock call in try/catch: on failure show error toast for stock, but still close modal (part already created)
    - Move `isModalOpen.value = false` to after both part and stock operations complete
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.2 Write property test: addStock called iff checkbox checked and part creation succeeds (Property 3)
    - **Property 3: addStock called if and only if checkbox checked and part creation succeeds**
    - For any valid form data and checkbox state, `addStock` is called exactly when checkbox is checked AND `createPart` succeeds
    - **Validates: Requirements 2.1, 2.5**

  - [x] 3.3 Write property test: Successful stock creation passes correct quantity and shows toasts (Property 4)
    - **Property 4: Successful stock creation passes correct quantity and shows toasts**
    - For any positive integer quantity where both operations succeed, `addStock` receives the exact quantity and both success toasts are displayed
    - **Validates: Requirements 2.2, 2.3**

- [x] 4. Checkpoint - Verify core functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add state reset on modal open
  - [x] 5.1 Reset `createStock` and `stockQuantity` in `lookupProduct` before opening the modal
    - Add `createStock.value = false` and `stockQuantity.value = 1` inside `lookupProduct`, after setting `partForm` and before `isModalOpen.value = true`
    - _Requirements: 3.1, 3.2_

  - [x] 5.2 Write property test: Stock controls reset on every modal open (Property 5)
    - **Property 5: Stock controls reset on every modal open**
    - For any sequence of modal interactions, each modal open resets checkbox to unchecked and quantity to 1
    - **Validates: Requirements 3.1, 3.2**

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All changes are in `app/pages/scan.vue` — no new files, types, or services needed
- Property tests use fast-check with vitest in `app/pages/__tests__/scan-stock.spec.ts`
- Each task references specific requirements for traceability
- Existing `InventreeService.addStock` and `AddStockDto` are reused as-is
