# Requirements Document

## Introduction

Add searchable dropdown selectors for part category and stock location in the Scraper_Modal on the Scan_Page (`/scan`). Currently, parts are created without a category and stock items are created without a location. This feature lets users assign a part category and a stock location during the scan-and-import workflow. Both selectors remember the last selected value via localStorage so users don't have to re-select the same location on every scan.

## Glossary

- **Scan_Page**: The existing `/scan` route (`app/pages/scan.vue`) that handles barcode input, scan history, product lookup via web scraping, and part creation through the Scraper_Modal.
- **Scraper_Modal**: The modal dialog on the Scan_Page that opens after a successful product lookup. The Scraper_Modal displays scraped product data in an editable form and allows the user to create a part in InvenTree.
- **Part_Category_Selector**: A new searchable dropdown in the Scraper_Modal that allows the user to select an InvenTree part category. The selected category is sent as the `category` field in the `CreatePartDto`.
- **Stock_Location_Selector**: A new searchable dropdown in the Scraper_Modal that allows the user to select an InvenTree stock location. The selected location is sent as the `location` field in the `AddStockDto`. Only visible when "Create Initial Stock" is checked.
- **InventreeService**: The service class (`app/services/inventree.service.ts`) that provides methods for creating parts, adding stock, and interacting with the InvenTree REST API.
- **InvenTree_Category_API**: The InvenTree REST API endpoint `GET /api/part/category/` that returns a list of part categories. Each category has `pk` (number) and `name` (string) fields.
- **InvenTree_Location_API**: The InvenTree REST API endpoint `GET /api/stock/location/` that returns a list of stock locations. Each location has `pk` (number) and `name` (string) fields.
- **Initial_Stock_Controls**: The existing UI elements (a "Create Initial Stock" checkbox, a quantity input, and a "Link Barcode to Stock Item" checkbox) that allow the user to opt in to creating stock during part creation.

## Requirements

### Requirement 1: Part Category Selector in Scraper Modal

**User Story:** As a user, I want to select a part category from a searchable dropdown in the scraper modal, so that I can assign the correct category when creating a part from scanned data.

#### Acceptance Criteria

1. THE Scraper_Modal SHALL display the Part_Category_Selector below the part image preview and above the form fields.
2. THE Part_Category_Selector SHALL be a searchable dropdown that allows the user to type to filter available categories.
3. WHEN the Scraper_Modal opens, THE Part_Category_Selector SHALL load the list of categories from the InvenTree_Category_API.
4. WHEN the user selects a category, THE Scraper_Modal SHALL use the selected category's `pk` as the `category` field in the `CreatePartDto` when creating the part.
5. WHEN no category is selected, THE Scraper_Modal SHALL send `null` as the `category` field in the `CreatePartDto` (preserving existing behavior).

### Requirement 2: Stock Location Selector in Scraper Modal

**User Story:** As a user, I want to select a stock location from a searchable dropdown when creating initial stock, so that I can specify where the new stock should be stored.

#### Acceptance Criteria

1. WHEN the "Create Initial Stock" checkbox is checked, THE Scraper_Modal SHALL display the Stock_Location_Selector within the Initial_Stock_Controls section.
2. WHEN the "Create Initial Stock" checkbox is unchecked, THE Scraper_Modal SHALL hide the Stock_Location_Selector.
3. THE Stock_Location_Selector SHALL be a searchable dropdown that allows the user to type to filter available locations.
4. WHEN the Scraper_Modal opens, THE Stock_Location_Selector SHALL load the list of locations from the InvenTree_Location_API.
5. WHEN the user selects a location, THE Scraper_Modal SHALL use the selected location's `pk` as the `location` field in the `AddStockDto` when creating stock.
6. WHEN no location is selected, THE Scraper_Modal SHALL send `null` as the `location` field in the `AddStockDto`.

### Requirement 3: Persist Last Selected Values via localStorage

**User Story:** As a user, I want the category and location dropdowns to default to my last selected values, so that I don't have to re-select the same values on every scan.

#### Acceptance Criteria

1. WHEN the user selects a category in the Part_Category_Selector, THE Scan_Page SHALL save the selected category `pk` to localStorage under a dedicated key.
2. WHEN the user selects a location in the Stock_Location_Selector, THE Scan_Page SHALL save the selected location `pk` to localStorage under a dedicated key.
3. WHEN the Scraper_Modal opens, THE Part_Category_Selector SHALL read the saved category `pk` from localStorage and pre-select the corresponding category if the saved value exists and matches a valid category from the InvenTree_Category_API.
4. WHEN the Scraper_Modal opens, THE Stock_Location_Selector SHALL read the saved location `pk` from localStorage and pre-select the corresponding location if the saved value exists and matches a valid location from the InvenTree_Location_API.
5. IF the saved category or location `pk` in localStorage does not match any value returned by the respective API, THEN THE selector SHALL default to no selection (null).

### Requirement 4: InventreeService Category and Location Methods

**User Story:** As a developer, I want methods on InventreeService to fetch part categories and stock locations, so that the API calls are encapsulated in the service layer.

#### Acceptance Criteria

1. THE InventreeService SHALL provide a `getCategories` method that returns a list of part categories from the InvenTree_Category_API.
2. THE InventreeService SHALL provide a `getLocations` method that returns a list of stock locations from the InvenTree_Location_API.
3. WHEN `getCategories` is called, THE InventreeService SHALL send a GET request to `/part/category/` and return the results as an array of objects with `pk` and `name` fields.
4. WHEN `getLocations` is called, THE InventreeService SHALL send a GET request to `/stock/location/` and return the results as an array of objects with `pk` and `name` fields.
5. IF the InvenTree_Category_API or InvenTree_Location_API returns an error, THEN THE InventreeService SHALL propagate the error to the caller.

### Requirement 5: Category and Location Passed to API on Part Creation

**User Story:** As a user, I want the selected category and location to be included in the API calls when creating a part and stock, so that the created items are properly categorized and located in InvenTree.

#### Acceptance Criteria

1. WHEN the user submits the Scraper_Modal form with a category selected, THE Scan_Page SHALL include the selected category `pk` in the `CreatePartDto` `category` field.
2. WHEN the user submits the Scraper_Modal form with "Create Initial Stock" checked and a location selected, THE Scan_Page SHALL include the selected location `pk` in the `AddStockDto` `location` field.
3. WHEN the user submits the Scraper_Modal form without a category selected, THE Scan_Page SHALL send `null` as the `category` field in the `CreatePartDto`.
4. WHEN the user submits the Scraper_Modal form with "Create Initial Stock" checked but no location selected, THE Scan_Page SHALL send `null` as the `location` field in the `AddStockDto`.
