import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { useCheckoutCart, type CartItem } from '../useCheckoutCart'
import { InventreeService } from '~/services/inventree.service'

/**
 * Property-based tests for useCheckoutCart composable
 *
 * These tests validate correctness properties across many randomly generated inputs
 * using the fast-check library.
 */

// Arbitrary for valid barcode strings (from design doc)
const barcodeArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0)

describe('useCheckoutCart', () => {
  describe('Property 1: Adding item adds to cart', () => {
    /**
     * **Validates: Requirements 2.1**
     *
     * For any valid barcode string, when scanned (entered and submitted),
     * the cart should contain an item with that barcode.
     */
    it('should add item to cart for any valid barcode', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add item with the barcode
            const result = testCart.addOrIncrementItem(barcode)

            // Verify item was added
            expect(result).not.toBeNull()
            expect(result?.barcode).toBe(barcode.trim())

            // Verify cart contains the item
            const cartItems = testCart.cartItems.value
            expect(cartItems.length).toBe(1)
            expect(cartItems[0]!.barcode).toBe(barcode.trim())
            expect(cartItems[0]!.quantity).toBe(1)
            expect(cartItems[0]!.status).toBe('loading')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 2: Duplicate barcode increments quantity', () => {
    /**
     * **Validates: Requirements 2.3**
     *
     * For any barcode string scanned N times (where N > 1), the cart should
     * contain exactly one item with that barcode and quantity equal to N.
     */
    it('should increment quantity for duplicate barcodes instead of adding new items', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          fc.integer({ min: 2, max: 20 }),
          async (barcode, scanCount) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Scan the same barcode N times
            for (let i = 0; i < scanCount; i++) {
              testCart.addOrIncrementItem(barcode)
            }

            // Verify cart contains exactly one item
            const cartItems = testCart.cartItems.value
            expect(cartItems.length).toBe(1)

            // Verify the item has the correct barcode
            expect(cartItems[0]!.barcode).toBe(barcode.trim())

            // Verify quantity equals the number of scans
            expect(cartItems[0]!.quantity).toBe(scanCount)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 3: Barcode cache prevents duplicate lookups', () => {
    /**
     * **Validates: Requirements 2.5**
     *
     * For any barcode that has been scanned once and is in the cart, subsequent
     * scans of the same barcode should not trigger additional API lookup calls.
     * The barcode should be in the barcodeIndex cache.
     */
    it('should cache barcode after first scan and use cache for subsequent scans', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          fc.integer({ min: 2, max: 10 }),
          async (barcode, scanCount) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()
            const trimmedBarcode = barcode.trim()

            // First scan - should add to cache
            const firstResult = testCart.addOrIncrementItem(barcode)
            expect(firstResult).not.toBeNull()

            // Verify barcode is now in the cache
            const barcodeIndex = testCart.getBarcodeIndex()
            expect(barcodeIndex.has(trimmedBarcode)).toBe(true)

            // Get the item ID from the cache
            const cachedItemId = barcodeIndex.get(trimmedBarcode)
            expect(cachedItemId).toBe(firstResult!.id)

            // Subsequent scans should use the cache (same item ID returned)
            for (let i = 1; i < scanCount; i++) {
              const subsequentResult = testCart.addOrIncrementItem(barcode)

              // Should return the same item (found via cache)
              expect(subsequentResult).not.toBeNull()
              expect(subsequentResult!.id).toBe(firstResult!.id)

              // Cache should still contain the same mapping
              expect(barcodeIndex.get(trimmedBarcode)).toBe(firstResult!.id)
            }

            // Verify only one item exists in cart (cache prevented duplicates)
            expect(testCart.cartItems.value.length).toBe(1)

            // Verify quantity reflects all scans
            expect(testCart.cartItems.value[0]!.quantity).toBe(scanCount)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain separate cache entries for different barcodes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 2, maxLength: 10 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 2), // Need at least 2 unique barcodes
          async (uniqueBarcodes) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()
            const barcodeIndex = testCart.getBarcodeIndex()

            // Add each unique barcode
            const addedItems: Map<string, string> = new Map()
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              addedItems.set(barcode, result!.id)
            }

            // Verify each barcode has its own cache entry
            expect(barcodeIndex.size).toBe(uniqueBarcodes.length)

            // Verify each barcode maps to the correct item ID
            for (const barcode of uniqueBarcodes) {
              expect(barcodeIndex.has(barcode)).toBe(true)
              expect(barcodeIndex.get(barcode)).toBe(addedItems.get(barcode))
            }

            // Verify cart has correct number of items
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 5: Failed lookup sets error state', () => {
    /**
     * **Validates: Requirements 3.2, 3.3**
     *
     * For any barcode where the part lookup fails or returns no results,
     * the cart item should have status 'error', display the original barcode string,
     * and show an error message.
     */

    /**
     * Creates a mock InventreeService that returns empty results (part not found)
     */
    const createEmptyResultsService = (): InventreeService => {
      const mockApi = vi.fn()
      const service = new InventreeService(mockApi)
      vi.spyOn(service, 'scanBarcode').mockResolvedValue(null)
      vi.spyOn(service, 'searchParts').mockResolvedValue([])
      return service
    }

    /**
     * Creates a mock InventreeService that throws an error
     */
    const createErrorService = (errorMessage: string): InventreeService => {
      const mockApi = vi.fn()
      const service = new InventreeService(mockApi)
      vi.spyOn(service, 'scanBarcode').mockRejectedValue(new Error(errorMessage))
      vi.spyOn(service, 'searchParts').mockRejectedValue(new Error(errorMessage))
      return service
    }

    it('should set error state when part lookup returns no results', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            // Create cart with mock service that returns empty results
            const mockService = createEmptyResultsService()
            const testCart = useCheckoutCart(mockService)
            const trimmedBarcode = barcode.trim()

            // Add item - this triggers the lookup
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            // Wait for the async lookup to complete
            // The lookup is fire-and-forget, so we need to wait a tick
            await new Promise(resolve => setTimeout(resolve, 10))

            // Find the cart item
            const cartItem = testCart.cartItems.value.find(item => item.barcode === trimmedBarcode)
            expect(cartItem).toBeDefined()

            // Verify error state is set (Requirement 3.2)
            expect(cartItem!.status).toBe('error')

            // Verify original barcode string is retained (Requirement 3.3)
            expect(cartItem!.barcode).toBe(trimmedBarcode)

            // Verify error message is set (Requirement 3.3)
            expect(cartItem!.errorMessage).toBeDefined()
            expect(cartItem!.errorMessage).toContain(trimmedBarcode)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should set error state when part lookup throws an error', async () => {
      // Arbitrary for error messages
      const errorMessageArb = fc.string({ minLength: 1, maxLength: 100 })
        .filter(s => s.trim().length > 0)

      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          errorMessageArb,
          async (barcode, errorMessage) => {
            // Create cart with mock service that throws an error
            const mockService = createErrorService(errorMessage)
            const testCart = useCheckoutCart(mockService)
            const trimmedBarcode = barcode.trim()

            // Add item - this triggers the lookup
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            // Wait for the async lookup to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Find the cart item
            const cartItem = testCart.cartItems.value.find(item => item.barcode === trimmedBarcode)
            expect(cartItem).toBeDefined()

            // Verify error state is set (Requirement 3.2)
            expect(cartItem!.status).toBe('error')

            // Verify original barcode string is retained (Requirement 3.3)
            expect(cartItem!.barcode).toBe(trimmedBarcode)

            // Verify error message is set with the thrown error message (Requirement 3.3)
            expect(cartItem!.errorMessage).toBeDefined()
            expect(cartItem!.errorMessage).toBe(errorMessage)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should set generic error message when lookup throws non-Error object', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            // Create cart with mock service that throws a non-Error object
            const mockApi = vi.fn()
            const mockService = new InventreeService(mockApi)
            vi.spyOn(mockService, 'scanBarcode').mockRejectedValue('Network failure')
            vi.spyOn(mockService, 'searchParts').mockRejectedValue('Network failure')

            const testCart = useCheckoutCart(mockService)
            const trimmedBarcode = barcode.trim()

            // Add item - this triggers the lookup
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            // Wait for the async lookup to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Find the cart item
            const cartItem = testCart.cartItems.value.find(item => item.barcode === trimmedBarcode)
            expect(cartItem).toBeDefined()

            // Verify error state is set (Requirement 3.2)
            expect(cartItem!.status).toBe('error')

            // Verify original barcode string is retained (Requirement 3.3)
            expect(cartItem!.barcode).toBe(trimmedBarcode)

            // Verify generic error message is set (Requirement 3.3)
            expect(cartItem!.errorMessage).toBeDefined()
            expect(cartItem!.errorMessage).toBe('Network error - unable to lookup part')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 6: Error items reject quantity updates', () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * For any cart item in error state, attempts to modify the quantity
     * should be rejected and the quantity should remain unchanged.
     */

    /**
     * Creates a mock InventreeService that returns empty results (part not found)
     * This will cause the cart item to enter error state
     */
    const createEmptyResultsService = (): InventreeService => {
      const mockApi = vi.fn()
      const service = new InventreeService(mockApi)
      vi.spyOn(service, 'scanBarcode').mockResolvedValue(null)
      vi.spyOn(service, 'searchParts').mockResolvedValue([])
      return service
    }

    it('should reject quantity updates for items in error state', async () => {
      // Arbitrary for new quantity values (any positive number)
      const quantityArb = fc.integer({ min: 1, max: 1000 })

      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          quantityArb,
          async (barcode, newQuantity) => {
            // Create cart with mock service that returns empty results (causes error state)
            const mockService = createEmptyResultsService()
            const testCart = useCheckoutCart(mockService)

            // Add item - this triggers the lookup which will fail
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            const itemId = result!.id
            const originalQuantity = result!.quantity // Should be 1

            // Wait for the async lookup to complete and set error state
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify item is now in error state
            const cartItem = testCart.cartItems.value.find(item => item.id === itemId)
            expect(cartItem).toBeDefined()
            expect(cartItem!.status).toBe('error')

            // Attempt to update quantity - should be rejected (Requirement 3.4)
            const updateResult = testCart.updateQuantity(itemId, newQuantity)

            // Verify update was rejected
            expect(updateResult).toBe(false)

            // Verify quantity remains unchanged
            expect(cartItem!.quantity).toBe(originalQuantity)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject quantity updates for error items regardless of quantity value', async () => {
      // Arbitrary for any quantity value including edge cases
      const anyQuantityArb = fc.oneof(
        fc.integer({ min: 1, max: 1000 }), // Valid positive integers
        fc.integer({ min: -1000, max: 0 }), // Invalid non-positive integers
        fc.double({ min: 0.1, max: 100 }) // Floating point numbers
      )

      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          anyQuantityArb,
          async (barcode, newQuantity) => {
            // Create cart with mock service that returns empty results (causes error state)
            const mockService = createEmptyResultsService()
            const testCart = useCheckoutCart(mockService)

            // Add item - this triggers the lookup which will fail
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            const itemId = result!.id
            const originalQuantity = result!.quantity

            // Wait for the async lookup to complete and set error state
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify item is now in error state
            const cartItem = testCart.cartItems.value.find(item => item.id === itemId)
            expect(cartItem).toBeDefined()
            expect(cartItem!.status).toBe('error')

            // Attempt to update quantity with any value - should be rejected
            const updateResult = testCart.updateQuantity(itemId, newQuantity)

            // Verify update was rejected (Requirement 3.4: error items only allow removal)
            expect(updateResult).toBe(false)

            // Verify quantity remains unchanged
            expect(cartItem!.quantity).toBe(originalQuantity)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should allow quantity updates for loaded items but not error items', async () => {
      // Arbitrary for valid quantity values
      const validQuantityArb = fc.integer({ min: 1, max: 100 })

      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          validQuantityArb,
          async (barcode, newQuantity) => {
            // Create cart with mock service that returns empty results (causes error state)
            const mockService = createEmptyResultsService()
            const testCart = useCheckoutCart(mockService)

            // Add item - this triggers the lookup which will fail
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            const itemId = result!.id

            // Before lookup completes, item is in 'loading' state
            // updateQuantity should work for loading items (they're not in error state)
            const loadingItem = testCart.cartItems.value.find(item => item.id === itemId)
            expect(loadingItem).toBeDefined()
            expect(loadingItem!.status).toBe('loading')

            // Update should succeed for loading items
            const loadingUpdateResult = testCart.updateQuantity(itemId, newQuantity)
            expect(loadingUpdateResult).toBe(true)
            expect(loadingItem!.quantity).toBe(newQuantity)

            // Wait for the async lookup to complete and set error state
            await new Promise(resolve => setTimeout(resolve, 10))

            // Now item should be in error state
            expect(loadingItem!.status).toBe('error')

            // Store the current quantity before attempting update
            const quantityBeforeErrorUpdate = loadingItem!.quantity

            // Attempt to update quantity again - should now be rejected
            const errorUpdateResult = testCart.updateQuantity(itemId, newQuantity + 1)

            // Verify update was rejected for error item
            expect(errorUpdateResult).toBe(false)

            // Verify quantity remains unchanged
            expect(loadingItem!.quantity).toBe(quantityBeforeErrorUpdate)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 8: Quantity update is immediate', () => {
    /**
     * **Validates: Requirements 4.4**
     *
     * For any cart item with status 'loaded' and any valid quantity value,
     * updating the quantity should immediately reflect in the cart item state.
     */

    /**
     * Creates a mock InventreeService that returns a valid part (causes loaded state)
     */
    const createSuccessService = (): InventreeService => {
      const mockApi = vi.fn()
      const service = new InventreeService(mockApi)
      const mockPart = {
        pk: 1,
        name: 'Test Part',
        description: 'A test part',
        IPN: 'TEST-001',
        in_stock: 100,
        image: null,
        thumbnail: null
      } as any
      vi.spyOn(service, 'scanBarcode').mockResolvedValue(mockPart)
      vi.spyOn(service, 'searchParts').mockResolvedValue([mockPart])
      // Mock getStockItems and removeStock for checkout functionality
      vi.spyOn(service, 'getStockItems').mockResolvedValue([
        { pk: 1, part: 1, quantity: 100, location: null, serial: null, batch: null, barcode_hash: '', notes: '' }
      ])
      vi.spyOn(service, 'removeStock').mockResolvedValue(undefined)
      return service
    }

    it('should immediately update quantity for loaded items', async () => {
      // Arbitrary for valid quantity values
      const validQuantityArb = fc.integer({ min: 1, max: 1000 })

      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          validQuantityArb,
          async (barcode, newQuantity) => {
            // Create cart with mock service that returns a valid part
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)

            // Add item - this triggers the lookup
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            const itemId = result!.id

            // Wait for the async lookup to complete and set loaded state
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify item is now in loaded state
            const cartItem = testCart.cartItems.value.find(item => item.id === itemId)
            expect(cartItem).toBeDefined()
            expect(cartItem!.status).toBe('loaded')

            // Capture timestamp before update
            const timestampBefore = cartItem!.lastModifiedAt

            // Small delay to ensure timestamp difference is measurable
            await new Promise(resolve => setTimeout(resolve, 1))

            // Update quantity - should be immediate (Requirement 4.4)
            const updateResult = testCart.updateQuantity(itemId, newQuantity)

            // Verify update succeeded
            expect(updateResult).toBe(true)

            // Verify quantity is immediately updated (synchronously, no waiting)
            expect(cartItem!.quantity).toBe(newQuantity)

            // Verify lastModifiedAt timestamp is updated
            expect(cartItem!.lastModifiedAt).toBeGreaterThanOrEqual(timestampBefore)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should update quantity synchronously without async delay', async () => {
      // Arbitrary for valid quantity values
      const validQuantityArb = fc.integer({ min: 1, max: 1000 })

      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          validQuantityArb,
          async (barcode, newQuantity) => {
            // Create cart with mock service that returns a valid part
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)

            // Add item and wait for it to load
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            const itemId = result!.id

            // Wait for the async lookup to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify item is loaded
            const cartItem = testCart.cartItems.value.find(item => item.id === itemId)
            expect(cartItem).toBeDefined()
            expect(cartItem!.status).toBe('loaded')

            // Update quantity
            testCart.updateQuantity(itemId, newQuantity)

            // Immediately check the value - no await needed
            // This verifies the update is synchronous (Requirement 4.4)
            const immediateQuantity = cartItem!.quantity
            expect(immediateQuantity).toBe(newQuantity)

            // Verify the cart items array also reflects the change immediately
            const cartItemFromArray = testCart.cartItems.value.find(item => item.id === itemId)
            expect(cartItemFromArray).toBeDefined()
            expect(cartItemFromArray!.quantity).toBe(newQuantity)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should update lastModifiedAt timestamp when quantity changes', async () => {
      // Arbitrary for valid quantity values
      const validQuantityArb = fc.integer({ min: 2, max: 1000 })

      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          validQuantityArb,
          async (barcode, newQuantity) => {
            // Create cart with mock service that returns a valid part
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)

            // Add item and wait for it to load
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            const itemId = result!.id

            // Wait for the async lookup to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify item is loaded
            const cartItem = testCart.cartItems.value.find(item => item.id === itemId)
            expect(cartItem).toBeDefined()
            expect(cartItem!.status).toBe('loaded')

            // Store original timestamp
            const originalTimestamp = cartItem!.lastModifiedAt

            // Small delay to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 5))

            // Update quantity
            const updateResult = testCart.updateQuantity(itemId, newQuantity)
            expect(updateResult).toBe(true)

            // Verify lastModifiedAt was updated
            expect(cartItem!.lastModifiedAt).toBeGreaterThan(originalTimestamp)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle multiple sequential quantity updates immediately', async () => {
      // Arbitrary for a sequence of valid quantity values
      const quantitySequenceArb = fc.array(
        fc.integer({ min: 1, max: 1000 }),
        { minLength: 2, maxLength: 10 }
      )

      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          quantitySequenceArb,
          async (barcode, quantities) => {
            // Create cart with mock service that returns a valid part
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)

            // Add item and wait for it to load
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            const itemId = result!.id

            // Wait for the async lookup to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify item is loaded
            const cartItem = testCart.cartItems.value.find(item => item.id === itemId)
            expect(cartItem).toBeDefined()
            expect(cartItem!.status).toBe('loaded')

            // Apply each quantity update and verify it's immediate
            for (const quantity of quantities) {
              const updateResult = testCart.updateQuantity(itemId, quantity)
              expect(updateResult).toBe(true)

              // Verify quantity is immediately updated (no async wait)
              expect(cartItem!.quantity).toBe(quantity)
            }

            // Final quantity should be the last in the sequence
            const lastQuantity = quantities[quantities.length - 1]
            expect(cartItem!.quantity).toBe(lastQuantity)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 9: Remove item clears from cart and cache', () => {
    /**
     * **Validates: Requirements 4.6**
     *
     * For any cart item, when removed, the item should no longer exist in the cart
     * AND the barcode should no longer be in the cache (allowing it to be scanned as new).
     */

    it('should remove item from cart and clear barcode from cache', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()
            const trimmedBarcode = barcode.trim()

            // Add item to cart
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            const itemId = result!.id

            // Verify item is in cart
            expect(testCart.cartItems.value.length).toBe(1)
            expect(testCart.cartItems.value[0]?.barcode).toBe(trimmedBarcode)

            // Verify barcode is in cache
            const barcodeIndex = testCart.getBarcodeIndex()
            expect(barcodeIndex.has(trimmedBarcode)).toBe(true)
            expect(barcodeIndex.get(trimmedBarcode)).toBe(itemId)

            // Remove the item
            const removedItem = testCart.removeItem(itemId)

            // Verify item was returned
            expect(removedItem).not.toBeNull()
            expect(removedItem!.id).toBe(itemId)
            expect(removedItem!.barcode).toBe(trimmedBarcode)

            // Verify item is no longer in cart (Requirement 4.6)
            expect(testCart.cartItems.value.length).toBe(0)
            expect(testCart.cartItems.value.find(item => item.id === itemId)).toBeUndefined()

            // Verify barcode is no longer in cache (Requirement 4.6)
            expect(barcodeIndex.has(trimmedBarcode)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should allow barcode to be scanned as new after removal', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()
            const trimmedBarcode = barcode.trim()

            // Add item to cart
            const firstResult = testCart.addOrIncrementItem(barcode)
            expect(firstResult).not.toBeNull()

            const firstItemId = firstResult!.id

            // Remove the item
            const removedItem = testCart.removeItem(firstItemId)
            expect(removedItem).not.toBeNull()

            // Verify cart is empty
            expect(testCart.cartItems.value.length).toBe(0)

            // Scan the same barcode again - should be treated as new (Requirement 4.6)
            const secondResult = testCart.addOrIncrementItem(barcode)
            expect(secondResult).not.toBeNull()

            // Verify a new item was created (different ID)
            expect(secondResult!.id).not.toBe(firstItemId)

            // Verify the new item has quantity 1 (not incremented from previous)
            expect(secondResult!.quantity).toBe(1)

            // Verify cart has exactly one item
            expect(testCart.cartItems.value.length).toBe(1)
            expect(testCart.cartItems.value[0]?.barcode).toBe(trimmedBarcode)

            // Verify barcode cache now points to the new item
            const barcodeIndex = testCart.getBarcodeIndex()
            expect(barcodeIndex.get(trimmedBarcode)).toBe(secondResult!.id)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should remove specific item from cart with multiple items', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 2, maxLength: 10 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 2), // Need at least 2 unique barcodes
          fc.integer({ min: 0, max: 100 }), // Index selector (will be modulo'd)
          async (uniqueBarcodes, indexSelector) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()
            const barcodeIndex = testCart.getBarcodeIndex()

            // Add all barcodes to cart
            const addedItems: Map<string, string> = new Map()
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              addedItems.set(barcode, result!.id)
            }

            // Verify all items are in cart
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length)

            // Select an item to remove (use modulo to ensure valid index)
            const removeIndex = indexSelector % uniqueBarcodes.length
            const barcodeToRemove = uniqueBarcodes[removeIndex]!
            const itemIdToRemove = addedItems.get(barcodeToRemove)!

            // Remove the selected item
            const removedItem = testCart.removeItem(itemIdToRemove)

            // Verify item was returned
            expect(removedItem).not.toBeNull()
            expect(removedItem!.barcode).toBe(barcodeToRemove)

            // Verify item is no longer in cart
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length - 1)
            expect(testCart.cartItems.value.find(item => item.id === itemIdToRemove)).toBeUndefined()

            // Verify barcode is no longer in cache
            expect(barcodeIndex.has(barcodeToRemove)).toBe(false)

            // Verify other items are still in cart and cache
            for (const barcode of uniqueBarcodes) {
              if (barcode !== barcodeToRemove) {
                const itemId = addedItems.get(barcode)!
                expect(testCart.cartItems.value.find(item => item.id === itemId)).toBeDefined()
                expect(barcodeIndex.has(barcode)).toBe(true)
                expect(barcodeIndex.get(barcode)).toBe(itemId)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should remove item from modification order when removed', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add item to cart
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            const itemId = result!.id

            // Verify item is in modification order
            const modOrderBefore = testCart.getModificationOrder()
            expect(modOrderBefore).toContain(itemId)

            // Remove the item
            testCart.removeItem(itemId)

            // Verify item is no longer in modification order
            const modOrderAfter = testCart.getModificationOrder()
            expect(modOrderAfter).not.toContain(itemId)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return null when removing non-existent item', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (fakeItemId) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Try to remove non-existent item
            const result = testCart.removeItem(fakeItemId)

            // Verify null is returned
            expect(result).toBeNull()

            // Verify cart is still empty
            expect(testCart.cartItems.value.length).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 10: Clear cart removes all items and clears cache', () => {
    /**
     * **Validates: Requirements 5.1, 5.2**
     *
     * For any cart with N items (N >= 0), after clearing, the cart should be empty
     * AND all previously scanned barcodes should be treated as new (not in cache).
     */

    it('should clear all items from cart', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 0, maxLength: 20 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]), // Ensure unique trimmed barcodes
          async (uniqueBarcodes) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add all barcodes to cart
            for (const barcode of uniqueBarcodes) {
              testCart.addOrIncrementItem(barcode)
            }

            // Verify items were added (if any)
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length)

            // Clear the cart (Requirement 5.1)
            testCart.clearCart()

            // Verify cart is empty
            expect(testCart.cartItems.value.length).toBe(0)
            expect(testCart.isEmpty.value).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should clear barcode cache when cart is cleared', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 20 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 1), // Need at least 1 barcode
          async (uniqueBarcodes) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()
            const barcodeIndex = testCart.getBarcodeIndex()

            // Add all barcodes to cart
            for (const barcode of uniqueBarcodes) {
              testCart.addOrIncrementItem(barcode)
            }

            // Verify barcodes are in cache
            expect(barcodeIndex.size).toBe(uniqueBarcodes.length)
            for (const barcode of uniqueBarcodes) {
              expect(barcodeIndex.has(barcode)).toBe(true)
            }

            // Clear the cart (Requirement 5.2)
            testCart.clearCart()

            // Verify barcode cache is empty
            expect(barcodeIndex.size).toBe(0)
            for (const barcode of uniqueBarcodes) {
              expect(barcodeIndex.has(barcode)).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should clear modification order when cart is cleared', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 20 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 1), // Need at least 1 barcode
          async (uniqueBarcodes) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add all barcodes to cart
            for (const barcode of uniqueBarcodes) {
              testCart.addOrIncrementItem(barcode)
            }

            // Verify modification order has entries
            const modOrderBefore = testCart.getModificationOrder()
            expect(modOrderBefore.length).toBe(uniqueBarcodes.length)

            // Clear the cart
            testCart.clearCart()

            // Verify modification order is empty
            const modOrderAfter = testCart.getModificationOrder()
            expect(modOrderAfter.length).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should allow previously scanned barcodes to be added as new items after clear', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 10 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 1), // Need at least 1 barcode
          async (uniqueBarcodes) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add all barcodes to cart and store their original IDs
            const originalItemIds: Map<string, string> = new Map()
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              originalItemIds.set(barcode, result!.id)
            }

            // Verify items were added
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length)

            // Clear the cart
            testCart.clearCart()

            // Verify cart is empty
            expect(testCart.cartItems.value.length).toBe(0)

            // Re-add the same barcodes - they should be treated as new (Requirement 5.2)
            for (const barcode of uniqueBarcodes) {
              const newResult = testCart.addOrIncrementItem(barcode)
              expect(newResult).not.toBeNull()

              // Verify new item has a different ID (it's a new item, not incremented)
              expect(newResult!.id).not.toBe(originalItemIds.get(barcode))

              // Verify quantity is 1 (not incremented from previous)
              expect(newResult!.quantity).toBe(1)
            }

            // Verify cart has the correct number of items
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle clearing an empty cart gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // No input needed, just run multiple times
          async () => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()
            const barcodeIndex = testCart.getBarcodeIndex()

            // Verify cart is initially empty
            expect(testCart.cartItems.value.length).toBe(0)
            expect(barcodeIndex.size).toBe(0)
            expect(testCart.getModificationOrder().length).toBe(0)

            // Clear the empty cart - should not throw
            testCart.clearCart()

            // Verify cart is still empty
            expect(testCart.cartItems.value.length).toBe(0)
            expect(barcodeIndex.size).toBe(0)
            expect(testCart.getModificationOrder().length).toBe(0)
            expect(testCart.isEmpty.value).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should clear cart with items that have various quantities', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              barcode: barcodeArb,
              scanCount: fc.integer({ min: 1, max: 10 })
            }),
            { minLength: 1, maxLength: 10 }
          ).map((items) => {
            // Ensure unique barcodes
            const seen = new Set<string>()
            return items.filter((item) => {
              const trimmed = item.barcode.trim()
              if (seen.has(trimmed)) return false
              seen.add(trimmed)
              return true
            })
          }).filter(arr => arr.length >= 1),
          async (itemsToAdd) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()
            const barcodeIndex = testCart.getBarcodeIndex()

            // Add items with various quantities (by scanning multiple times)
            for (const { barcode, scanCount } of itemsToAdd) {
              for (let i = 0; i < scanCount; i++) {
                testCart.addOrIncrementItem(barcode)
              }
            }

            // Verify items were added with correct quantities
            expect(testCart.cartItems.value.length).toBe(itemsToAdd.length)
            for (const { barcode, scanCount } of itemsToAdd) {
              const trimmedBarcode = barcode.trim()
              const item = testCart.cartItems.value.find(i => i.barcode === trimmedBarcode)
              expect(item).toBeDefined()
              expect(item!.quantity).toBe(scanCount)
            }

            // Clear the cart
            testCart.clearCart()

            // Verify everything is cleared
            expect(testCart.cartItems.value.length).toBe(0)
            expect(barcodeIndex.size).toBe(0)
            expect(testCart.getModificationOrder().length).toBe(0)
            expect(testCart.isEmpty.value).toBe(true)
            expect(testCart.totalItems.value).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 11: Checkout blocked with error items', () => {
    /**
     * **Validates: Requirements 5.5**
     *
     * For any cart containing at least one item with status 'error', the checkout
     * operation should be prevented and return a validation failure.
     */

    /**
     * Creates a mock InventreeService that returns empty results (part not found)
     * This will cause the cart item to enter error state
     */
    const createEmptyResultsService = (): InventreeService => {
      const mockApi = vi.fn()
      const service = new InventreeService(mockApi)
      vi.spyOn(service, 'scanBarcode').mockResolvedValue(null)
      vi.spyOn(service, 'searchParts').mockResolvedValue([])
      return service
    }

    /**
     * Creates a mock InventreeService that returns a valid part (causes loaded state)
     * Also mocks getStockItems and removeStock for successful checkout
     */
    const createSuccessService = (): InventreeService => {
      const mockApi = vi.fn()
      const service = new InventreeService(mockApi)
      const mockPart = {
        pk: 1,
        name: 'Test Part',
        description: 'A test part',
        IPN: 'TEST-001',
        in_stock: 100,
        image: null,
        thumbnail: null
      } as any
      vi.spyOn(service, 'scanBarcode').mockResolvedValue(mockPart)
      vi.spyOn(service, 'searchParts').mockResolvedValue([mockPart])
      // Mock getStockItems and removeStock for checkout functionality
      vi.spyOn(service, 'getStockItems').mockResolvedValue([
        { pk: 1, part: 1, quantity: 100, location: null, serial: null, batch: null, barcode_hash: '', notes: '' }
      ])
      vi.spyOn(service, 'removeStock').mockResolvedValue(undefined)
      return service
    }

    it('should prevent checkout when cart contains error items', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            // Create cart with mock service that returns empty results (causes error state)
            const mockService = createEmptyResultsService()
            const testCart = useCheckoutCart(mockService)

            // Add item - this triggers the lookup which will fail
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            // Wait for the async lookup to complete and set error state
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify item is now in error state
            const cartItem = testCart.cartItems.value.find(item => item.id === result!.id)
            expect(cartItem).toBeDefined()
            expect(cartItem!.status).toBe('error')

            // Verify hasErrors computed property is true
            expect(testCart.hasErrors.value).toBe(true)

            // Store the cart state before checkout attempt
            const itemCountBefore = testCart.cartItems.value.length
            const itemsBefore = [...testCart.cartItems.value]

            // Attempt checkout - should be prevented (Requirement 5.5)
            const checkoutResult = await testCart.checkout()

            // Verify checkout was blocked
            expect(checkoutResult.success).toBe(false)
            expect(checkoutResult.processedItems).toBe(0)

            // Verify the error items are returned in failedItems
            expect(checkoutResult.failedItems.length).toBeGreaterThan(0)
            expect(checkoutResult.failedItems.some(item => item.status === 'error')).toBe(true)

            // Verify error message indicates error items
            expect(checkoutResult.message).toContain('error')

            // Verify cart is NOT cleared (items remain)
            expect(testCart.cartItems.value.length).toBe(itemCountBefore)
            expect(testCart.cartItems.value[0]?.id).toBe(itemsBefore[0]?.id)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should prevent checkout when cart has mix of loaded and error items', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 2, maxLength: 10 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 2), // Need at least 2 unique barcodes
          fc.integer({ min: 0, max: 100 }), // Index selector for which item will be error
          async (uniqueBarcodes, errorIndexSelector) => {
            // Create cart with mock service that returns valid parts
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)

            // Select which item will be in error state
            const errorIndex = errorIndexSelector % uniqueBarcodes.length

            // Add all items
            const addedItems: CartItem[] = []
            for (let i = 0; i < uniqueBarcodes.length; i++) {
              const barcode = uniqueBarcodes[i]!
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              addedItems.push(result!)
            }

            // Wait for async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Manually set one item to error state to simulate a failed lookup
            const errorItem = addedItems[errorIndex]!
            errorItem.status = 'error'
            errorItem.errorMessage = 'Simulated lookup failure'

            // Verify we have a mix of loaded and error items
            const loadedCount = testCart.cartItems.value.filter(item => item.status === 'loaded').length
            const errorCount = testCart.cartItems.value.filter(item => item.status === 'error').length
            expect(loadedCount).toBeGreaterThan(0)
            expect(errorCount).toBe(1)

            // Verify hasErrors computed property is true
            expect(testCart.hasErrors.value).toBe(true)

            // Store the cart state before checkout attempt
            const itemCountBefore = testCart.cartItems.value.length

            // Attempt checkout - should be prevented (Requirement 5.5)
            const checkoutResult = await testCart.checkout()

            // Verify checkout was blocked
            expect(checkoutResult.success).toBe(false)
            expect(checkoutResult.processedItems).toBe(0)

            // Verify the error items are returned in failedItems
            expect(checkoutResult.failedItems.length).toBe(1)
            expect(checkoutResult.failedItems[0]?.id).toBe(errorItem.id)
            expect(checkoutResult.failedItems[0]?.status).toBe('error')

            // Verify cart is NOT cleared (items remain)
            expect(testCart.cartItems.value.length).toBe(itemCountBefore)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should prevent checkout when all items are in error state', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 5 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 1),
          async (uniqueBarcodes) => {
            // Create cart with mock service that returns empty results (all items will error)
            const mockService = createEmptyResultsService()
            const testCart = useCheckoutCart(mockService)

            // Add all items - all will enter error state
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
            }

            // Wait for async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify all items are in error state
            const allError = testCart.cartItems.value.every(item => item.status === 'error')
            expect(allError).toBe(true)

            // Verify hasErrors computed property is true
            expect(testCart.hasErrors.value).toBe(true)

            // Store the cart state before checkout attempt
            const itemCountBefore = testCart.cartItems.value.length

            // Attempt checkout - should be prevented (Requirement 5.5)
            const checkoutResult = await testCart.checkout()

            // Verify checkout was blocked
            expect(checkoutResult.success).toBe(false)
            expect(checkoutResult.processedItems).toBe(0)

            // Verify all error items are returned in failedItems
            expect(checkoutResult.failedItems.length).toBe(uniqueBarcodes.length)

            // Verify cart is NOT cleared (items remain)
            expect(testCart.cartItems.value.length).toBe(itemCountBefore)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should allow checkout when no items are in error state', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 5 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 1),
          async (uniqueBarcodes) => {
            // Create cart with mock service that returns valid parts
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)

            // Add all items - all will enter loaded state
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
            }

            // Wait for async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify all items are in loaded state
            const allLoaded = testCart.cartItems.value.every(item => item.status === 'loaded')
            expect(allLoaded).toBe(true)

            // Verify hasErrors computed property is false
            expect(testCart.hasErrors.value).toBe(false)

            // Attempt checkout - should succeed
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)
            expect(checkoutResult.processedItems).toBe(uniqueBarcodes.length)
            expect(checkoutResult.failedItems.length).toBe(0)

            // Verify cart is cleared after successful checkout
            expect(testCart.cartItems.value.length).toBe(0)
            expect(testCart.isEmpty.value).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return correct error message when checkout is blocked due to error items', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            // Create cart with mock service that returns empty results (causes error state)
            const mockService = createEmptyResultsService()
            const testCart = useCheckoutCart(mockService)

            // Add item - this triggers the lookup which will fail
            testCart.addOrIncrementItem(barcode)

            // Wait for the async lookup to complete and set error state
            await new Promise(resolve => setTimeout(resolve, 10))

            // Attempt checkout
            const checkoutResult = await testCart.checkout()

            // Verify the message indicates the reason for blocking
            expect(checkoutResult.success).toBe(false)
            expect(checkoutResult.message.toLowerCase()).toContain('error')
            // The message should indicate that error items are the problem
            expect(
              checkoutResult.message.toLowerCase().includes('error')
              || checkoutResult.message.toLowerCase().includes('cannot')
            ).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 15: Void removes most recently modified item', () => {
    /**
     * **Validates: Requirements 7.1**
     *
     * For any non-empty cart, when void is triggered, the item with the most recent
     * modification timestamp should be removed from the cart.
     */

    it('should remove the most recently added item when void is called', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 10 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 1), // Need at least 1 barcode
          async (uniqueBarcodes) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add all barcodes to cart sequentially
            const addedItems: CartItem[] = []
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              addedItems.push(result!)
              // Small delay to ensure distinct timestamps
              await new Promise(resolve => setTimeout(resolve, 1))
            }

            // Verify all items were added
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length)

            // The last added item should be the most recently modified
            const lastAddedItem = addedItems[addedItems.length - 1]!

            // Verify modification order has the last item at the end
            const modOrder = testCart.getModificationOrder()
            expect(modOrder[modOrder.length - 1]).toBe(lastAddedItem.id)

            // Call voidLastItem (Requirement 7.1)
            const voidedItem = testCart.voidLastItem()

            // Verify the voided item is the most recently added/modified item
            expect(voidedItem).not.toBeNull()
            expect(voidedItem!.id).toBe(lastAddedItem.id)
            expect(voidedItem!.barcode).toBe(lastAddedItem.barcode)

            // Verify item is no longer in cart
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length - 1)
            expect(testCart.cartItems.value.find(item => item.id === lastAddedItem.id)).toBeUndefined()

            // Verify item is no longer in modification order
            const modOrderAfter = testCart.getModificationOrder()
            expect(modOrderAfter).not.toContain(lastAddedItem.id)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should remove the most recently quantity-modified item when void is called', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 2, maxLength: 10 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 2), // Need at least 2 unique barcodes
          fc.integer({ min: 0, max: 100 }), // Index selector for which item to modify
          fc.integer({ min: 2, max: 100 }), // New quantity value
          async (uniqueBarcodes, indexSelector, newQuantity) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add all barcodes to cart
            const addedItems: CartItem[] = []
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              addedItems.push(result!)
            }

            // Verify all items were added
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length)

            // Select an item to modify (not the last one to make the test meaningful)
            // Use modulo to ensure valid index, but exclude the last item
            const modifyIndex = indexSelector % (uniqueBarcodes.length - 1)
            const itemToModify = addedItems[modifyIndex]!

            // Small delay to ensure distinct timestamps
            await new Promise(resolve => setTimeout(resolve, 5))

            // Update quantity of the selected item - this makes it the most recently modified
            const updateResult = testCart.updateQuantity(itemToModify.id, newQuantity)
            expect(updateResult).toBe(true)

            // Verify modification order now has the modified item at the end
            const modOrder = testCart.getModificationOrder()
            expect(modOrder[modOrder.length - 1]).toBe(itemToModify.id)

            // Call voidLastItem (Requirement 7.1)
            const voidedItem = testCart.voidLastItem()

            // Verify the voided item is the one we modified (most recently modified)
            expect(voidedItem).not.toBeNull()
            expect(voidedItem!.id).toBe(itemToModify.id)
            expect(voidedItem!.barcode).toBe(itemToModify.barcode)

            // Verify item is no longer in cart
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length - 1)
            expect(testCart.cartItems.value.find(item => item.id === itemToModify.id)).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should remove the most recently incremented item when void is called', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 2, maxLength: 10 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 2), // Need at least 2 unique barcodes
          fc.integer({ min: 0, max: 100 }), // Index selector for which item to re-scan
          async (uniqueBarcodes, indexSelector) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add all barcodes to cart
            const addedItems: CartItem[] = []
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              addedItems.push(result!)
            }

            // Verify all items were added
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length)

            // Select an item to re-scan (not the last one to make the test meaningful)
            const rescanIndex = indexSelector % (uniqueBarcodes.length - 1)
            const itemToRescan = addedItems[rescanIndex]!
            const barcodeToRescan = uniqueBarcodes[rescanIndex]!

            // Small delay to ensure distinct timestamps
            await new Promise(resolve => setTimeout(resolve, 5))

            // Re-scan the barcode - this increments quantity and makes it most recently modified
            const rescanResult = testCart.addOrIncrementItem(barcodeToRescan)
            expect(rescanResult).not.toBeNull()
            expect(rescanResult!.id).toBe(itemToRescan.id) // Same item, incremented
            expect(rescanResult!.quantity).toBe(2) // Quantity should be 2 now

            // Verify modification order now has the re-scanned item at the end
            const modOrder = testCart.getModificationOrder()
            expect(modOrder[modOrder.length - 1]).toBe(itemToRescan.id)

            // Call voidLastItem (Requirement 7.1)
            const voidedItem = testCart.voidLastItem()

            // Verify the voided item is the one we re-scanned (most recently modified)
            expect(voidedItem).not.toBeNull()
            expect(voidedItem!.id).toBe(itemToRescan.id)
            expect(voidedItem!.barcode).toBe(barcodeToRescan)

            // Verify item is no longer in cart
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length - 1)
            expect(testCart.cartItems.value.find(item => item.id === itemToRescan.id)).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return null when void is called on empty cart', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // No input needed
          async () => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Verify cart is empty
            expect(testCart.cartItems.value.length).toBe(0)
            expect(testCart.isEmpty.value).toBe(true)

            // Call voidLastItem on empty cart (Requirement 7.3)
            const voidedItem = testCart.voidLastItem()

            // Verify null is returned
            expect(voidedItem).toBeNull()

            // Verify cart is still empty
            expect(testCart.cartItems.value.length).toBe(0)
            expect(testCart.isEmpty.value).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return the voided item with correct data', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          fc.integer({ min: 1, max: 10 }), // Number of times to scan
          async (barcode, scanCount) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()
            const trimmedBarcode = barcode.trim()

            // Scan the barcode multiple times
            let lastResult: CartItem | null = null
            for (let i = 0; i < scanCount; i++) {
              lastResult = testCart.addOrIncrementItem(barcode)
              expect(lastResult).not.toBeNull()
            }

            // Verify item is in cart with correct quantity
            expect(testCart.cartItems.value.length).toBe(1)
            expect(testCart.cartItems.value[0]!.quantity).toBe(scanCount)

            // Call voidLastItem
            const voidedItem = testCart.voidLastItem()

            // Verify the returned item matches the expected item
            expect(voidedItem).not.toBeNull()
            expect(voidedItem!.barcode).toBe(trimmedBarcode)
            expect(voidedItem!.quantity).toBe(scanCount)
            expect(voidedItem!.id).toBe(lastResult!.id)

            // Verify cart is now empty
            expect(testCart.cartItems.value.length).toBe(0)
            expect(testCart.isEmpty.value).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should void items in reverse modification order with sequential voids', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 2, maxLength: 5 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 2), // Need at least 2 unique barcodes
          async (uniqueBarcodes) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add all barcodes to cart sequentially
            const addedItems: CartItem[] = []
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              addedItems.push(result!)
              // Small delay to ensure distinct timestamps
              await new Promise(resolve => setTimeout(resolve, 1))
            }

            // Verify all items were added
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length)

            // Void all items one by one - should be in reverse order of addition
            for (let i = uniqueBarcodes.length - 1; i >= 0; i--) {
              const expectedItem = addedItems[i]!

              // Verify the expected item is at the end of modification order
              const modOrder = testCart.getModificationOrder()
              expect(modOrder[modOrder.length - 1]).toBe(expectedItem.id)

              // Void the last item
              const voidedItem = testCart.voidLastItem()

              // Verify the voided item matches expected
              expect(voidedItem).not.toBeNull()
              expect(voidedItem!.id).toBe(expectedItem.id)
              expect(voidedItem!.barcode).toBe(expectedItem.barcode)

              // Verify cart size decreased
              expect(testCart.cartItems.value.length).toBe(i)
            }

            // Verify cart is now empty
            expect(testCart.cartItems.value.length).toBe(0)
            expect(testCart.isEmpty.value).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 12: Checkout removes stock for all valid items', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * For any cart with N valid items (status 'loaded'), when checkout succeeds,
     * stock removal should be called for each item with the correct quantity.
     */

    /**
     * Creates a mock InventreeService that tracks calls to removeStock
     * Returns a valid part for scanBarcode and tracks all removeStock calls
     * Uses synchronous resolution for faster test execution
     */
    const createTrackingService = () => {
      const mockApi = vi.fn()
      const service = new InventreeService(mockApi)

      // Track removeStock calls: { stockItemPk, quantity }[]
      const removeStockCalls: Array<{ stockItemPk: number, quantity: number, notes?: string }> = []

      // Map to store barcode -> pk mapping for consistent lookups
      // This ensures each unique barcode gets a unique pk
      const barcodeToPartPk = new Map<string, number>()
      let nextPartPk = 1

      // Mock scanBarcode to return a valid part with unique pk based on barcode
      vi.spyOn(service, 'scanBarcode').mockImplementation(async (barcode: string) => {
        // Get or create a unique pk for this barcode
        let pk = barcodeToPartPk.get(barcode)
        if (pk === undefined) {
          pk = nextPartPk++
          barcodeToPartPk.set(barcode, pk)
        }
        return {
          pk,
          name: `Part for ${barcode}`,
          description: 'A test part',
          IPN: `IPN-${barcode}`,
          in_stock: 1000, // High stock to avoid stock warnings
          image: null,
          thumbnail: null
        } as any
      })

      // Also mock searchParts for part search mode
      vi.spyOn(service, 'searchParts').mockImplementation(async (barcode: string) => {
        let pk = barcodeToPartPk.get(barcode)
        if (pk === undefined) {
          pk = nextPartPk++
          barcodeToPartPk.set(barcode, pk)
        }
        return [
          {
            pk,
            name: `Part for ${barcode}`,
            description: 'A test part',
            IPN: `IPN-${barcode}`,
            in_stock: 1000,
            image: null,
            thumbnail: null
          } as any
        ]
      })

      // Mock getStockItems to return a stock item for the part
      vi.spyOn(service, 'getStockItems').mockImplementation(async (partId: number) => {
        return [
          { pk: partId * 100, part: partId, quantity: 1000, location: null, serial: null, batch: null, barcode_hash: '', notes: '' }
        ]
      })

      // Mock removeStock to track calls
      vi.spyOn(service, 'removeStock').mockImplementation(async (stockItemPk: number, data: { quantity: number, notes?: string }) => {
        removeStockCalls.push({ stockItemPk, quantity: data.quantity, notes: data.notes })
        return undefined
      })

      return { service, removeStockCalls, barcodeToPartPk }
    }

    it('should call removeStock for each valid item with correct quantity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              barcode: barcodeArb,
              quantity: fc.integer({ min: 1, max: 50 })
            }),
            { minLength: 1, maxLength: 3 }
          ).map((items) => {
            // Ensure unique barcodes
            const seen = new Set<string>()
            return items.filter((item) => {
              const trimmed = item.barcode.trim()
              if (seen.has(trimmed)) return false
              seen.add(trimmed)
              return true
            })
          }).filter(arr => arr.length >= 1),
          async (itemsToAdd) => {
            // Create cart with tracking service
            const { service, removeStockCalls, barcodeToPartPk } = createTrackingService()
            const testCart = useCheckoutCart(service)

            // Add items to cart with specified quantities
            const addedItems: Array<{ barcode: string, quantity: number, itemId: string }> = []
            for (const { barcode, quantity } of itemsToAdd) {
              // Add item first
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()

              // Update quantity to the desired value
              if (quantity > 1) {
                testCart.updateQuantity(result!.id, quantity)
              }

              addedItems.push({
                barcode: barcode.trim(),
                quantity,
                itemId: result!.id
              })
            }

            // Wait for all async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify all items are in loaded state
            const allLoaded = testCart.cartItems.value.every(item => item.status === 'loaded')
            expect(allLoaded).toBe(true)

            // Verify cart has correct number of items
            expect(testCart.cartItems.value.length).toBe(itemsToAdd.length)

            // Clear any previous calls (from setup)
            removeStockCalls.length = 0

            // Perform checkout (Requirement 6.1)
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)
            expect(checkoutResult.processedItems).toBe(itemsToAdd.length)
            expect(checkoutResult.failedItems.length).toBe(0)

            // Verify removeStock was called for each item (Requirement 6.1)
            expect(removeStockCalls.length).toBe(itemsToAdd.length)

            // Verify each item had removeStock called with correct quantity
            for (const { barcode, quantity } of addedItems) {
              // Find the corresponding removeStock call
              // The stock item pk is derived from part pk (partPk * 100)
              // Part pk is assigned by the mock service based on order of first lookup
              const partPk = barcodeToPartPk.get(barcode)
              expect(partPk).toBeDefined()
              const expectedStockItemPk = partPk! * 100

              const matchingCall = removeStockCalls.find(call => call.stockItemPk === expectedStockItemPk)
              expect(matchingCall).toBeDefined()
              expect(matchingCall!.quantity).toBe(quantity)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should call removeStock exactly N times for N valid items', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 8 })
            .map(arr => [...new Set(arr.map(b => b.trim()))])
            .filter(arr => arr.length >= 1),
          async (uniqueBarcodes) => {
            // Create cart with tracking service
            const { service, removeStockCalls } = createTrackingService()
            const testCart = useCheckoutCart(service)

            // Add all items to cart
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
            }

            // Wait for all async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify all items are in loaded state
            const allLoaded = testCart.cartItems.value.every(item => item.status === 'loaded')
            expect(allLoaded).toBe(true)

            // Clear any previous calls
            removeStockCalls.length = 0

            // Perform checkout
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)

            // Verify removeStock was called exactly N times (Requirement 6.1)
            expect(removeStockCalls.length).toBe(uniqueBarcodes.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should pass correct quantity to removeStock for items scanned multiple times', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          fc.integer({ min: 2, max: 20 }),
          async (barcode, scanCount) => {
            // Create cart with tracking service
            const { service, removeStockCalls } = createTrackingService()
            const testCart = useCheckoutCart(service)

            // Scan the same barcode multiple times (increments quantity)
            for (let i = 0; i < scanCount; i++) {
              testCart.addOrIncrementItem(barcode)
            }

            // Wait for async lookup to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify item is loaded with correct quantity
            expect(testCart.cartItems.value.length).toBe(1)
            expect(testCart.cartItems.value[0]!.status).toBe('loaded')
            expect(testCart.cartItems.value[0]!.quantity).toBe(scanCount)

            // Clear any previous calls
            removeStockCalls.length = 0

            // Perform checkout
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)
            expect(checkoutResult.processedItems).toBe(1)

            // Verify removeStock was called once with the total quantity
            expect(removeStockCalls.length).toBe(1)
            expect(removeStockCalls[0]!.quantity).toBe(scanCount)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should include barcode in removeStock notes', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          async (barcode) => {
            // Create cart with tracking service
            const { service, removeStockCalls } = createTrackingService()
            const testCart = useCheckoutCart(service)
            const trimmedBarcode = barcode.trim()

            // Add item to cart
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            // Wait for async lookup to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify item is loaded
            expect(testCart.cartItems.value[0]!.status).toBe('loaded')

            // Clear any previous calls
            removeStockCalls.length = 0

            // Perform checkout
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)

            // Verify removeStock was called with notes containing the barcode
            expect(removeStockCalls.length).toBe(1)
            expect(removeStockCalls[0]!.notes).toBeDefined()
            expect(removeStockCalls[0]!.notes).toContain(trimmedBarcode)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should call removeStock with correct stock item pk for each part', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 2, maxLength: 3 })
            .map(arr => [...new Set(arr.map(b => b.trim()))])
            .filter(arr => arr.length >= 2),
          async (uniqueBarcodes) => {
            // Create cart with tracking service
            const { service, removeStockCalls, barcodeToPartPk } = createTrackingService()
            const testCart = useCheckoutCart(service)

            // Add all items to cart
            for (const barcode of uniqueBarcodes) {
              testCart.addOrIncrementItem(barcode)
            }

            // Wait for all async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify all items are loaded
            const allLoaded = testCart.cartItems.value.every(item => item.status === 'loaded')
            expect(allLoaded).toBe(true)

            // Clear any previous calls
            removeStockCalls.length = 0

            // Perform checkout
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)

            // Verify each barcode's stock item was called with correct pk
            for (const barcode of uniqueBarcodes) {
              // Get expected stock item pk from the mock's barcode-to-pk mapping
              const partPk = barcodeToPartPk.get(barcode)
              expect(partPk).toBeDefined()
              const expectedStockItemPk = partPk! * 100

              // Find the call for this stock item
              const matchingCall = removeStockCalls.find(call => call.stockItemPk === expectedStockItemPk)
              expect(matchingCall).toBeDefined()
            }

            // Verify no duplicate calls (each stock item called exactly once)
            const stockItemPks = removeStockCalls.map(call => call.stockItemPk)
            const uniquePks = new Set(stockItemPks)
            expect(uniquePks.size).toBe(removeStockCalls.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should distribute stock removal across multiple stock items when needed', async () => {
      // This test verifies that when a part has multiple stock items with limited quantities,
      // the checkout correctly distributes the removal across all of them

      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          fc.integer({ min: 3, max: 10 }), // Total quantity to remove
          async (barcode, totalQuantity) => {
            const mockApi = vi.fn()
            const service = new InventreeService(mockApi)
            const removeStockCalls: Array<{ stockItemPk: number, quantity: number }> = []
            const trimmedBarcode = barcode.trim()

            // Generate part pk from barcode
            const partPk = Math.abs(trimmedBarcode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) + 1

            const mockPart = {
              pk: partPk,
              name: `Part for ${trimmedBarcode}`,
              description: 'A test part',
              IPN: `IPN-${trimmedBarcode}`,
              in_stock: totalQuantity, // Total across all stock items
              image: null,
              thumbnail: null
            } as any

            // Mock scanBarcode to return a part with total stock equal to totalQuantity
            vi.spyOn(service, 'scanBarcode').mockResolvedValue(mockPart)
            vi.spyOn(service, 'searchParts').mockResolvedValue([mockPart])

            // Mock getStockItems to return multiple stock items, each with quantity of 1
            // This simulates the scenario where stock is distributed across many locations
            vi.spyOn(service, 'getStockItems').mockResolvedValue(
              Array.from({ length: totalQuantity }, (_, i) => ({
                pk: partPk * 100 + i,
                part: partPk,
                quantity: 1, // Each stock item has only 1 unit
                location: i,
                serial: null,
                batch: null,
                barcode_hash: '',
                notes: ''
              }))
            )

            // Mock removeStock to track calls
            vi.spyOn(service, 'removeStock').mockImplementation(async (stockItemPk: number, data: { quantity: number }) => {
              removeStockCalls.push({ stockItemPk, quantity: data.quantity })
              return undefined
            })

            const testCart = useCheckoutCart(service)

            // Add item and set quantity to totalQuantity
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()

            if (totalQuantity > 1) {
              testCart.updateQuantity(result!.id, totalQuantity)
            }

            // Wait for async lookup to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify item is loaded
            expect(testCart.cartItems.value[0]!.status).toBe('loaded')
            expect(testCart.cartItems.value[0]!.quantity).toBe(totalQuantity)

            // Perform checkout
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)
            expect(checkoutResult.processedItems).toBe(1)

            // Verify removeStock was called multiple times (once per stock item)
            expect(removeStockCalls.length).toBe(totalQuantity)

            // Verify each call removed exactly 1 unit (since each stock item has quantity 1)
            for (const call of removeStockCalls) {
              expect(call.quantity).toBe(1)
            }

            // Verify total removed equals requested quantity
            const totalRemoved = removeStockCalls.reduce((sum, call) => sum + call.quantity, 0)
            expect(totalRemoved).toBe(totalQuantity)
          }
        ),
        { numRuns: 50 } // Fewer runs since this test is more complex
      )
    })

    it('should remove from larger stock items first (optimization)', async () => {
      // This test verifies that stock removal is optimized by removing from larger stock items first

      const mockApi = vi.fn()
      const service = new InventreeService(mockApi)
      const removeStockCalls: Array<{ stockItemPk: number, quantity: number }> = []

      const mockPart = {
        pk: 1,
        name: 'Test Part',
        description: 'A test part',
        IPN: 'TEST-001',
        in_stock: 10, // Total stock
        image: null,
        thumbnail: null
      } as any

      // Mock scanBarcode and searchParts
      vi.spyOn(service, 'scanBarcode').mockResolvedValue(mockPart)
      vi.spyOn(service, 'searchParts').mockResolvedValue([mockPart])

      // Mock getStockItems to return stock items with varying quantities (unsorted)
      vi.spyOn(service, 'getStockItems').mockResolvedValue([
        { pk: 101, part: 1, quantity: 2, location: null, serial: null, batch: null, barcode_hash: '', notes: '' },
        { pk: 102, part: 1, quantity: 5, location: null, serial: null, batch: null, barcode_hash: '', notes: '' }, // Largest
        { pk: 103, part: 1, quantity: 3, location: null, serial: null, batch: null, barcode_hash: '', notes: '' }
      ])

      // Mock removeStock to track calls
      vi.spyOn(service, 'removeStock').mockImplementation(async (stockItemPk: number, data: { quantity: number }) => {
        removeStockCalls.push({ stockItemPk, quantity: data.quantity })
        return undefined
      })

      const testCart = useCheckoutCart(service)

      // Add item and set quantity to 7 (should use stock items 102 (5) + 103 (2))
      testCart.addOrIncrementItem('TEST-001')
      await new Promise(resolve => setTimeout(resolve, 10))
      testCart.updateQuantity(testCart.cartItems.value[0]!.id, 7)

      // Perform checkout
      const checkoutResult = await testCart.checkout()

      // Verify checkout succeeded
      expect(checkoutResult.success).toBe(true)

      // Verify the first call was to the largest stock item (pk 102 with quantity 5)
      expect(removeStockCalls[0]!.stockItemPk).toBe(102)
      expect(removeStockCalls[0]!.quantity).toBe(5)

      // Verify the second call was to the next largest (pk 103 with quantity 3, but only need 2)
      expect(removeStockCalls[1]!.stockItemPk).toBe(103)
      expect(removeStockCalls[1]!.quantity).toBe(2)

      // Verify total calls and quantity
      expect(removeStockCalls.length).toBe(2)
      const totalRemoved = removeStockCalls.reduce((sum, call) => sum + call.quantity, 0)
      expect(totalRemoved).toBe(7)
    })
  })

  describe('Property 13: Successful checkout clears cart', () => {
    /**
     * **Validates: Requirements 6.4**
     *
     * For any cart where all stock removals succeed, after checkout completes,
     * the cart should be empty.
     */

    /**
     * Creates a mock InventreeService that succeeds for all operations
     * Returns a valid part for scanBarcode and succeeds for all stock operations
     */
    const createSuccessService = (): InventreeService => {
      const mockApi = vi.fn()
      const service = new InventreeService(mockApi)

      // Mock scanBarcode to return a valid part with unique pk based on barcode
      vi.spyOn(service, 'scanBarcode').mockImplementation(async (barcode: string) => {
        // Generate a unique pk based on barcode hash
        const pk = Math.abs(barcode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) + 1
        return {
          pk,
          name: `Part for ${barcode}`,
          description: 'A test part',
          IPN: `IPN-${barcode}`,
          in_stock: 1000, // High stock to avoid stock warnings
          image: null,
          thumbnail: null
        } as any
      })

      // Also mock searchParts for part search mode
      vi.spyOn(service, 'searchParts').mockImplementation(async (barcode: string) => {
        const pk = Math.abs(barcode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) + 1
        return [
          {
            pk,
            name: `Part for ${barcode}`,
            description: 'A test part',
            IPN: `IPN-${barcode}`,
            in_stock: 1000,
            image: null,
            thumbnail: null
          } as any
        ]
      })

      // Mock getStockItems to return a stock item for the part
      vi.spyOn(service, 'getStockItems').mockImplementation(async (partId: number) => {
        return [
          { pk: partId * 100, part: partId, quantity: 1000, location: null, serial: null, batch: null, barcode_hash: '', notes: '' }
        ]
      })

      // Mock removeStock to succeed
      vi.spyOn(service, 'removeStock').mockResolvedValue(undefined)

      return service
    }

    it('should clear cartItems after successful checkout', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 5 })
            .map(arr => [...new Set(arr.map(b => b.trim()))])
            .filter(arr => arr.length >= 1),
          async (uniqueBarcodes) => {
            // Create cart with mock service that succeeds for all operations
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)

            // Add items to cart
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
            }

            // Wait for all async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify all items are in loaded state
            const allLoaded = testCart.cartItems.value.every(item => item.status === 'loaded')
            expect(allLoaded).toBe(true)

            // Verify cart has items before checkout
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length)
            expect(testCart.isEmpty.value).toBe(false)

            // Perform checkout (Requirement 6.4)
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)

            // Verify cartItems is empty (Requirement 6.4)
            expect(testCart.cartItems.value.length).toBe(0)
            expect(testCart.cartItems.value).toEqual([])
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should clear barcodeIndex after successful checkout', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 5 })
            .map(arr => [...new Set(arr.map(b => b.trim()))])
            .filter(arr => arr.length >= 1),
          async (uniqueBarcodes) => {
            // Create cart with mock service that succeeds for all operations
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)
            const barcodeIndex = testCart.getBarcodeIndex()

            // Add items to cart
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
            }

            // Wait for all async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify all items are in loaded state
            const allLoaded = testCart.cartItems.value.every(item => item.status === 'loaded')
            expect(allLoaded).toBe(true)

            // Verify barcodeIndex has entries before checkout
            expect(barcodeIndex.size).toBe(uniqueBarcodes.length)
            for (const barcode of uniqueBarcodes) {
              expect(barcodeIndex.has(barcode)).toBe(true)
            }

            // Perform checkout (Requirement 6.4)
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)

            // Verify barcodeIndex is empty (Requirement 6.4)
            expect(barcodeIndex.size).toBe(0)
            for (const barcode of uniqueBarcodes) {
              expect(barcodeIndex.has(barcode)).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should clear modificationOrder after successful checkout', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 5 })
            .map(arr => [...new Set(arr.map(b => b.trim()))])
            .filter(arr => arr.length >= 1),
          async (uniqueBarcodes) => {
            // Create cart with mock service that succeeds for all operations
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)

            // Add items to cart
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
            }

            // Wait for all async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify all items are in loaded state
            const allLoaded = testCart.cartItems.value.every(item => item.status === 'loaded')
            expect(allLoaded).toBe(true)

            // Verify modificationOrder has entries before checkout
            const modOrderBefore = testCart.getModificationOrder()
            expect(modOrderBefore.length).toBe(uniqueBarcodes.length)

            // Perform checkout (Requirement 6.4)
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)

            // Verify modificationOrder is empty (Requirement 6.4)
            const modOrderAfter = testCart.getModificationOrder()
            expect(modOrderAfter.length).toBe(0)
            expect(modOrderAfter).toEqual([])
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should set isEmpty computed to true after successful checkout', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 5 })
            .map(arr => [...new Set(arr.map(b => b.trim()))])
            .filter(arr => arr.length >= 1),
          async (uniqueBarcodes) => {
            // Create cart with mock service that succeeds for all operations
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)

            // Add items to cart
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
            }

            // Wait for all async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify all items are in loaded state
            const allLoaded = testCart.cartItems.value.every(item => item.status === 'loaded')
            expect(allLoaded).toBe(true)

            // Verify isEmpty is false before checkout
            expect(testCart.isEmpty.value).toBe(false)

            // Perform checkout (Requirement 6.4)
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)

            // Verify isEmpty computed is true (Requirement 6.4)
            expect(testCart.isEmpty.value).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should clear cart completely for items with various quantities', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              barcode: barcodeArb,
              quantity: fc.integer({ min: 1, max: 50 })
            }),
            { minLength: 1, maxLength: 5 }
          ).map((items) => {
            // Ensure unique barcodes
            const seen = new Set<string>()
            return items.filter((item) => {
              const trimmed = item.barcode.trim()
              if (seen.has(trimmed)) return false
              seen.add(trimmed)
              return true
            })
          }).filter(arr => arr.length >= 1),
          async (itemsToAdd) => {
            // Create cart with mock service that succeeds for all operations
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)
            const barcodeIndex = testCart.getBarcodeIndex()

            // Add items to cart with specified quantities
            for (const { barcode, quantity } of itemsToAdd) {
              // Add item first
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()

              // Update quantity to the desired value
              if (quantity > 1) {
                testCart.updateQuantity(result!.id, quantity)
              }
            }

            // Wait for all async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify all items are in loaded state
            const allLoaded = testCart.cartItems.value.every(item => item.status === 'loaded')
            expect(allLoaded).toBe(true)

            // Verify cart has items with correct quantities before checkout
            expect(testCart.cartItems.value.length).toBe(itemsToAdd.length)
            expect(testCart.totalItems.value).toBe(
              itemsToAdd.reduce((sum, item) => sum + item.quantity, 0)
            )

            // Perform checkout (Requirement 6.4)
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)
            expect(checkoutResult.processedItems).toBe(itemsToAdd.length)
            expect(checkoutResult.failedItems.length).toBe(0)

            // Verify cart is completely cleared (Requirement 6.4)
            expect(testCart.cartItems.value.length).toBe(0)
            expect(barcodeIndex.size).toBe(0)
            expect(testCart.getModificationOrder().length).toBe(0)
            expect(testCart.isEmpty.value).toBe(true)
            expect(testCart.totalItems.value).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should allow adding new items after successful checkout', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 3 })
            .map(arr => [...new Set(arr.map(b => b.trim()))])
            .filter(arr => arr.length >= 1),
          async (uniqueBarcodes) => {
            // Create cart with mock service that succeeds for all operations
            const mockService = createSuccessService()
            const testCart = useCheckoutCart(mockService)

            // Add items to cart
            const originalItemIds: string[] = []
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              originalItemIds.push(result!.id)
            }

            // Wait for all async lookups to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify all items are in loaded state
            const allLoaded = testCart.cartItems.value.every(item => item.status === 'loaded')
            expect(allLoaded).toBe(true)

            // Perform checkout (Requirement 6.4)
            const checkoutResult = await testCart.checkout()

            // Verify checkout succeeded
            expect(checkoutResult.success).toBe(true)

            // Verify cart is empty
            expect(testCart.cartItems.value.length).toBe(0)

            // Add the same barcodes again - they should be treated as new items
            for (const barcode of uniqueBarcodes) {
              const newResult = testCart.addOrIncrementItem(barcode)
              expect(newResult).not.toBeNull()

              // Verify new item has a different ID (it's a new item)
              expect(originalItemIds).not.toContain(newResult!.id)

              // Verify quantity is 1 (not incremented from previous)
              expect(newResult!.quantity).toBe(1)
            }

            // Verify cart has the correct number of new items
            expect(testCart.cartItems.value.length).toBe(uniqueBarcodes.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 16: Modification order is tracked correctly', () => {
    /**
     * **Validates: Requirements 7.4**
     *
     * For any sequence of cart operations (add, update quantity), the modification order
     * should reflect the chronological order of the most recent change to each item.
     * - The most recently modified item should always be at the end of the modification order
     * - Items should only appear once in the modification order
     */

    it('should track modification order correctly for any sequence of add operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 1, maxLength: 15 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 1),
          async (uniqueBarcodes) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Track expected modification order
            const expectedOrder: string[] = []

            // Add items sequentially
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()

              // After adding, this item should be at the end of modification order
              expectedOrder.push(result!.id)

              // Verify modification order matches expected
              const actualOrder = testCart.getModificationOrder()
              expect(actualOrder).toEqual(expectedOrder)

              // Verify the most recently modified item is at the end
              expect(actualOrder[actualOrder.length - 1]).toBe(result!.id)

              // Verify each item appears only once
              const uniqueIds = new Set(actualOrder)
              expect(uniqueIds.size).toBe(actualOrder.length)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should move item to end of modification order when quantity is updated', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 2, maxLength: 10 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 2),
          fc.integer({ min: 0, max: 100 }), // Index selector for which item to modify
          fc.integer({ min: 2, max: 100 }), // New quantity value
          async (uniqueBarcodes, indexSelector, newQuantity) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add all items
            const addedItems: CartItem[] = []
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              addedItems.push(result!)
            }

            // Select an item to modify (not the last one to make the test meaningful)
            const modifyIndex = indexSelector % (uniqueBarcodes.length - 1)
            const itemToModify = addedItems[modifyIndex]!

            // Verify item is NOT at the end of modification order before update
            const orderBefore = testCart.getModificationOrder()
            expect(orderBefore[orderBefore.length - 1]).not.toBe(itemToModify.id)

            // Update quantity
            const updateResult = testCart.updateQuantity(itemToModify.id, newQuantity)
            expect(updateResult).toBe(true)

            // Verify item is now at the end of modification order (Requirement 7.4)
            const orderAfter = testCart.getModificationOrder()
            expect(orderAfter[orderAfter.length - 1]).toBe(itemToModify.id)

            // Verify item appears only once in modification order
            const occurrences = orderAfter.filter(id => id === itemToModify.id).length
            expect(occurrences).toBe(1)

            // Verify total count is still the same
            expect(orderAfter.length).toBe(uniqueBarcodes.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should move item to end of modification order when barcode is re-scanned', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 2, maxLength: 10 })
            .map(arr => [...new Set(arr.map(b => b.trim()))]) // Ensure unique trimmed barcodes
            .filter(arr => arr.length >= 2),
          fc.integer({ min: 0, max: 100 }), // Index selector for which item to re-scan
          async (uniqueBarcodes, indexSelector) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add all items
            const addedItems: CartItem[] = []
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              addedItems.push(result!)
            }

            // Select an item to re-scan (not the last one to make the test meaningful)
            const rescanIndex = indexSelector % (uniqueBarcodes.length - 1)
            const itemToRescan = addedItems[rescanIndex]!
            const barcodeToRescan = uniqueBarcodes[rescanIndex]!

            // Verify item is NOT at the end of modification order before re-scan
            const orderBefore = testCart.getModificationOrder()
            expect(orderBefore[orderBefore.length - 1]).not.toBe(itemToRescan.id)

            // Re-scan the barcode (increments quantity)
            const rescanResult = testCart.addOrIncrementItem(barcodeToRescan)
            expect(rescanResult).not.toBeNull()
            expect(rescanResult!.id).toBe(itemToRescan.id) // Same item

            // Verify item is now at the end of modification order (Requirement 7.4)
            const orderAfter = testCart.getModificationOrder()
            expect(orderAfter[orderAfter.length - 1]).toBe(itemToRescan.id)

            // Verify item appears only once in modification order
            const occurrences = orderAfter.filter(id => id === itemToRescan.id).length
            expect(occurrences).toBe(1)

            // Verify total count is still the same (no new items added)
            expect(orderAfter.length).toBe(uniqueBarcodes.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain correct modification order through mixed operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Start with some initial barcodes
          fc.array(barcodeArb, { minLength: 2, maxLength: 5 })
            .map(arr => [...new Set(arr.map(b => b.trim()))])
            .filter(arr => arr.length >= 2),
          // Generate a sequence of operations
          fc.array(
            fc.oneof(
              fc.record({
                type: fc.constant('updateQuantity' as const),
                targetIndex: fc.integer({ min: 0, max: 10 }),
                quantity: fc.integer({ min: 1, max: 100 })
              }),
              fc.record({
                type: fc.constant('rescan' as const),
                targetIndex: fc.integer({ min: 0, max: 10 })
              })
            ),
            { minLength: 1, maxLength: 10 }
          ),
          async (initialBarcodes, operations) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add initial items
            const addedItems: CartItem[] = []
            for (const barcode of initialBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              addedItems.push(result!)
            }

            // Track which item should be most recently modified
            let lastModifiedId = addedItems[addedItems.length - 1]!.id

            // Execute operations
            for (const op of operations) {
              const targetIndex = op.targetIndex % addedItems.length
              const targetItem = addedItems[targetIndex]!

              if (op.type === 'updateQuantity') {
                const updateResult = testCart.updateQuantity(targetItem.id, op.quantity)
                if (updateResult) {
                  lastModifiedId = targetItem.id
                }
              } else if (op.type === 'rescan') {
                const barcode = initialBarcodes[targetIndex]!
                testCart.addOrIncrementItem(barcode)
                lastModifiedId = targetItem.id
              }

              // After each operation, verify:
              const modOrder = testCart.getModificationOrder()

              // 1. The most recently modified item is at the end
              expect(modOrder[modOrder.length - 1]).toBe(lastModifiedId)

              // 2. Each item appears only once
              const uniqueIds = new Set(modOrder)
              expect(uniqueIds.size).toBe(modOrder.length)

              // 3. Total count matches number of items in cart
              expect(modOrder.length).toBe(addedItems.length)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should ensure items appear only once in modification order after multiple modifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          barcodeArb,
          fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 2, maxLength: 20 }),
          async (barcode, quantities) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add the item
            const result = testCart.addOrIncrementItem(barcode)
            expect(result).not.toBeNull()
            const itemId = result!.id

            // Update quantity multiple times
            for (const quantity of quantities) {
              testCart.updateQuantity(itemId, quantity)

              // After each update, verify item appears only once
              const modOrder = testCart.getModificationOrder()
              const occurrences = modOrder.filter(id => id === itemId).length
              expect(occurrences).toBe(1)

              // Verify item is at the end
              expect(modOrder[modOrder.length - 1]).toBe(itemId)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should correctly track chronological order of modifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(barcodeArb, { minLength: 3, maxLength: 8 })
            .map(arr => [...new Set(arr.map(b => b.trim()))])
            .filter(arr => arr.length >= 3),
          // Generate a permutation of indices to modify in order
          fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 3, maxLength: 10 }),
          async (uniqueBarcodes, modificationSequence) => {
            // Create fresh cart for each test case
            const testCart = useCheckoutCart()

            // Add all items
            const addedItems: CartItem[] = []
            for (const barcode of uniqueBarcodes) {
              const result = testCart.addOrIncrementItem(barcode)
              expect(result).not.toBeNull()
              addedItems.push(result!)
            }

            // Track the expected order based on most recent modification
            // Initially, items are in order of addition
            const expectedOrder = addedItems.map(item => item.id)

            // Modify items in the given sequence
            for (const indexSelector of modificationSequence) {
              const targetIndex = indexSelector % addedItems.length
              const targetItem = addedItems[targetIndex]!

              // Update quantity (this modifies the item)
              testCart.updateQuantity(targetItem.id, 5)

              // Update expected order: remove item from current position, add to end
              const currentPos = expectedOrder.indexOf(targetItem.id)
              if (currentPos !== -1) {
                expectedOrder.splice(currentPos, 1)
              }
              expectedOrder.push(targetItem.id)

              // Verify actual order matches expected
              const actualOrder = testCart.getModificationOrder()
              expect(actualOrder).toEqual(expectedOrder)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
