# Bugfix Requirements Document

## Introduction

When creating a new part via the Scraper Modal on the Scan Page (`/scan`) with "Create Initial Stock" and "Link Barcode to Stock Item" both checked, the barcode link API call fails with a 400 error. The root cause is in `InventreeService.addStock()`: when no existing stock is found and a new stock item is created via `POST /stock/`, the method returns the raw API response directly. This raw response may not have the `pk` field correctly accessible as a `StockItem`, so `stockItem.pk` is `undefined` when passed to `linkBarcode()`. The resulting barcode link request payload contains only the barcode and no stock item ID, causing the 400 error.

The bug only manifests on the "create new stock" code path (no pre-existing stock items for the part). The "add to existing stock" path works correctly because `addToExistingStock()` fetches and returns a properly structured `StockItem`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `addStock()` is called for a part with no existing stock items, THEN the system creates a new stock item via `POST /stock/` and returns the raw API response without ensuring the `pk` field is properly mapped to a `StockItem` interface.

1.2 WHEN the raw API response from `POST /stock/` is used as the `stockItem` return value and `stockItem.pk` is accessed in `scan.vue` to call `linkBarcode(currentBarcode, stockItem.pk)`, THEN `stockItem.pk` is `undefined`, causing the barcode link payload to contain only the barcode and no stock item ID.

1.3 WHEN the barcode link API (`POST /barcode/link/`) receives a payload with a missing or undefined `stockitem` field, THEN the API returns a 400 error and the barcode is not linked to the stock item.

### Expected Behavior (Correct)

2.1 WHEN `addStock()` is called for a part with no existing stock items, THEN the system SHALL create a new stock item via `POST /stock/` and return a properly structured `StockItem` object with a valid `pk` field.

2.2 WHEN the stock item is successfully created and the user has "Link Barcode to Stock Item" checked, THEN `linkBarcode()` SHALL receive a valid numeric `stockitem` primary key in its payload, and the barcode link API call SHALL succeed.

2.3 WHEN `addStock()` returns a `StockItem` from the "create new stock" path, THEN `stockItem.pk` SHALL be a positive integer matching the primary key of the newly created stock item in InvenTree.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `addStock()` is called for a part that already has existing stock items, THEN the system SHALL CONTINUE TO add to the first existing stock item via `addToExistingStock()` and return a properly structured `StockItem` with a valid `pk`.

3.2 WHEN `addStock()` is called without the barcode link feature (i.e., "Link Barcode to Stock Item" is unchecked), THEN the system SHALL CONTINUE TO create stock successfully regardless of the fix.

3.3 WHEN `addStock()` is called from any other caller (e.g., the Create Part Page at `/create-part`), THEN the system SHALL CONTINUE TO return a `StockItem` with the same interface and behavior as before.

3.4 WHEN `linkBarcode()` is called with a valid barcode and a valid stock item pk, THEN the system SHALL CONTINUE TO send the correct `POST /barcode/link/` payload and link the barcode successfully.

---

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type AddStockInput
  OUTPUT: boolean

  // The bug triggers when creating NEW stock (no existing stock items for the part)
  RETURN existingStockItems(X.part).length = 0
END FUNCTION
```

### Fix Checking Property

```pascal
// Property: Fix Checking - New stock creation returns valid StockItem with pk
FOR ALL X WHERE isBugCondition(X) DO
  result ← addStock'(X)
  ASSERT result.pk IS NOT undefined
  ASSERT result.pk IS a positive integer
  ASSERT typeof result.pk = "number"
END FOR
```

### Preservation Checking Property

```pascal
// Property: Preservation Checking - Existing stock path unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT addStock(X) = addStock'(X)
END FOR
```
