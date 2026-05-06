# Requirements Document

## Introduction

Add the ability to link a scanned barcode to a newly created stock item when creating parts through the Scraper_Modal on the Scan_Page (`/scan`). When the user opts to create initial stock, a second checkbox ("Link Barcode to Stock Item") appears. If checked, the system calls InvenTree's barcode assignment API to associate the originally scanned barcode with the new stock item. This streamlines the workflow so users can scan, create a part, add stock, and link the barcode all in one step.

## Glossary

- **Scan_Page**: The existing `/scan` route (`app/pages/scan.vue`) that handles barcode input, scan history, product lookup via web scraping, and part creation through the Scraper_Modal.
- **Scraper_Modal**: The modal dialog on the Scan_Page that opens after a successful product lookup. The Scraper_Modal displays scraped product data in an editable form and allows the user to create a part in InvenTree.
- **Initial_Stock_Controls**: The existing UI elements (a "Create Initial Stock" checkbox and a quantity input) that allow the user to opt in to creating stock and specify the quantity.
- **Link_Barcode_Checkbox**: A new checkbox labeled "Link Barcode to Stock Item" that appears conditionally when the Initial_Stock_Controls checkbox is checked.
- **InventreeService**: The service class (`app/services/inventree.service.ts`) that provides methods for creating parts, adding stock, and (after this feature) linking barcodes via the InvenTree REST API.
- **Barcode_Link_API**: The InvenTree REST API endpoint `POST /api/barcode/link/` that accepts `{ barcode: "<string>", stockitem: <pk> }` to associate a barcode with a stock item.
- **Scan_History**: The `scanHistory` array on the Scan_Page that stores scanned barcodes with timestamps. The most recent entry at index 0 contains the barcode that triggered the current product lookup.

## Requirements

### Requirement 1: Link Barcode Checkbox in Scraper Modal

**User Story:** As a user, I want to see a "Link Barcode to Stock Item" checkbox in the scraper modal when I opt to create initial stock, so that I can choose to associate the scanned barcode with the new stock item.

#### Acceptance Criteria

1. WHEN the "Create Initial Stock" checkbox is checked, THE Scraper_Modal SHALL display the Link_Barcode_Checkbox below the stock quantity input.
2. WHEN the "Create Initial Stock" checkbox is unchecked, THE Scraper_Modal SHALL hide the Link_Barcode_Checkbox.
3. WHEN the Link_Barcode_Checkbox becomes visible, THE Link_Barcode_Checkbox SHALL default to checked.
4. THE Link_Barcode_Checkbox SHALL display the label "Link Barcode to Stock Item" with a description indicating which barcode will be linked.

### Requirement 2: Barcode Linking on Stock Creation

**User Story:** As a user, I want the system to automatically link the scanned barcode to the newly created stock item, so that future scans of the same barcode resolve to the correct stock item in InvenTree.

#### Acceptance Criteria

1. WHEN the user submits the Scraper_Modal form with both "Create Initial Stock" and "Link Barcode to Stock Item" checked, and the part and stock item are created successfully, THE Scan_Page SHALL call the Barcode_Link_API with the originally scanned barcode and the new stock item's primary key.
2. WHEN the barcode linking succeeds, THE Scan_Page SHALL display a success toast notification indicating the barcode was linked to the stock item.
3. WHEN the barcode linking fails, THE Scan_Page SHALL display an error toast notification with the failure reason, and SHALL NOT undo the part or stock creation (the part and stock item remain intact).
4. WHEN the user submits the Scraper_Modal form with "Create Initial Stock" checked but "Link Barcode to Stock Item" unchecked, THE Scan_Page SHALL create the part and stock without calling the Barcode_Link_API.
5. IF the stock creation fails, THEN THE Scan_Page SHALL NOT attempt to link the barcode (barcode linking depends on a valid stock item).

### Requirement 3: InventreeService Barcode Link Method

**User Story:** As a developer, I want a `linkBarcode` method on InventreeService, so that the barcode link API call is encapsulated in the service layer alongside other InvenTree API interactions.

#### Acceptance Criteria

1. THE InventreeService SHALL provide a `linkBarcode` method that accepts a barcode string and a stock item primary key.
2. WHEN `linkBarcode` is called, THE InventreeService SHALL send a POST request to the Barcode_Link_API with `{ barcode: "<barcode>", stockitem: <pk> }`.
3. IF the Barcode_Link_API returns an error, THEN THE InventreeService SHALL propagate the error to the caller.

### Requirement 4: Barcode Resolution from Scan History

**User Story:** As a user, I want the system to use the barcode I just scanned (the one that triggered the product lookup) for linking, so that I don't have to re-enter or select the barcode manually.

#### Acceptance Criteria

1. WHEN the Scraper_Modal opens after a product lookup, THE Scan_Page SHALL identify the barcode that triggered the lookup from the Scan_History (the barcode passed to the `lookupProduct` function).
2. THE Scan_Page SHALL use the identified barcode as the barcode value for the Barcode_Link_API call.
3. THE Link_Barcode_Checkbox description SHALL display the barcode value that will be linked, so the user can verify the correct barcode is being used.

### Requirement 5: Link Barcode State Reset

**User Story:** As a user, I want the link barcode checkbox to reset each time the scraper modal opens, so that previous settings don't carry over to the next scan.

#### Acceptance Criteria

1. WHEN the Scraper_Modal is opened with new scraped data, THE Link_Barcode_Checkbox state SHALL reset to checked (the default).
2. WHEN the Scraper_Modal is closed without submitting, THE Link_Barcode_Checkbox SHALL retain no state that affects the next modal opening.
