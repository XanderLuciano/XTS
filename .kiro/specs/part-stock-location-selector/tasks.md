# Implementation Plan: Part Category & Stock Location Selectors

## Overview

The implementation adds `PartCategory` and `StockLocation` interfaces to `app/types/inventree.ts`, two new service methods (`getCategories`, `getLocations`) to `app/services/inventree.service.ts`, and extends `app/pages/scan.vue` with reactive state, localStorage persistence, fetch-on-mount logic, two `USelectMenu` dropdowns, and wiring the selected values into `createPart`/`addStock`. Tests go in `app/pages/__tests__/scan-category-location.spec.ts`, following the same pattern as `scan-barcode-link.spec.ts`.

## Tasks

- [x] 1. Add type interfaces and service methods
  - [x] 1.1 Add `PartCategory` and `StockLocation` interfaces to `app/types/inventree.ts`
    - Add `export interface PartCategory { pk: number; name: string }` and `export interface StockLocation { pk: number; name: string }`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 1.2 Add `getCategories()` and `getLocations()` methods to `app/services/inventree.service.ts`
    - Add `async getCategories(): Promise<PartCategory[]>` that GETs `/part/category/` and returns `Array.isArray(response) ? response : response?.results || []`
    - Add `async getLocations(): Promise<StockLocation[]>` that GETs `/stock/location/` and returns the same pattern
    - Import `PartCategory` and `StockLocation` from `~/types/inventree`
    - Errors propagate to the caller (no internal catch)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.3 Write property test: Service methods extract results from paginated API responses (Property 6)
    - **Property 6: Service methods extract results from paginated API responses**
    - For any array of category/location objects, when the API returns `{ results: [...] }`, `getCategories()`/`getLocations()` return the same array. When the API returns a plain array, the methods return it directly.
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 2. Checkpoint - Verify service layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add reactive state, fetch on mount, and localStorage persistence in `scan.vue`
  - [x] 3.1 Add reactive state and fetch categories/locations on page mount
    - Import `PartCategory` and `StockLocation` from `~/types/inventree`
    - Add `const categories = ref<PartCategory[]>([])`, `const locations = ref<StockLocation[]>([])`, `const selectedCategory = ref<PartCategory | null>(null)`, `const selectedLocation = ref<StockLocation | null>(null)`
    - In the existing `onMounted` hook that loads scan history, fetch categories and locations via `useInventreeApi()`, each in its own try/catch (log errors, don't throw)
    - After fetching, read `inventree_last_category` and `inventree_last_location` from localStorage, find matching items by pk, and pre-select them
    - _Requirements: 1.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2_

  - [x] 3.2 Add watchers for localStorage persistence
    - Add `watch(selectedCategory, ...)` that saves/removes `inventree_last_category` based on whether a category is selected
    - Add `watch(selectedLocation, ...)` that saves/removes `inventree_last_location` based on whether a location is selected
    - _Requirements: 3.1, 3.2_

  - [x] 3.3 Write property test: Category localStorage round-trip (Property 4)
    - **Property 4: Category localStorage round-trip**
    - For any list of part categories and any category selected from that list, saving the category pk to localStorage and restoring it produces the same selected category. If the saved pk doesn't match any category, selection is null.
    - **Validates: Requirements 3.1, 3.3, 3.5**

  - [x] 3.4 Write property test: Location localStorage round-trip (Property 5)
    - **Property 5: Location localStorage round-trip**
    - For any list of stock locations and any location selected from that list, saving the location pk to localStorage and restoring it produces the same selected location. If the saved pk doesn't match any location, selection is null.
    - **Validates: Requirements 3.2, 3.4, 3.5**

- [x] 4. Add selector dropdowns to the Scraper Modal template
  - [x] 4.1 Add Part Category `USelectMenu` below the image preview in the left column
    - Add a `div` with a label "Part Category" and `USelectMenu` bound to `selectedCategory`, with `searchable`, `option-attribute="name"`, `value-attribute="pk"`, `placeholder="Select category..."`
    - Always visible when modal is open
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 4.2 Add Stock Location `USelectMenu` inside the Initial Stock Controls section
    - Add a `UFormField` with `v-if="createStock"`, label "Stock Location", containing `USelectMenu` bound to `selectedLocation`, with `searchable`, `option-attribute="name"`, `value-attribute="pk"`, `placeholder="Select location..."`
    - Place after the Stock Quantity `UFormField`, before the Link Barcode checkbox
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 4.3 Write property test: Location selector visibility matches createStock state (Property 2)
    - **Property 2: Location selector visibility matches createStock checkbox state**
    - For any sequence of "Create Initial Stock" checkbox toggles, the Stock Location Selector is visible iff createStock is checked.
    - **Validates: Requirements 2.1, 2.2**

- [x] 5. Wire selected values into `createPart` and `lookupProduct`
  - [x] 5.1 Include selected category pk in `CreatePartDto` inside `createPart`
    - Add `category: selectedCategory.value?.pk ?? null` to the `partData` object
    - _Requirements: 1.4, 1.5, 5.1, 5.3_

  - [x] 5.2 Include selected location pk in `AddStockDto` inside `createPart`
    - Add `location: selectedLocation.value?.pk ?? null` to the `stockData` object
    - _Requirements: 2.5, 2.6, 5.2, 5.4_

  - [x] 5.3 Restore selectors to localStorage defaults in `lookupProduct`
    - After existing resets (`createStock.value = false`, etc.) and before `isModalOpen.value = true`, read `inventree_last_category` and `inventree_last_location` from localStorage and set `selectedCategory`/`selectedLocation` to the matching item or null
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 5.4 Write property test: Selected category pk (or null) is passed to CreatePartDto (Property 1)
    - **Property 1: Selected category pk (or null) is passed to CreatePartDto**
    - For any optional part category, the `category` field in `CreatePartDto` equals the selected category's pk if selected, or null if not.
    - **Validates: Requirements 1.4, 1.5, 5.1, 5.3**

  - [x] 5.5 Write property test: Selected location pk (or null) is passed to AddStockDto (Property 3)
    - **Property 3: Selected location pk (or null) is passed to AddStockDto**
    - For any optional stock location, the `location` field in `AddStockDto` equals the selected location's pk if selected, or null if not.
    - **Validates: Requirements 2.5, 2.6, 5.2, 5.4**

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Changes touch three files: `app/types/inventree.ts` (new interfaces), `app/services/inventree.service.ts` (new methods), `app/pages/scan.vue` (state, template, logic)
- No new components or composables are created
- Property tests use fast-check with vitest in `app/pages/__tests__/scan-category-location.spec.ts`
- Each task references specific requirements for traceability
- Categories and locations are fetched once on page mount, not on every modal open
- localStorage keys: `inventree_last_category`, `inventree_last_location`
