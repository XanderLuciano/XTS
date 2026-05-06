# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** — `POST /stock/` returns `StockItem[]` (array), not a single `StockItem`
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - Create test file `app/services/__tests__/stock/addStock.bugCondition.test.ts`
  - Mock `this.api` so that:
    - `GET /stock/?part=X&in_stock=true` returns `[]` (no existing stock — bug condition)
    - `POST /stock/` returns `[{ pk: 42, part: partId, quantity: qty, ... }]` (array, as the real API does)
  - Write a test: call `addStock({ part: partId, quantity, location: null, notes: '' })` and assert:
    - `result.pk` is a positive integer (not `undefined`)
    - `typeof result.pk === 'number'`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS — `result.pk` is `undefined` because the array is returned directly
  - Document the counterexample: `addStock()` returns the raw array, so `.pk` is `undefined`
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Existing stock path unchanged
  - Create test file `app/services/__tests__/stock/addStock.preservation.test.ts`
  - Mock `this.api` so that `GET /stock/?part=X&in_stock=true` returns existing stock items
  - Write property-based test with fast-check: for all `(partId, quantity, existingStock)` where `existingStock.length > 0`:
    - Assert `addStock()` delegates to `addToExistingStock()` (calls `POST /stock/add/`)
    - Assert `POST /stock/` (create new) is NOT called
    - Assert result has a valid `pk` matching the existing item
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix `addStock()` — unwrap the array returned by `POST /stock/`

  - [x] 3.1 Implement the fix in `app/services/inventree.service.ts`
    - In the "create new stock" branch of `addStock()`, capture the response and unwrap the array:
    ```typescript
    const created = await this.api('/stock/', {
      method: 'POST',
      body: data
    }) as StockItem[]

    const item = Array.isArray(created) ? created[0] : created
    if (!item?.pk) {
      throw new Error('Failed to retrieve pk from created stock item')
    }
    return item
    ```
    - Do NOT modify `addToExistingStock()`, `linkBarcode()`, or any other methods
    - Do NOT modify `scan.vue`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

  - [x] 3.2 Verify bug condition exploration test now passes
    - Re-run `npx vitest run app/services/__tests__/stock/addStock.bugCondition.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES — `result.pk` is now a valid integer
    - _Requirements: 2.1, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - Re-run `npx vitest run app/services/__tests__/stock/addStock.preservation.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS — existing stock path unchanged
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Checkpoint — run full test suite
  - Run `npx vitest run`
  - Ensure all existing tests still pass (no regressions)
