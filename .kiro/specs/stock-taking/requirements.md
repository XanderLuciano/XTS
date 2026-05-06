# Requirements Document

## Introduction

The Stock Taking feature adds a new page/module to the InvenTree webapp (Nuxt 4 + NuxtUI) that enables users to perform physical stock takes. Users scan barcodes (or search parts) to build a running log of items, verify or adjust the system's stock counts, and submit all adjustments in bulk. The system computes the delta between the confirmed count and the current system count, then uses the existing InvenTree stock add/remove endpoints to reconcile. The log persists to localStorage until cleared or applied.

## Glossary

- **Stock_Taking_Page**: The new page at `/stock-taking` where users perform physical stock takes
- **Stock_Taking_Log**: The running list of scanned items with their confirmed or adjusted counts, persisted to localStorage
- **Log_Entry**: A single item in the Stock_Taking_Log containing part info, stock item reference, system count, and user-confirmed count
- **Barcode_Input**: The text input field that receives barcode scans or part search queries
- **Count_Field**: The editable numeric input on each Log_Entry, pre-filled with the system's current stock count
- **InventreeService**: The API service class that communicates with the InvenTree backend
- **Home_Page**: The main landing page (`index.vue`) with a card grid for navigation
- **Delta**: The difference between the user-confirmed count and the system's current stock count (confirmed - system)

## Requirements

### Requirement 1: Home Page Navigation

**User Story:** As a user, I want to see a Stock Taking card on the home page, so that I can navigate to the stock taking workflow.

#### Acceptance Criteria

1. THE Home_Page SHALL display a Stock Taking card matching the existing card grid style (colored icon header, description, footer with navigation button)
2. WHEN a user clicks the Stock Taking card navigation button, THE Home_Page SHALL navigate to the Stock_Taking_Page

### Requirement 2: Barcode and Part Input

**User Story:** As a user, I want to scan barcodes or search parts to add items to my stock taking log, so that I can quickly build a list of items to count.

#### Acceptance Criteria

1. WHEN the Stock_Taking_Page loads, THE Barcode_Input SHALL receive focus automatically
2. THE Stock_Taking_Page SHALL provide a toggle between barcode lookup mode and part search mode
3. WHEN a user scans a barcode in barcode mode, THE InventreeService SHALL look up the barcode via the barcode scanning API and resolve it to a Part
4. WHEN a barcode resolves to a stock item (not a part directly), THE InventreeService SHALL retrieve the associated Part and its first stock item
5. WHEN a user searches in part search mode, THE InventreeService SHALL search parts by name, IPN, or description and use the first stock item for the matched part
6. WHEN a valid barcode or part is resolved, THE Stock_Taking_Page SHALL create a new Log_Entry with the Part data, the stock item pk, and the system stock count pre-filled in the Count_Field
7. IF a barcode or search query returns no results, THEN THE Stock_Taking_Page SHALL display an error message on the Log_Entry

### Requirement 3: Duplicate Handling

**User Story:** As a user, I want the system to handle duplicate scans gracefully, so that I do not accidentally create multiple entries for the same item.

#### Acceptance Criteria

1. WHEN the same barcode or part is scanned a second time, THE Stock_Taking_Page SHALL scroll to and highlight the existing Log_Entry instead of creating a duplicate
2. WHEN a duplicate is detected, THE Stock_Taking_Page SHALL return focus to the Barcode_Input after highlighting

### Requirement 4: Count Confirmation and Editing

**User Story:** As a user, I want to confirm or adjust stock counts with minimal keystrokes, so that I can complete the stock take quickly.

#### Acceptance Criteria

1. WHEN a new Log_Entry is created, THE Count_Field SHALL be pre-filled with the system's current stock count for that item
2. WHEN a user presses Enter or Tab on a Log_Entry, THE Stock_Taking_Page SHALL confirm the current count and return focus to the Barcode_Input
3. THE Count_Field SHALL remain editable until the bulk submission is applied
4. WHEN a user modifies the Count_Field, THE Log_Entry SHALL store the user-entered quantity as the confirmed count

### Requirement 5: Keyboard Shortcuts

