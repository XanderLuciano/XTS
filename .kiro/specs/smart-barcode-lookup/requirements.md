# Requirements Document

## Introduction

Enhance the scanner page (`/scan`) so that when a barcode is scanned, the system automatically checks whether that barcode exists in the InvenTree inventory management system. If the barcode is found, the scanner page displays the associated part information (name, image, stock level, description) similar to how the checkout page presents resolved parts. If the barcode is not found in InvenTree, the scanner page presents the existing manufacturer lookup and part creation workflow. This turns the scanner page into a single entry point for both identifying existing parts and onboarding new ones.

## Glossary

- **Scanner_Page**: The existing `/scan` route (`app/pages/scan.vue`) that handles barcode input, scan history, manufacturer lookup, and part creation.
- **Inventory_System**: The InvenTree backend accessed via the InventreeService, which stores parts, stock items, and barcode associations.
- **Barcode_Lookup**: The process of querying the Inventory_System barcode API (`/barcode/`) to determine whether a scanned barcode is associated with an existing part or stock item.
- **Part_Info_Display**: A UI section that shows the details of a resolved part, including name, IPN, description, image, stock level, and link.
- **Manufacturer_Lookup**: The existing workflow that scrapes manufacturer websites (Hoffmann Group or Sandvik Coromant) to retrieve product data for a barcode not found in the Inventory_System.
- **Part_Creation_Flow**: The existing modal workflow on the Scanner_Page that allows the user to create a new part in the Inventory_System from scraped manufacturer data.
- **Scan_Record**: An entry in the scan history list containing the barcode value, timestamp, barcode type, and the result of the Barcode_Lookup.

## Requirements

### Requirement 1: Automatic Inventory Lookup on Scan

**User Story:** As a warehouse operator, I want the system to automatically check if a scanned barcode exists in the inventory system, so that I can immediately know whether a part is already tracked.

#### Acceptance Criteria

1. WHEN a barcode is added to the scan history (via manual input or camera scan), THE Scanner_Page SHALL initiate a Barcode_Lookup against the Inventory_System using the InventreeService `scanBarcode` method.
2. WHILE the Barcode_Lookup is in progress, THE Scanner_Page SHALL display a loading indicator on the corresponding Scan_Record.
3. WHEN the Barcode_Lookup completes successfully and a part is found, THE Scanner_Page SHALL store the resolved part data on the corresponding Scan_Record.
4. WHEN the Barcode_Lookup completes and no part is found, THE Scanner_Page SHALL mark the corresponding Scan_Record as unrecognized.
5. IF the Barcode_Lookup fails due to a network or server error, THEN THE Scanner_Page SHALL mark the corresponding Scan_Record with an error state and display the error message.

### Requirement 2: Display Part Information for Recognized Barcodes

**User Story:** As a warehouse operator, I want to see all relevant part details when a scanned barcode is recognized, so that I can verify the part identity and check stock levels without navigating to another page.

#### Acceptance Criteria

1. WHEN a Scan_Record has a resolved part, THE Scanner_Page SHALL display the Part_Info_Display showing the part name, IPN, description, stock level, and link.
2. WHEN a Scan_Record has a resolved part with an image or thumbnail, THE Scanner_Page SHALL display the part image in the Part_Info_Display.
3. WHEN a Scan_Record has a resolved part, THE Scanner_Page SHALL display a visual badge or indicator confirming the barcode is recognized in the Inventory_System.
4. WHEN a Scan_Record has a resolved part, THE Scanner_Page SHALL hide the Manufacturer_Lookup button for that Scan_Record.

### Requirement 3: Display Lookup and Creation Options for Unrecognized Barcodes

**User Story:** As a warehouse operator, I want to see options to look up and create a part when a scanned barcode is not in the system, so that I can quickly onboard new parts.

#### Acceptance Criteria

1. WHEN a Scan_Record is marked as unrecognized, THE Scanner_Page SHALL display a visual badge or indicator showing the barcode is not found in the Inventory_System.
2. WHEN a Scan_Record is marked as unrecognized, THE Scanner_Page SHALL display the Manufacturer_Lookup button for that Scan_Record.
3. WHEN a Scan_Record is marked as unrecognized, THE Scanner_Page SHALL display a "Create Part" button that navigates the user to the Part_Creation_Flow.
4. WHEN the user clicks the Manufacturer_Lookup button on an unrecognized Scan_Record, THE Scanner_Page SHALL execute the existing manufacturer scraping workflow and open the Part_Creation_Flow modal with the scraped data.

### Requirement 4: Scan Record State Management

**User Story:** As a warehouse operator, I want each scan record to clearly reflect its lookup status, so that I can quickly distinguish between recognized, unrecognized, and pending barcodes.

#### Acceptance Criteria

1. THE Scanner_Page SHALL assign each Scan_Record one of the following states: `loading`, `found`, `not_found`, or `error`.
2. WHEN a Scan_Record is in the `loading` state, THE Scanner_Page SHALL display a spinner or loading animation on that record.
3. WHEN a Scan_Record is in the `found` state, THE Scanner_Page SHALL apply a distinct visual style (such as a green background or border) to that record.
4. WHEN a Scan_Record is in the `not_found` state, THE Scanner_Page SHALL apply a distinct visual style (such as an amber or neutral background) to that record.
5. WHEN a Scan_Record is in the `error` state, THE Scanner_Page SHALL apply a distinct visual style (such as a red background) and display the error message on that record.
6. THE Scanner_Page SHALL persist the lookup state of each Scan_Record to localStorage alongside the existing scan history data.

### Requirement 5: Re-lookup Capability

**User Story:** As a warehouse operator, I want to retry a barcode lookup after an error or after creating a new part, so that I can confirm the barcode is now recognized.

#### Acceptance Criteria

1. WHEN a Scan_Record is in the `error` state, THE Scanner_Page SHALL display a "Retry" button on that record.
2. WHEN the user clicks the "Retry" button, THE Scanner_Page SHALL re-initiate the Barcode_Lookup for that Scan_Record and update the state accordingly.
3. WHEN a Scan_Record is in the `not_found` state, THE Scanner_Page SHALL display a "Re-check" button on that record.
4. WHEN the user clicks the "Re-check" button, THE Scanner_Page SHALL re-initiate the Barcode_Lookup for that Scan_Record and update the state accordingly.

### Requirement 6: Part Creation Callback

**User Story:** As a warehouse operator, I want the scan record to update automatically after I create a new part, so that I can see the barcode is now recognized without manual re-checking.

#### Acceptance Criteria

1. WHEN the Part_Creation_Flow modal closes after a successful part creation with barcode linking enabled, THE Scanner_Page SHALL automatically re-initiate the Barcode_Lookup for the corresponding Scan_Record.
2. WHEN the automatic re-lookup after part creation resolves a part, THE Scanner_Page SHALL update the Scan_Record state to `found` and display the Part_Info_Display.
