# Requirements Document

## Introduction

This document defines the requirements for a self-checkout kiosk page feature in the InvenTree inventory management webapp. The feature enables users to scan items using a USB barcode scanner, build a cart of items to remove from inventory, and checkout to deduct stock quantities. The page is optimized for kiosk-style usage with fast barcode scanning workflows.

## Glossary

- **Kiosk_Page**: The self-checkout Vue page component accessible from the homepage
- **Cart**: A temporary collection of items the user intends to remove from stock
- **Cart_Item**: An individual entry in the cart containing barcode, quantity, and part details
- **Barcode_Scanner**: A USB barcode scanner device that inputs text and triggers Enter key
- **Part**: An InvenTree inventory part with associated stock information
- **Stock_Item**: A physical stock entry in InvenTree associated with a Part
- **Checkout_Action**: The operation that removes cart items from InvenTree stock
- **Lazy_Load**: Fetching item details asynchronously after initial cart addition

## Requirements

### Requirement 1: Page Setup and Navigation

**User Story:** As a warehouse operator, I want to access the self-checkout kiosk from the homepage, so that I can quickly navigate to the checkout workflow.

#### Acceptance Criteria

1. THE Kiosk_Page SHALL be accessible via a navigation link from the homepage
2. WHEN the Kiosk_Page loads, THE Kiosk_Page SHALL display a focused text input field for barcode scanning
3. THE Kiosk_Page SHALL display a cart section showing all scanned items
4. THE Kiosk_Page SHALL display action buttons for clearing cart and checkout

### Requirement 2: Barcode Scanning and Input Capture

**User Story:** As a warehouse operator, I want to scan barcodes and have items automatically added to my cart, so that I can quickly build a list of items to checkout.

#### Acceptance Criteria

1. WHEN a barcode is scanned (text input followed by Enter key), THE Kiosk_Page SHALL immediately add a Cart_Item with the scanned barcode string
2. WHEN a Cart_Item is added, THE Kiosk_Page SHALL initiate a lazy load of part details from InvenTree
3. WHEN the same barcode is scanned again, THE Kiosk_Page SHALL increment the quantity of the existing Cart_Item instead of adding a duplicate
4. WHEN a barcode is scanned that already exists in the cart, THE Kiosk_Page SHALL display the quantity increment immediately before the lookup completes
5. THE Kiosk_Page SHALL maintain a local cache of scanned barcodes to quickly identify duplicates without API calls
6. WHEN a Cart_Item is added, THE Kiosk_Page SHALL clear the input field and maintain focus for the next scan

### Requirement 3: Part Lookup and Error Handling

**User Story:** As a warehouse operator, I want to see item details after scanning, so that I can verify I'm checking out the correct items.

#### Acceptance Criteria

1. WHEN a part lookup succeeds, THE Kiosk_Page SHALL display the part name, image, and current stock quantity
2. IF a part lookup fails or returns no results, THEN THE Kiosk_Page SHALL display the Cart_Item in an error state with red styling
3. WHEN a Cart_Item is in error state, THE Kiosk_Page SHALL display the original scanned barcode string and an error message
4. WHEN a Cart_Item is in error state, THE Kiosk_Page SHALL only allow removal (no quantity modification)

### Requirement 4: Cart Item Display and Management

**User Story:** As a warehouse operator, I want to view and manage items in my cart, so that I can adjust quantities before checkout.

#### Acceptance Criteria

1. THE Kiosk_Page SHALL display each Cart_Item with: part photo, part name, total stock quantity, and cart quantity
2. WHEN a Cart_Item is loading, THE Kiosk_Page SHALL display a loading indicator with the barcode string
3. THE Kiosk_Page SHALL allow manual quantity entry for each Cart_Item via a number input field
4. WHEN a user modifies the quantity input, THE Kiosk_Page SHALL update the Cart_Item quantity immediately
5. THE Kiosk_Page SHALL provide a remove button for each Cart_Item
6. WHEN a Cart_Item is removed, THE Kiosk_Page SHALL remove it from the cart and the barcode cache

### Requirement 5: Cart Actions

**User Story:** As a warehouse operator, I want to clear my cart or proceed to checkout, so that I can manage my checkout workflow.

#### Acceptance Criteria

1. THE Kiosk_Page SHALL provide a clear cart button that removes all Cart_Items
2. WHEN the clear cart button is pressed, THE Kiosk_Page SHALL clear the barcode cache
3. THE Kiosk_Page SHALL provide a checkout button to process the cart
4. WHEN the checkout button is pressed with an empty cart, THE Kiosk_Page SHALL display a warning message
5. WHEN the checkout button is pressed with error items in the cart, THE Kiosk_Page SHALL prevent checkout and display a warning

### Requirement 6: Stock Removal on Checkout

**User Story:** As a warehouse operator, I want stock to only be removed when I press checkout, so that I can review and modify my cart before committing changes.

#### Acceptance Criteria

1. WHEN the checkout button is pressed, THE Kiosk_Page SHALL remove stock quantities from InvenTree for each valid Cart_Item
2. THE Kiosk_Page SHALL use the existing InventreeService to perform stock removal operations
3. IF a stock removal operation fails, THEN THE Kiosk_Page SHALL display an error message and mark the Cart_Item as failed
4. WHEN all stock removals succeed, THE Kiosk_Page SHALL clear the cart and display a success message
5. WHEN checkout is in progress, THE Kiosk_Page SHALL disable the checkout button and display a loading state
6. IF a Cart_Item quantity exceeds available stock, THEN THE Kiosk_Page SHALL prevent checkout and display a warning for that item

### Requirement 7: Quick Void and Undo

**User Story:** As a warehouse operator, I want to quickly undo an accidental scan, so that I can correct mistakes without interrupting my scanning workflow.

#### Acceptance Criteria

1. WHEN the user presses a void hotkey (Escape key), THE Kiosk_Page SHALL remove the most recently added or modified Cart_Item
2. THE Kiosk_Page SHALL display a brief notification when an item is voided
3. IF the cart is empty when void is pressed, THEN THE Kiosk_Page SHALL take no action
4. THE Kiosk_Page SHALL track the order of cart modifications to determine the most recent item

### Requirement 8: Kiosk Usability

**User Story:** As a warehouse operator, I want the interface to be optimized for continuous scanning, so that I can process items quickly without mouse interaction.

#### Acceptance Criteria

1. THE Kiosk_Page SHALL automatically refocus the barcode input after any cart operation
2. THE Kiosk_Page SHALL use large, touch-friendly buttons suitable for kiosk displays
3. THE Kiosk_Page SHALL provide clear visual feedback for all state changes (loading, success, error)
4. WHEN the page loads, THE Kiosk_Page SHALL focus the barcode input field automatically
5. THE Kiosk_Page SHALL display hotkey hints on buttons that have keyboard shortcuts (e.g., "Void Last [Esc]", "Checkout [Enter]")