**User Story:** As a user, I want keyboard shortcuts for common actions, so that I can operate the stock take workflow efficiently without a mouse.

#### Acceptance Criteria

1. WHEN the user presses the Escape key, THE Stock_Taking_Page SHALL remove the last added Log_Entry from the Stock_Taking_Log
2. WHEN a Log_Entry is removed via Escape, THE Stock_Taking_Page SHALL return focus to the Barcode_Input

### Requirement 6: Log Persistence

**User Story:** As a user, I want my stock taking log to persist across page refreshes, so that I do not lose progress if the browser reloads.

#### Acceptance Criteria

1. WHEN a Log_Entry is added or modified, THE Stock_Taking_Log SHALL persist the current state to localStorage immediately
2. WHEN the Stock_Taking_Page loads, THE Stock_Taking_Log SHALL restore any previously saved entries from localStorage
3. WHEN the user applies the stock take or clears the log, THE Stock_Taking_Log SHALL remove the persisted data from localStorage

### Requirement 7: Bulk Stock Adjustment Submission

**User Story:** As a user, I want to submit all stock count adjustments in bulk, so that I can complete the stock take in a single action.

#### Acceptance Criteria

1. WHEN the user clicks "Apply Stock Take", THE Stock_Taking_Page SHALL compute the Delta for each Log_Entry (confirmed count minus system count)
2. WHEN a Log_Entry has a positive Delta, THE InventreeService SHALL call `POST /api/stock/add/` to add the difference to the stock item
3. WHEN a Log_Entry has a negative Delta, THE InventreeService SHALL call `POST /api/stock/remove/` to remove the absolute difference from the stock item
4. WHEN a Log_Entry has a Delta of zero, THE Stock_Taking_Page SHALL skip that entry (no API call needed)
5. WHEN all adjustments succeed, THE Stock_Taking_Page SHALL clear the Stock_Taking_Log and display a success notification
6. IF any adjustment fails, THEN THE Stock_Taking_Page SHALL display an error notification and retain the failed Log_Entries for retry
7. WHILE the bulk submission is in progress, THE Stock_Taking_Page SHALL disable the "Apply Stock Take" button and show a loading indicator

### Requirement 8: Log Display and Management

**User Story:** As a user, I want to see a clear list of all scanned items with their counts, so that I can review and manage the stock take before submitting.

#### Acceptance Criteria

1. THE Stock_Taking_Log SHALL display each Log_Entry with the part name, barcode, system stock count, and an editable Count_Field
2. THE Stock_Taking_Page SHALL provide a "Clear Log" button that removes all entries from the Stock_Taking_Log
3. WHEN the Stock_Taking_Log is empty, THE Stock_Taking_Page SHALL display an empty state message prompting the user to scan items
4. THE Stock_Taking_Page SHALL disable the "Apply Stock Take" button when the Stock_Taking_Log is empty or contains entries with errors

### Requirement 9: API Integration

**User Story:** As a developer, I want a dedicated `adjustStock` method on the InventreeService, so that the stock adjustment logic is encapsulated and reusable.

#### Acceptance Criteria

1. THE InventreeService SHALL expose an `adjustStock` method that accepts a stock item pk, a current quantity, a new quantity, and an optional notes string
2. WHEN the new quantity is greater than the current quantity, THE `adjustStock` method SHALL call the stock add endpoint with the positive difference
3. WHEN the new quantity is less than the current quantity, THE `adjustStock` method SHALL call the stock remove endpoint with the absolute difference
4. WHEN the new quantity equals the current quantity, THE `adjustStock` method SHALL return without making an API call
5. IF the API returns an error response, THEN THE `adjustStock` method SHALL throw an error with a descriptive message

### Requirement 10: Page Layout and UI Consistency

**User Story:** As a user, I want the Stock Taking page to match the existing app design patterns, so that the experience is consistent across the application.

#### Acceptance Criteria

1. THE Stock_Taking_Page SHALL use the same container, header, and UCard layout patterns as the checkout page
2. THE Stock_Taking_Page SHALL use NuxtUI components consistently with the rest of the application
