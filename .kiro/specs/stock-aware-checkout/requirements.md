# Requirements Document

## Introduction

Enhance the self-checkout page (`/checkout`) so that it understands *what type of item* a scanned barcode points at. Today every scanned barcode is resolved to a parent Part and only the part-level stock total is shown. InvenTree barcodes are, however, primarily linked to individual Stock_Items (a specific batch / receipt of a part), with the Part data pulled up only for display.

This feature makes the cart "stock-aware":

- When a barcode resolves to a specific Stock_Item, the cart shows both the total stock across the whole part **and** the quantity available in that specific stock item (batch).
- A new "Add full quantity" option lets the operator add the full available quantity in a single scan. The meaning of "full" depends on what was scanned: scanning a Part barcode adds the full quantity across all stock items for that part, while scanning a Stock_Item barcode adds the full quantity of just that stock item.
- When a Stock_Item barcode is checked out, the stock removal targets that specific stock item rather than distributing the removal across all of the part's stock items.

This anticipates a future workflow where Part-level barcodes are also printed for bulk operations across all stock items, while preserving today's per-stock-item barcode tracking.

## Glossary

- **Kiosk_Page**: The self-checkout Vue page (`app/pages/checkout.vue`).
- **Cart**: The temporary collection of items the operator intends to remove from stock, managed by `useCheckoutCart`.
- **Cart_Item**: An individual entry in the Cart containing barcode, quantity, scan type, resolved Part, and (when applicable) resolved Stock_Item.
- **Inventory_System**: The InvenTree backend accessed via `InventreeService`.
- **Part**: An InvenTree inventory part. Exposes `in_stock` (total quantity across all of its stock items).
- **Stock_Item**: A physical stock line in InvenTree associated with a Part, with its own `quantity`, `batch`, and `barcode_hash`.
- **Scan_Type**: A classification of a scanned barcode as either `part` (resolved only to a Part) or `stock_item` (resolved to a specific Stock_Item).
- **Barcode_Lookup**: Resolving a scanned barcode against the Inventory_System via `InventreeService.scanBarcodeWithStock`, which returns both the Part and (when linked) the Stock_Item.
- **Add_Full_Quantity**: A page-level toggle that, when enabled, causes a scan to add the full available quantity for the scanned item instead of incrementing by one.
- **Part_Stock_Total**: The total quantity available across all stock items for a Part (`part.in_stock`).
- **Stock_Item_Quantity**: The quantity available in a specific Stock_Item (`stockItem.quantity`).

## Requirements

### Requirement 1: Scan-Type-Aware Barcode Lookup

**User Story:** As a warehouse operator, I want the checkout to recognize whether I scanned a part barcode or a specific stock item barcode, so that it can show and act on the most relevant information.

#### Acceptance Criteria

1. WHEN a barcode is added to the Cart, THE Kiosk_Page SHALL resolve it via `InventreeService.scanBarcodeWithStock` to obtain both the Part and any linked Stock_Item.
2. WHEN the Barcode_Lookup resolves a Stock_Item, THE Kiosk_Page SHALL set the Cart_Item Scan_Type to `stock_item` and store the resolved Stock_Item on the Cart_Item.
3. WHEN the Barcode_Lookup resolves a Part but no Stock_Item, THE Kiosk_Page SHALL set the Cart_Item Scan_Type to `part` and leave the Stock_Item unset.
4. WHEN the Barcode_Lookup resolves neither a Part nor a Stock_Item, THE Kiosk_Page SHALL set the Cart_Item to an error state with a "barcode not found" message.
5. IF the Barcode_Lookup fails due to a network or server error, THEN THE Kiosk_Page SHALL set the Cart_Item to an error state and display the error message.
6. WHILE the search mode is `part` (Part Search), THE Kiosk_Page SHALL treat resolved results as Scan_Type `part` with no specific Stock_Item.

### Requirement 2: Display Part and Stock Item Totals

**User Story:** As a warehouse operator, I want to see both the total stock for a part and the quantity in the specific batch I scanned, so that I know exactly how much exists overall and in the line I'm holding.

#### Acceptance Criteria

