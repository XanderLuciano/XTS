# Barcode Link Stock Fix — Bugfix Design

## Overview

When creating a new part with "Create Initial Stock" and "Link Barcode to Stock Item" both checked, the barcode link API call fails with a 400 error. The bug is in `InventreeService.addStock()`: when no existing stock items exist for the part, the method creates a new stock item via `POST /stock/` and returns the raw API response directly. The InvenTree `POST /stock/` endpoint returns `StockItem[]` (an array), not a single `StockItem`. The code returns this array as-is, so `stockItem.pk` is `undefined` (accessing `.pk` on an array), causing the `POST /barcode/link/` payload to be malformed.

The fix unwraps the array by taking `[0]` from the response — no secondary GET needed.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — `addStock()` is called for a part with zero existing stock items (the "create new stock" path).
- **Property (P)**: The desired behavior — `addStock()` returns a `StockItem` with a valid numeric `pk` field for all code paths.
- **Preservation**: The "add to existing stock" code path, all other `InventreeService` methods, and the `scan.vue` caller logic must remain unchanged.
- **`addStock()`**: The method in `app/services/inventree.service.ts` that either adds to existing stock or creates new stock for a given part.
- **`addToExistingStock()`**: The method that correctly fetches the updated stock item after the bulk add endpoint, returning a proper `StockItem`.
- **`linkBarcode()`**: The method in `InventreeService` that POSTs to `/barcode/link/` with `{ barcode, stockitem: pk }`.

## Bug Details

### Bug Condition

The bug manifests when `addStock()` is called for a part that has no existing stock items. The method hits the "create new stock" branch, calls `POST /stock/` via `this.api(...)`, and returns the raw response. The InvenTree `POST /stock/` API returns `StockItem[]` (an array, even for a single item), but the code returns this array directly typed as `StockItem`. The caller accesses `.pk` on the array, which is `undefined`.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type AddStockDto
  OUTPUT: boolean

  existingItems ← getStockItems(input.part)
  RETURN existingItems.length = 0
END FUNCTION
```

### Examples

- **Example 1**: User creates part "Drill Bit X" with IPN "DB-001", checks "Create Initial Stock" (qty 1) and "Link Barcode" with barcode "4012345678901". `addStock()` hits the new-stock path, returns raw response. `stockItem.pk` is `undefined`. `linkBarcode("4012345678901", undefined)` sends `{ barcode: "4012345678901", stockitem: undefined }` → API returns 400.
- **Example 2**: Same scenario but with quantity 5 and a different barcode "5901234123457". Same failure — `stockItem.pk` is `undefined`, barcode link fails.
- **Example 3**: User creates part with "Create Initial Stock" checked but "Link Barcode" unchecked. `addStock()` still returns the raw response, but `linkBarcode()` is never called. The bug is latent — stock is created but the returned object is malformed. No visible error in this case.
- **Edge case**: User creates a part where existing stock already exists (e.g., duplicate IPN scenario that passed the check). `addStock()` takes the existing-stock path via `addToExistingStock()`, which correctly fetches and returns a proper `StockItem`. No bug.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The "add to existing stock" code path in `addStock()` must continue to call `addToExistingStock()` and return a properly structured `StockItem` with a valid `pk`.
- `addToExistingStock()` itself must not be modified.
- The `linkBarcode()` method must continue to POST `{ barcode, stockitem: pk }` to `/barcode/link/`.
- The `scan.vue` caller logic (the `createPart` function) must not need changes — it already correctly uses `stockItem.pk` from the `addStock()` return value.
- All other `InventreeService` methods (`createPart`, `getStockItems`, `removeStock`, `adjustStock`, `scanBarcode`, etc.) must remain unchanged.
- The `/create-part` page or any other caller of `addStock()` must continue to work identically.

**Scope:**
All inputs where `isBugCondition` is false (i.e., existing stock items exist for the part) should be completely unaffected by this fix. This includes:
- Adding stock to parts that already have stock items
- All non-stock-related operations (part creation, barcode scanning, category/location fetching)
- The `linkBarcode()` method itself (it already works correctly when given a valid `pk`)

## Confirmed Root Cause

Validated against the InvenTree API schema ([docs.inventree.org/en/stable/api/schema/stock/](https://docs.inventree.org/en/stable/api/schema/stock/)):

**`POST /stock/` returns an array of `StockItem`, not a single object.**

The endpoint supports creating multiple stock items in one call (via the `serial_numbers` field), so the response schema is `StockItem[]`. The current code returns this array directly:

```typescript
return await this.api('/stock/', { method: 'POST', body: data })
// Returns StockItem[] but is typed as StockItem
// Caller accesses .pk on an array → undefined
```

This is the exact cause of `stockItem.pk` being `undefined` when passed to `linkBarcode()`.

**What the API actually returns:**
- `POST /stock/` → `StockItem[]` (array, always — even for a single item)
- `GET /stock/` → `{ count, next, previous, results: StockItem[] }` (paginated wrapper)
- `POST /stock/add/` → `StockAdjustmentItem` (no `pk`, which is why `addToExistingStock()` does a follow-up GET)

**Note:** The design's original fetch-after-create hypothesis was incorrect. `POST /stock/` does include `pk` in the response — it's just wrapped in an array. No secondary GET is needed.

## Correctness Properties

Property 1: Bug Condition — New stock creation returns valid StockItem with pk

_For any_ `AddStockDto` input where the bug condition holds (no existing stock items for the part), the fixed `addStock()` function SHALL return a `StockItem` object where `pk` is a positive integer matching the primary key of the newly created stock item.

**Validates: Requirements 2.1, 2.3**

Property 2: Preservation — Existing stock path unchanged

_For any_ `AddStockDto` input where the bug condition does NOT hold (existing stock items exist for the part), the fixed `addStock()` function SHALL produce the same result as the original function, preserving the `addToExistingStock()` delegation and returning a properly structured `StockItem`.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

**File**: `app/services/inventree.service.ts`

**Function**: `addStock()`

**Specific Change**: The "create new stock" branch returns the raw `POST /stock/` response, which is `StockItem[]`. Take index `[0]` since we always create a single item:

```typescript
// 3. Otherwise, create new stock item
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

