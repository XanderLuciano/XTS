# Implementation Plan: Self-Checkout Kiosk

## Overview

This plan implements the self-checkout kiosk feature as a new Vue page with a composable for cart state management. The implementation follows the existing patterns in scan.vue and add-stock.vue, using NuxtUI components and the InventreeService.

## Tasks

- [x] 1. Create cart composable with core state management
  - [x] 1.1 Create `useCheckoutCart` composable with CartItem interface and reactive state
    - Create `app/composables/useCheckoutCart.ts`
    - Implement CartItem interface with id, barcode, quantity, status, part, errorMessage, timestamps
    - Implement cartItems ref, barcodeIndex Map, and modificationOrder array
    - _Requirements: 2.1, 2.3, 7.4_
  
  - [x] 1.2 Implement addOrIncrementItem function
    - Check barcodeIndex for existing item
    - If exists, increment quantity and update lastModifiedAt
    - If new, create CartItem with status 'loading' and add to cart
    - Update modificationOrder stack
    - _Requirements: 2.1, 2.3, 2.4_
  
  - [x] 1.3 Write property test for adding item to cart
    - **Property 1: Adding item adds to cart**
    - **Validates: Requirements 2.1**
  
  - [x] 1.4 Write property test for duplicate barcode handling
    - **Property 2: Duplicate barcode increments quantity**
    - **Validates: Requirements 2.3**
  
  - [x] 1.5 Write property test for barcode cache preventing duplicate lookups
    - **Property 3: Barcode cache prevents duplicate lookups**
    - **Validates: Requirements 2.5**
  
  - [x] 1.6 Implement part lookup with lazy loading
    - Call InventreeService.searchParts or getPartByIPN after adding item
    - Update CartItem with part data on success
    - Set status to 'error' with message on failure
    - _Requirements: 2.2, 3.1, 3.2, 3.3_
  
  - [x] 1.7 Write property test for failed lookup error state
    - **Property 5: Failed lookup sets error state**
    - **Validates: Requirements 3.2, 3.3**

- [x] 2. Implement cart item management functions
  - [x] 2.1 Implement updateQuantity function
    - Reject updates for items with status 'error'
    - Validate quantity > 0
    - Update quantity and lastModifiedAt timestamp
    - Update modificationOrder stack
    - _Requirements: 3.4, 4.3, 4.4_
  
  - [x] 2.2 Write property test for error items rejecting quantity updates
    - **Property 6: Error items reject quantity updates**
    - **Validates: Requirements 3.4**
  
  - [x] 2.3 Write property test for quantity update is immediate
    - **Property 8: Quantity update is immediate**
    - **Validates: Requirements 4.4**
  
  - [x] 2.4 Implement removeItem function
    - Remove item from cartItems
    - Remove barcode from barcodeIndex cache
    - Remove from modificationOrder
    - _Requirements: 4.5, 4.6_
  
  - [x] 2.5 Write property test for remove clearing cart and cache
    - **Property 9: Remove item clears from cart and cache**
    - **Validates: Requirements 4.6**
  
  - [x] 2.6 Implement clearCart function
    - Clear all items from cartItems
    - Clear barcodeIndex cache
    - Clear modificationOrder
    - _Requirements: 5.1, 5.2_
  
  - [x] 2.7 Write property test for clear cart
    - **Property 10: Clear cart removes all items and clears cache**
    - **Validates: Requirements 5.1, 5.2**

- [x] 3. Implement void and modification tracking
  - [x] 3.1 Implement voidLastItem function
    - Get most recent item from modificationOrder
    - Remove that item using removeItem
    - Return voided item for notification
    - Handle empty cart case (return null)
    - _Requirements: 7.1, 7.3_
  
  - [x] 3.2 Write property test for void removes most recent item
    - **Property 15: Void removes most recently modified item**
    - **Validates: Requirements 7.1**
  
  - [x] 3.3 Write property test for modification order tracking
    - **Property 16: Modification order is tracked correctly**
    - **Validates: Requirements 7.4**