1. WHEN a Cart_Item is loaded, THE Kiosk_Page SHALL display the Part_Stock_Total for the resolved Part.
2. WHEN a Cart_Item has Scan_Type `stock_item`, THE Kiosk_Page SHALL additionally display the Stock_Item_Quantity for the scanned Stock_Item.
3. WHEN a Cart_Item has Scan_Type `stock_item` AND the Stock_Item has a batch value, THE Kiosk_Page SHALL display the batch identifier alongside the Stock_Item_Quantity.
4. WHEN a Cart_Item has Scan_Type `part`, THE Kiosk_Page SHALL display only the Part_Stock_Total and SHALL NOT display a Stock_Item_Quantity.
5. WHEN a Cart_Item has Scan_Type `stock_item`, THE Kiosk_Page SHALL provide a visual indicator distinguishing it from a part-level scan.

### Requirement 3: Add Full Quantity Option

**User Story:** As a warehouse operator, I want a toggle that adds the full available quantity of whatever I scan, so that I can check out an entire batch or an entire part's stock without manually typing the number.

#### Acceptance Criteria

1. THE Kiosk_Page SHALL display an "Add full quantity" toggle control.
2. THE Kiosk_Page SHALL persist the state of the Add_Full_Quantity toggle across page reloads.
3. WHILE Add_Full_Quantity is disabled, WHEN a barcode is scanned, THE Kiosk_Page SHALL add or increment the Cart_Item by one unit (existing behavior).
4. WHILE Add_Full_Quantity is enabled, WHEN a barcode resolves with Scan_Type `stock_item`, THE Kiosk_Page SHALL set the Cart_Item quantity to the Stock_Item_Quantity of the scanned Stock_Item.
5. WHILE Add_Full_Quantity is enabled, WHEN a barcode resolves with Scan_Type `part`, THE Kiosk_Page SHALL set the Cart_Item quantity to the Part_Stock_Total of the resolved Part.
6. WHILE Add_Full_Quantity is enabled, WHEN a barcode that already exists in the Cart is scanned again, THE Kiosk_Page SHALL set (not further increment) the Cart_Item quantity to the full available quantity for that item.
7. WHILE Add_Full_Quantity is enabled, IF the resolved full quantity is zero or undefined at scan time, THEN THE Kiosk_Page SHALL add the Cart_Item with a quantity of one as a fallback.

### Requirement 4: Stock-Item-Targeted Checkout

**User Story:** As a warehouse operator, I want a checkout of a scanned stock item to draw down that exact batch, so that the physical batch I'm holding matches what the system records.

#### Acceptance Criteria

1. WHEN a Cart_Item with Scan_Type `stock_item` is checked out, THE Kiosk_Page SHALL remove the requested quantity from the specific scanned Stock_Item only.
2. WHEN a Cart_Item with Scan_Type `part` is checked out, THE Kiosk_Page SHALL distribute the removal across the part's stock items (existing behavior).
3. IF a Cart_Item with Scan_Type `stock_item` requests a quantity greater than the scanned Stock_Item_Quantity, THEN THE Kiosk_Page SHALL prevent checkout and surface a stock warning for that item.
4. WHEN a stock-item-targeted removal completes, THE Kiosk_Page SHALL record the removal note with the scanned barcode for traceability (existing behavior preserved).
5. WHEN a receipt is generated for a stock-item-targeted removal, THE Kiosk_Page SHALL attribute the removed quantity to the scanned Stock_Item.

### Requirement 5: Stock Warning Accuracy

**User Story:** As a warehouse operator, I want stock warnings to reflect the relevant availability, so that I'm warned before requesting more than exists.

#### Acceptance Criteria

1. WHEN a Cart_Item has Scan_Type `stock_item`, THE Kiosk_Page SHALL evaluate stock warnings against the Stock_Item_Quantity.
2. WHEN a Cart_Item has Scan_Type `part`, THE Kiosk_Page SHALL evaluate stock warnings against the Part_Stock_Total (existing behavior).
3. WHEN any Cart_Item has a stock warning, THE Kiosk_Page SHALL disable checkout and indicate which item exceeds availability.

### Requirement 6: Backward Compatibility

**User Story:** As a warehouse operator, I want the existing checkout workflow to keep working unchanged when I'm not using the new options, so that my current habits are not disrupted.

#### Acceptance Criteria

1. THE Kiosk_Page SHALL default the Add_Full_Quantity toggle to disabled on first use.
2. WHILE Add_Full_Quantity is disabled, THE Kiosk_Page SHALL preserve the existing scan-to-increment-by-one behavior for all Scan_Types.
3. WHEN a barcode resolves only to a Part (no Stock_Item), THE Kiosk_Page SHALL behave equivalently to the current checkout for that item.
4. THE Kiosk_Page SHALL preserve existing void, clear, quantity-edit, receipt, and checkout-reason behaviors.