This is a one-liner fix — no secondary GET needed. `POST /stock/` already returns the full `StockItem` with `pk`, it's just wrapped in an array.

**No changes to any other methods.** `addToExistingStock()`, `linkBarcode()`, `scan.vue`, and all other callers remain untouched.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that mock `this.api` to return realistic `POST /stock/` responses and verify that `addStock()` returns a `StockItem` with a valid `pk`. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **New stock creation — pk access**: Call `addStock()` with a part that has no existing stock. Assert `result.pk` is a positive integer. (will fail on unfixed code if the raw response shape differs)
2. **New stock creation — linkBarcode integration**: Call `addStock()` then pass `result.pk` to `linkBarcode()`. Assert the barcode link payload contains a numeric `stockitem`. (will fail on unfixed code)
3. **New stock creation — response shape**: Call `addStock()` and assert the returned object conforms to the `StockItem` interface (has `pk`, `part`, `quantity` fields). (may fail on unfixed code)

**Expected Counterexamples**:
- `addStock()` returns an object where `pk` is `undefined` or missing
- `linkBarcode()` receives `undefined` as the `stockItemPk` parameter
- Possible causes: raw API response has a different structure than `StockItem`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result ← addStock'(input)
  ASSERT result.pk IS NOT undefined
  ASSERT result.pk IS a positive integer
  ASSERT typeof result.pk = "number"
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT addStock(input) = addStock'(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for the existing-stock path, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Existing stock path preservation**: Verify that when existing stock items exist, `addStock()` still delegates to `addToExistingStock()` and returns a valid `StockItem` with the correct `pk`.
2. **Other method preservation**: Verify that `linkBarcode()`, `createPart()`, `getStockItems()`, and other methods are not affected by the change.
3. **Caller preservation**: Verify that `scan.vue`'s `createPart` function continues to work correctly for the existing-stock path.

### Unit Tests

- Test `addStock()` new-stock path returns `StockItem` with valid `pk` after fix
- Test `addStock()` new-stock path throws if the created item cannot be fetched
- Test `addStock()` existing-stock path continues to work unchanged
- Test end-to-end: `addStock()` → `linkBarcode()` succeeds with the returned `pk`

### Property-Based Tests

- Generate random `AddStockDto` inputs with no existing stock (bug condition) and verify `addStock()` returns a `StockItem` with a positive integer `pk`
- Generate random `AddStockDto` inputs with existing stock (preservation) and verify `addStock()` delegates to `addToExistingStock()` and returns the same result as before
- Generate random barcode strings and stock item pks, verify `linkBarcode()` payload is well-formed

### Integration Tests

- Test full flow: create part → add stock (new) → link barcode — all succeed
- Test full flow: create part → add stock (existing) → link barcode — all succeed (preservation)
- Test that the 400 error from `/barcode/link/` no longer occurs when stock is created via the new-stock path