- [x] 4. Implement checkout functionality
  - [x] 4.1 Implement checkout validation
    - Check for empty cart
    - Check for items with status 'error'
    - Check for items where quantity exceeds available stock
    - Return validation result with warnings
    - _Requirements: 5.4, 5.5, 6.6_
  
  - [x] 4.2 Write property test for checkout blocked with error items
    - **Property 11: Checkout blocked with error items**
    - **Validates: Requirements 5.5**
  
  - [x] 4.3 Implement checkout function
    - Set isCheckingOut to true
    - Get stock items for each cart item
    - Call InventreeService.removeStock for each item
    - Track success/failure for each item
    - Clear cart on full success
    - Return CheckoutResult
    - _Requirements: 6.1, 6.3, 6.4, 6.5_
  
  - [x] 4.4 Write property test for checkout removes stock for valid items
    - **Property 12: Checkout removes stock for all valid items**
    - **Validates: Requirements 6.1**
  
  - [x] 4.5 Write property test for successful checkout clears cart
    - **Property 13: Successful checkout clears cart**
    - **Validates: Requirements 6.4**
  
  - [x] 4.6 Implement computed properties
    - hasErrors: any item with status 'error'
    - isEmpty: cartItems length === 0
    - totalItems: sum of all quantities
    - hasStockWarnings: any item where quantity > part.in_stock
    - _Requirements: 5.5, 6.6_

- [x] 5. Create checkout page component
  - [x] 5.1 Create basic page structure
    - Create `app/pages/checkout.vue`
    - Add page header with title
    - Add barcode input section with UInput
    - Add cart items section
    - Add action buttons section
    - _Requirements: 1.2, 1.3, 1.4_
  
  - [x] 5.2 Implement barcode scanning handler
    - Capture input on Enter key
    - Call addOrIncrementItem from composable
    - Clear input field
    - Maintain focus on input
    - _Requirements: 2.1, 2.6_
  
  - [x] 5.3 Implement cart item rendering
    - Show loading state with barcode and spinner
    - Show loaded state with image, name, stock, quantity input
    - Show error state with red styling, barcode, error message, remove-only
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2_
  
  - [x] 5.4 Implement quantity input for cart items
    - UInput with type="number" for loaded items
    - Disable for error items
    - Call updateQuantity on change
    - _Requirements: 4.3, 4.4_
  
  - [x] 5.5 Implement remove button for cart items
    - UButton with trash icon
    - Call removeItem on click
    - _Requirements: 4.5_

- [x] 6. Implement action buttons and hotkeys
  - [x] 6.1 Implement Void Last button
    - UButton with "Void Last [Esc]" label
    - Call voidLastItem on click
    - Show toast notification with voided item barcode
    - _Requirements: 7.1, 7.2, 8.5_
  
  - [x] 6.2 Implement Clear Cart button
    - UButton with "Clear Cart" label
    - Call clearCart on click
    - _Requirements: 5.1_
  
  - [x] 6.3 Implement Checkout button
    - UButton with "Checkout" label and hotkey hint
    - Disable when hasErrors or isEmpty or isCheckingOut
    - Show loading state during checkout
    - Call checkout on click
    - Show success/error toast based on result
    - _Requirements: 5.3, 5.4, 5.5, 6.5_
  
  - [x] 6.4 Implement keyboard shortcuts
    - Listen for Escape key globally, call voidLastItem
    - Ensure input focus is maintained after operations
    - _Requirements: 7.1, 8.1_

- [x] 7. Add homepage navigation link
  - [x] 7.1 Add checkout card to homepage
    - Add UCard with checkout icon and description
    - Add NuxtLink to /checkout
    - Follow existing card pattern from index.vue
    - _Requirements: 1.1_

- [x] 8. Final polish and validation
  - [x] 8.1 Implement auto-focus behavior
    - Focus input on page load
    - Refocus input after all cart operations
    - _Requirements: 1.2, 8.1, 8.4_
  
  - [x] 8.2 Style for kiosk usability
    - Use large button sizes (size="lg")
    - Ensure touch-friendly spacing
    - Add clear visual feedback for states
    - _Requirements: 8.2, 8.3_
  
  - [x] 8.3 Write unit tests for page component
    - Test homepage link exists
    - Test page renders required sections
    - Test hotkey hints are displayed
    - _Requirements: 1.1, 8.5_

- [x] 9. Run all tests and verify implementation
  - Run `npm test` to execute all property and unit tests
  - Verify all 16 property tests pass
  - Verify page component tests pass
  - Fix any failing tests before marking complete
  - _Requirements: All_

## Notes

- Each task references specific requirements for traceability
- Property tests validate universal correctness properties (16 total)
- The composable is tested separately from the page component for better isolation
- Property tests use fast-check library with minimum 100 iterations each
