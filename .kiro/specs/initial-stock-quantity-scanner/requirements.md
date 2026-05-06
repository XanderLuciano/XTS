# Requirements Document

## Introduction

Add the ability to specify an initial stock quantity when creating new parts through the barcode scanner scraper modal on the Scan_Page (`/scan`). The Create_Part_Page (`/create-part`) already supports this via a checkbox and quantity input. This feature brings the same capability to the Scraper_Modal so users can create a part and its initial stock in a single step during the scan-and-import workflow.

## Glossary

- **Scan_Page**: The existing `/scan` route (`app/pages/scan.vue`) that handles barcode input, scan history, product lookup via web scraping, and part creation through the Scraper_Modal.
- **Scraper_Modal**: The modal dialog on the Scan_Page that opens after a successful product lookup. The Scraper_Modal displays scraped product data in an editable form and allows the user to create a part in InvenTree.
- **Create_Part_Page**: The existing `/create-part` route (`app/pages/create-part.vue`) that provides a standalone form for creating parts in InvenTree, including an initial stock option.
- **Initial_Stock_Controls**: The UI elements (a checkbox and a quantity input) that allow the user to opt in to creating stock and specify the quantity.
- **InventreeService**: The service class (`app/services/inventree.service.ts`) that provides methods for creating parts and adding stock via the InvenTree REST API.
- **InvenTree_API**: The InvenTree REST API used to create parts (`POST /api/part/`) and stock items (`POST /api/stock/`).

## Requirements

### Requirement 1: Initial Stock Controls in Scraper Modal

**User Story:** As a user, I want to see a checkbox and quantity input in the scraper modal, so that I can optionally specify an initial stock quantity when creating a part from scanned data.

#### Acceptance Criteria

1. THE Scraper_Modal SHALL display the Initial_Stock_Controls below the existing form fields and above the action buttons.
2. THE Initial_Stock_Controls SHALL include a "Create Initial Stock" checkbox that defaults to unchecked.
3. WHEN the "Create Initial Stock" checkbox is checked, THE Scraper_Modal SHALL display a numeric quantity input field with a default value of 1.
4. WHEN the "Create Initial Stock" checkbox is unchecked, THE Scraper_Modal SHALL hide the quantity input field.
5. THE quantity input field SHALL accept only positive integer values with a minimum value of 1.
6. WHEN the "Create Initial Stock" checkbox is checked and the quantity input becomes visible, THE Scraper_Modal SHALL automatically focus the quantity input and select its entire value so the user can immediately type a new quantity without manually highlighting the field.

### Requirement 2: Stock Creation on Part Submit

**User Story:** As a user, I want the system to automatically create initial stock after creating a part from the scraper modal, so that I don't have to navigate to a separate page to add stock.

#### Acceptance Criteria

1. WHEN the user submits the Scraper_Modal form with the "Create Initial Stock" checkbox unchecked, THE Scan_Page SHALL create the part without creating any stock items (preserving existing behavior).
2. WHEN the user submits the Scraper_Modal form with the "Create Initial Stock" checkbox checked, THE Scan_Page SHALL first create the part via the InvenTree_API and then create a stock item with the specified quantity using the InventreeService `addStock` method.
3. WHEN the part is created successfully and the stock item is created successfully, THE Scan_Page SHALL display a success toast notification for the part creation and a separate success toast notification for the stock addition including the quantity.
4. WHEN the part is created successfully but the stock creation fails, THE Scan_Page SHALL display a success toast for the part creation and an error toast for the stock failure, and SHALL keep the Scraper_Modal closed (the part was already created).
5. IF the part creation fails, THEN THE Scan_Page SHALL display an error toast and SHALL NOT attempt to create stock.

### Requirement 3: Form State Reset

**User Story:** As a user, I want the initial stock controls to reset after each part creation, so that the previous settings don't carry over to the next scan.

#### Acceptance Criteria

1. WHEN the Scraper_Modal is opened with new scraped data, THE Initial_Stock_Controls SHALL reset the checkbox to unchecked and the quantity to 1.
2. WHEN the Scraper_Modal is closed without submitting (via Cancel button, backdrop click, or Escape key), THE Initial_Stock_Controls SHALL retain no state that affects the next modal opening.
