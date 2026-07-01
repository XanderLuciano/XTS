import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Part, StockItem } from '~/types/inventree'
import type { InventreeService } from '~/services/inventree.service'
import type { ReceiptLine } from '~/utils/checkoutReceipt'

/**
 * Cart item status representing the lifecycle of a scanned item
 */
export type CartItemStatus = 'loading' | 'loaded' | 'error'

/**
 * Classification of a scanned barcode: resolved only to a Part, or to a
 * specific Stock_Item (a batch/receipt line of that part).
 */
export type ScanType = 'part' | 'stock_item'

/**
 * Represents an item in the checkout cart
 * @see Requirements 2.1, 2.3, 7.4
 */
export interface CartItem {
  /** Unique identifier (UUID) */
  id: string
  /** Scanned barcode string */
  barcode: string
  /** Quantity in cart */
  quantity: number
  /** Current status of the cart item */
  status: CartItemStatus
  /** Loaded part data from InvenTree (optional, populated after lookup) */
  part?: Part
  /** Resolved stock item, populated when scanType === 'stock_item' */
  stockItem?: StockItem
  /** What the scanned barcode resolved to; defaults to 'part' */
  scanType: ScanType
  /** Error message if lookup failed */
  errorMessage?: string
  /** Timestamp when item was first added */
  addedAt: number
  /** Timestamp of last quantity change or modification */
  lastModifiedAt: number
  /**
   * Internal: set when the item is created under the Add_Full_Quantity toggle
   * so the async lookup knows to set the quantity to the full available amount
   * once the part/stock item resolves.
   */
  pendingFullQuantity?: boolean
}

/**
 * Result of a checkout operation
 */
export interface CheckoutResult {
  success: boolean
  processedItems: number
  failedItems: CartItem[]
  message: string
  /**
   * Receipt lines for each stock removal performed, populated only when a
   * receipt was requested for the checkout. One cart item may yield multiple
   * lines when its quantity is drawn from several stock items.
   */
  receiptLines?: ReceiptLine[]
}

/**
 * Options for a checkout operation.
 */
export interface CheckoutOptions {
  /** Free-text reason recorded against each stock removal in InvenTree. */
  reason?: string
  /** When true, collect {@link ReceiptLine}s describing what was removed. */
  makeReceipt?: boolean
}

/**
 * Interface for the checkout cart composable
 */
export interface UseCheckoutCart {
  // State
  cartItems: Ref<CartItem[]>
  isCheckingOut: Ref<boolean>
  searchMode: Ref<'barcode' | 'part'>

  // Actions
  addOrIncrementItem: (barcode: string, options?: { addFullQuantity?: boolean }) => CartItem | null
  updateQuantity: (itemId: string, quantity: number) => boolean
  removeItem: (itemId: string) => CartItem | null
  voidLastItem: () => CartItem | null
  clearCart: () => void
  checkout: (options?: CheckoutOptions) => Promise<CheckoutResult>
  setSearchMode: (mode: 'barcode' | 'part') => void

  // Computed
  hasErrors: ComputedRef<boolean>
  isEmpty: ComputedRef<boolean>
  totalItems: ComputedRef<number>
  hasStockWarnings: ComputedRef<boolean>

  // Per-item helpers
  /** Whether a single cart item requests more than its scan-type-aware availability. */
  itemHasStockWarning: (item: CartItem) => boolean

  // Internal state accessors (for testing)
  getBarcodeIndex: () => Map<string, string>
  getModificationOrder: () => string[]
}

/**
 * Generates a UUID v4 string
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Composable for managing checkout cart state
 * Handles cart items, barcode caching, and modification history tracking
 *
 * @param inventreeService - Optional InventreeService instance for part lookups
 * @returns UseCheckoutCart interface with state and actions
 * @see Requirements 2.1, 2.3, 7.4
 */
export const useCheckoutCart = (inventreeService?: InventreeService): UseCheckoutCart => {
  // Reactive state for cart items
  const cartItems = ref<CartItem[]>([])

  // Checkout in progress flag
  const isCheckingOut = ref(false)

  // Search mode: 'barcode' uses InvenTree barcode API, 'part' uses part search
  const searchMode = ref<'barcode' | 'part'>('barcode')

  // Barcode index for quick duplicate lookup (barcode -> itemId)
  // Requirement 2.5: Local cache of scanned barcodes
  const barcodeIndex = new Map<string, string>()

  // Modification order stack for void functionality (most recent at end)
  // Requirement 7.4: Track order of cart modifications
  const modificationOrder: string[] = []

  /**
   * Sets the search mode for part lookups
   * @param mode - 'barcode' for InvenTree barcode API, 'part' for part search
   */
  const setSearchMode = (mode: 'barcode' | 'part'): void => {
    searchMode.value = mode
  }

  /**
   * Resolves the full available quantity for a cart item based on its scan type.
   *
   * - `stock_item` scans use the resolved Stock_Item's `quantity`.
   * - `part` scans use the resolved Part's `in_stock` total.
   *
   * When the underlying source value is missing, zero, or non-finite, this
   * falls back to `1` so a scan under the Add_Full_Quantity toggle still adds
   * a usable quantity.
   *
   * @param item - The cart item to resolve the full quantity for
   * @returns A positive quantity, or `1` as a fallback
   * @see Requirements 3.4, 3.5, 3.7
   */
  const fullQuantityFor = (item: CartItem): number => {
    const source = item.scanType === 'stock_item'
      ? item.stockItem?.quantity
      : item.part?.in_stock

    if (typeof source !== 'number' || !Number.isFinite(source) || source <= 0) {
      return 1
    }

    return source
  }

  /**
   * Resolves the true available quantity for a cart item based on its scan
   * type, used for stock-warning evaluation.
   *
   * Unlike {@link fullQuantityFor}, this does NOT fall back to `1` when the
   * source value is missing. It returns `undefined` when the relevant source
   * (stock item for `stock_item`, part for `part`) has not resolved yet, so a
   * not-yet-loaded item never spuriously triggers a stock warning.
   *
   * @param item - The cart item to resolve availability for
   * @returns The available quantity, or `undefined` when unknown
   * @see Requirements 5.1, 5.2
   */
  const availableQuantityFor = (item: CartItem): number | undefined => {
    const source = item.scanType === 'stock_item'
      ? item.stockItem?.quantity
      : item.part?.in_stock

    if (typeof source !== 'number' || !Number.isFinite(source)) {
      return undefined
    }

    return source
  }

  /**
   * Whether a single cart item requests more than its available stock.
   *
   * The availability source is scan-type-aware:
   * - `stock_item` scans compare against the scanned Stock_Item's `quantity`.
   * - `part` scans compare against the Part's `in_stock` total.
   *
   * Items whose availability is not yet known (lookup in flight, or a
   * `stock_item` scan without a loaded stock item / a `part` scan without a
   * loaded part) do not warn.
   *
   * @param item - The cart item to evaluate
   * @returns true when the requested quantity exceeds availability
   * @see Requirements 5.1, 5.2, 5.3
   */
  const itemHasStockWarning = (item: CartItem): boolean => {
    const available = availableQuantityFor(item)
    if (available === undefined) {
      return false
    }
    return item.quantity > available
  }

  /**
   * Looks up part details for a cart item from InvenTree.
   *
   * In barcode mode (default), this uses `scanBarcodeWithStock`, which resolves
   * both the Part and any linked Stock_Item from a single scan:
   * - A resolved Stock_Item classifies the item as `stock_item` and stores the
   *   stock item alongside its part.
   * - A resolved Part with no Stock_Item classifies the item as `part`.
   * - Neither resolving sets the item to an error state.
   *
   * In part-search mode, this uses `searchParts` and always classifies the
   * result as `part` with no specific Stock_Item.
   *
   * When the item was created under the Add_Full_Quantity toggle
   * (`pendingFullQuantity`), the resolved full quantity is applied once the
   * lookup completes and the flag is cleared. This is a fire-and-forget async
   * operation.
   *
   * @param item - The cart item to look up
   * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.2, 3.1, 3.2, 3.3
   */
  const lookupPart = async (item: CartItem): Promise<void> => {
    // Skip lookup if no service is provided
    if (!inventreeService) {
      return
    }

    try {
      let part: Part | null = null
      let stockItem: StockItem | null = null

      if (searchMode.value === 'barcode') {
        // Requirement 1.1: Resolve both the Part and any linked Stock_Item.
        const result = await inventreeService.scanBarcodeWithStock(item.barcode)
        part = result.part
        stockItem = result.stockItem
      } else {
        // Part Search mode always yields a part-level scan (Requirement 1.6).
        const parts = await inventreeService.searchParts(item.barcode)
        part = parts.length > 0 ? (parts[0] ?? null) : null
      }

      // Find the item in the cart array to update it reactively
      const cartItem = cartItems.value.find(i => i.id === item.id)
      if (!cartItem) {
        // Item was removed from cart while lookup was in progress
        return
      }

      if (!part && !stockItem) {
        // Requirement 1.4 / 3.2: No results - set error state
        cartItem.status = 'error'
        cartItem.errorMessage = searchMode.value === 'barcode'
          ? `Barcode not found: ${item.barcode}`
          : `Part not found for: ${item.barcode}`
        // Trigger reactivity by reassigning the array
        cartItems.value = [...cartItems.value]
        return
      }

      if (searchMode.value === 'barcode' && stockItem) {
        // Requirement 1.2: Barcode resolved a specific Stock_Item.
        cartItem.stockItem = stockItem
        cartItem.scanType = 'stock_item'
        if (part) {
          cartItem.part = part
        }
      } else {
        // Requirement 1.3 / 1.6: Part-only barcode or part-search result.
        cartItem.scanType = 'part'
        if (part) {
          cartItem.part = part
        }
      }

      cartItem.status = 'loaded'

      // Requirement 3.4, 3.5, 3.7: Apply the full quantity for items added
      // under the Add_Full_Quantity toggle now that the lookup has resolved.
      if (cartItem.pendingFullQuantity) {
        cartItem.quantity = fullQuantityFor(cartItem)
        cartItem.lastModifiedAt = Date.now()
        cartItem.pendingFullQuantity = false
      }

      // Trigger reactivity by reassigning the array
      cartItems.value = [...cartItems.value]
    } catch (error) {
      // Find the item in the cart array to update it reactively
      const cartItem = cartItems.value.find(i => i.id === item.id)
      if (!cartItem) {
        return
      }

      // Requirement 3.2, 3.3: Lookup failed - set error state with message
      cartItem.status = 'error'
      cartItem.errorMessage = error instanceof Error
        ? error.message
        : 'Network error - unable to lookup part'
      // Trigger reactivity by reassigning the array
      cartItems.value = [...cartItems.value]
    }
  }

  /**
   * Adds a new item or increments quantity of existing item.
   *
   * When `options.addFullQuantity` is enabled, a scan sets the quantity to the
   * full available amount for the item rather than incrementing by one:
   * - Existing item already loaded → quantity is set to `fullQuantityFor(item)`.
   * - Existing item still loading → `pendingFullQuantity` is flagged so the
   *   in-flight lookup applies the full quantity on resolve.
   * - New item → created with `pendingFullQuantity` set so the lookup applies
   *   the full quantity once the part/stock item resolves.
   *
   * When the toggle is off, the existing scan-to-increment-by-one behavior is
   * preserved for all scan types.
   *
   * @param barcode - The scanned barcode string
   * @param options - Optional behavior flags; `addFullQuantity` sets the item
   *   to its full available quantity instead of incrementing by one
   * @returns The created or updated CartItem, or null if barcode is invalid
   * @see Requirements 3.3, 3.4, 3.5, 3.6, 3.7, 6.2
   */
  const addOrIncrementItem = (
    barcode: string,
    options?: { addFullQuantity?: boolean }
  ): CartItem | null => {
    // Validate barcode - ignore empty or whitespace-only
    const trimmedBarcode = barcode.trim()
    if (!trimmedBarcode) {
      return null
    }

    const addFullQuantity = options?.addFullQuantity === true
    const now = Date.now()

    // Check if barcode already exists in cart (Requirement 2.3)
    const existingItemId = barcodeIndex.get(trimmedBarcode)

    if (existingItemId) {
      // Find and update existing item (Requirement 2.4 - immediate update)
      const existingItem = cartItems.value.find(item => item.id === existingItemId)
      if (existingItem) {
        if (addFullQuantity) {
          if (existingItem.status === 'loaded') {
            // Requirement 3.6: Re-scan sets (not increments) to full quantity.
            existingItem.quantity = fullQuantityFor(existingItem)
            existingItem.pendingFullQuantity = false
          } else {
            // Lookup still in flight - defer applying the full quantity until
            // the async lookup resolves (Requirement 3.4, 3.5).
            existingItem.pendingFullQuantity = true
          }
        } else {
          // Requirement 3.3, 6.2: Toggle off preserves increment-by-one.
          existingItem.quantity++
        }
        existingItem.lastModifiedAt = now

        // Update modification order - move to end of stack
        const orderIndex = modificationOrder.indexOf(existingItemId)
        if (orderIndex !== -1) {
          modificationOrder.splice(orderIndex, 1)
        }
        modificationOrder.push(existingItemId)

        return existingItem
      }
    }

    // Create new cart item (Requirement 2.1)
    const newItem: CartItem = {
      id: generateUUID(),
      barcode: trimmedBarcode,
      quantity: 1,
      status: 'loading',
      scanType: 'part',
      addedAt: now,
      lastModifiedAt: now,
      // Requirement 3.4, 3.5, 3.7: Defer full-quantity resolution to the async
      // lookup, which knows the resolved part/stock item.
      pendingFullQuantity: addFullQuantity
    }

    // Add to cart items
    cartItems.value.push(newItem)

    // Add to barcode index for quick lookup (Requirement 2.5)
    barcodeIndex.set(trimmedBarcode, newItem.id)

    // Add to modification order
    modificationOrder.push(newItem.id)

    // Trigger lazy load of part details (fire-and-forget)
    // Requirement 2.2: Initiate lazy load after adding item
    // Note: We don't await this - it runs in the background
    lookupPart(newItem)

    return newItem
  }

  /**
   * Updates the quantity of a cart item
   * @param itemId - The ID of the item to update
   * @param quantity - The new quantity value
   * @returns true if update succeeded, false otherwise
   * @see Requirements 3.4, 4.3, 4.4
   */
  const updateQuantity = (itemId: string, quantity: number): boolean => {
    const item = cartItems.value.find(i => i.id === itemId)

    if (!item) {
      return false
    }

    // Requirement 3.4: Error items reject quantity updates
    if (item.status === 'error') {
      return false
    }

    // Validate quantity > 0
    if (quantity <= 0 || !Number.isFinite(quantity)) {
      return false
    }

    // Update quantity immediately (Requirement 4.4)
    item.quantity = quantity
    item.lastModifiedAt = Date.now()

    // Update modification order - move to end of stack
    const orderIndex = modificationOrder.indexOf(itemId)
    if (orderIndex !== -1) {
      modificationOrder.splice(orderIndex, 1)
    }
    modificationOrder.push(itemId)

    return true
  }

  /**
   * Removes an item from the cart
   * @param itemId - The ID of the item to remove
   * @returns The removed CartItem, or null if not found
   * @see Requirements 4.5, 4.6
   */
  const removeItem = (itemId: string): CartItem | null => {
    const itemIndex = cartItems.value.findIndex(i => i.id === itemId)

    if (itemIndex === -1) {
      return null
    }

    const item = cartItems.value[itemIndex]

    // Safety check (should never happen since we found the index)
    if (!item) {
      return null
    }

    // Remove from cart items
    cartItems.value.splice(itemIndex, 1)

    // Remove from barcode index (Requirement 4.6)
    barcodeIndex.delete(item.barcode)

    // Remove from modification order
    const orderIndex = modificationOrder.indexOf(itemId)
    if (orderIndex !== -1) {
      modificationOrder.splice(orderIndex, 1)
    }

    return item
  }

  /**
   * Removes the most recently modified item from the cart
   * @returns The voided CartItem, or null if cart is empty
   * @see Requirements 7.1, 7.3
   */
  const voidLastItem = (): CartItem | null => {
    // Requirement 7.3: Handle empty cart case
    if (modificationOrder.length === 0) {
      return null
    }

    // Get most recent item from modification order (Requirement 7.1)
    const lastItemId = modificationOrder[modificationOrder.length - 1]

    if (!lastItemId) {
      return null
    }

    return removeItem(lastItemId)
  }

  /**
   * Clears all items from the cart
   * @see Requirements 5.1, 5.2
   */
  const clearCart = (): void => {
    // Clear all items (Requirement 5.1)
    cartItems.value = []

    // Clear barcode cache (Requirement 5.2)
    barcodeIndex.clear()

    // Clear modification order
    modificationOrder.length = 0
  }

  /**
   * Processes checkout for all valid cart items
   * @param options - Optional reason text and receipt generation flag
   * @returns CheckoutResult with success status and details
   * @see Requirements 6.1, 6.3, 6.4, 6.5
   */
  const checkout = async (options: CheckoutOptions = {}): Promise<CheckoutResult> => {
    const reason = (options.reason || '').trim()
    const makeReceipt = options.makeReceipt === true
    const receiptLines: ReceiptLine[] = []
    // Validate cart state
    if (cartItems.value.length === 0) {
      return {
        success: false,
        processedItems: 0,
        failedItems: [],
        message: 'Cart is empty'
      }
    }

    // Check for error items (Requirement 5.5)
    const errorItems = cartItems.value.filter(item => item.status === 'error')
    if (errorItems.length > 0) {
      return {
        success: false,
        processedItems: 0,
        failedItems: errorItems,
        message: 'Cannot checkout with error items in cart'
      }
    }

    // Check for stock warnings using scan-type-aware availability
    // (Requirements 4.3, 5.1, 5.2, 5.3): stock_item lines are gated against the
    // scanned stock item's quantity, part lines against the part's in_stock.
    const stockWarningItems = cartItems.value.filter(item => itemHasStockWarning(item))
    if (stockWarningItems.length > 0) {
      return {
        success: false,
        processedItems: 0,
        failedItems: stockWarningItems,
        message: 'Some items exceed available stock'
      }
    }

    // Set checkout in progress (Requirement 6.5)
    isCheckingOut.value = true

    try {
      // If no service is provided, we can't perform stock removal
      // Return success but note that no actual stock was removed
      if (!inventreeService) {
        const processedCount = cartItems.value.length
        clearCart()
        return {
          success: true,
          processedItems: processedCount,
          failedItems: [],
          message: `Successfully checked out ${processedCount} item(s)`
        }
      }

      // Track results for each item (Requirement 6.1, 6.3)
      const failedItems: CartItem[] = []
      let processedCount = 0

      // Process each cart item
      for (const item of cartItems.value) {
        // Skip items without a part (shouldn't happen after validation, but be safe)
        if (!item.part) {
          failedItems.push(item)
          item.status = 'error'
          item.errorMessage = 'No part data available'
          continue
        }

        // Build the removal note: prefer the user-supplied reason, always
        // retaining the scanned barcode for traceability (Requirement 4.4).
        const removalNote = reason
          ? `${reason} (barcode: ${item.barcode})`
          : `Self-checkout kiosk removal for barcode: ${item.barcode}`

        // Requirement 4.1: A stock_item scan draws down only the scanned stock
        // item via a single removeStock call — no getStockItems distribution.
        if (item.scanType === 'stock_item' && item.stockItem) {
          const stockItem = item.stockItem

          // Requirement 4.3: Defensive re-check against the scanned stock item's
          // quantity. The stock-warning gate should already block this, but if
          // reached, mark the item in error rather than over-removing.
          if (item.quantity > stockItem.quantity) {
            failedItems.push(item)
            item.status = 'error'
            item.errorMessage = `Requested ${item.quantity} exceeds stock item quantity ${stockItem.quantity}`
            continue
          }

          try {
            // Requirement 4.1: Single removal targeting the scanned stock item.
            await inventreeService.removeStock(stockItem.pk, {
              quantity: item.quantity,
              notes: removalNote
            })

            // Requirement 4.5: Receipt line attributes to the scanned stock item.
            if (makeReceipt) {
              receiptLines.push({
                partName: item.part.name,
                ipn: item.part.IPN,
                revision: item.part.revision,
                vendor: stockItem.batch,
                quantity: item.quantity,
                stockNotes: stockItem.notes || '',
                stockItemPk: stockItem.pk
              })
            }

            processedCount++
          } catch (error) {
            // Stock removal failed - mark item as failed (Requirement 6.3)
            failedItems.push(item)
            item.status = 'error'
            item.errorMessage = error instanceof Error
              ? error.message
              : 'Failed to remove stock'
          }

          continue
        }

        try {
          // Requirement 4.2: Part scans keep the existing distribution across
          // all of the part's stock items via getStockItems.
          const stockItems = await inventreeService.getStockItems(item.part.pk)

          if (stockItems.length === 0) {
            // No stock items found - mark as failed (Requirement 6.3)
            failedItems.push(item)
            item.status = 'error'
            item.errorMessage = 'No stock items found for this part'
            continue
          }

          // Distribute stock removal across multiple stock items
          // This handles the case where a part has multiple stock items with varying quantities
          let remainingToRemove = item.quantity
          let totalRemoved = 0

          // Sort stock items by quantity descending to optimize removal
          const sortedStockItems = [...stockItems].sort((a, b) => b.quantity - a.quantity)

          for (const stockItem of sortedStockItems) {
            if (remainingToRemove <= 0) break
            if (stockItem.quantity <= 0) continue

            // Calculate how much to remove from this stock item
            const removeFromThis = Math.min(remainingToRemove, stockItem.quantity)

            // Remove stock from this stock item
            await inventreeService.removeStock(stockItem.pk, {
              quantity: removeFromThis,
              notes: removalNote
            })

            // Record a receipt line for what was pulled from this stock item.
            if (makeReceipt) {
              receiptLines.push({
                partName: item.part.name,
                ipn: item.part.IPN,
                revision: item.part.revision,
                vendor: stockItem.batch,
                quantity: removeFromThis,
                stockNotes: stockItem.notes || '',
                stockItemPk: stockItem.pk
              })
            }

            totalRemoved += removeFromThis
            remainingToRemove -= removeFromThis
          }

          // Check if we removed the full requested quantity
          if (remainingToRemove > 0) {
            // Partial removal - this shouldn't happen if validation passed, but handle it
            failedItems.push(item)
            item.status = 'error'
            item.errorMessage = `Only removed ${totalRemoved} of ${item.quantity} units (insufficient stock across all locations)`
            continue
          }

          // Success - increment processed count
          processedCount++
        } catch (error) {
          // Stock removal failed - mark item as failed (Requirement 6.3)
          failedItems.push(item)
          item.status = 'error'
          item.errorMessage = error instanceof Error
            ? error.message
            : 'Failed to remove stock'
        }
      }

      // Determine overall result
      if (failedItems.length === 0) {
        // All items succeeded - clear cart (Requirement 6.4)
        clearCart()
        return {
          success: true,
          processedItems: processedCount,
          failedItems: [],
          message: `Successfully checked out ${processedCount} item(s)`,
          receiptLines: makeReceipt ? receiptLines : undefined
        }
      } else if (processedCount > 0) {
        // Partial success - remove successful items, keep failed items in cart
        // Remove successfully processed items from cart
        const failedItemIds = new Set(failedItems.map(item => item.id))
        const successfulItems = cartItems.value.filter(item => !failedItemIds.has(item.id))

        // Remove successful items from cart and cache
        for (const successItem of successfulItems) {
          removeItem(successItem.id)
        }

        return {
          success: false,
          processedItems: processedCount,
          failedItems: [...failedItems],
          message: `Partially completed: ${processedCount} item(s) checked out, ${failedItems.length} failed`,
          receiptLines: makeReceipt ? receiptLines : undefined
        }
      } else {
        // All items failed - keep cart intact for retry
        return {
          success: false,
          processedItems: 0,
          failedItems: [...failedItems],
          message: 'Checkout failed for all items'
        }
      }
    } finally {
      isCheckingOut.value = false
    }
  }

  // Computed properties

  /**
   * Whether any cart item has an error status
   * @see Requirement 5.5
   */
  const hasErrors = computed(() =>
    cartItems.value.some(item => item.status === 'error')
  )

  /**
   * Whether the cart is empty
   */
  const isEmpty = computed(() => cartItems.value.length === 0)

  /**
   * Total quantity of all items in cart
   */
  const totalItems = computed(() =>
    cartItems.value.reduce((sum, item) => sum + item.quantity, 0)
  )

  /**
   * Whether any item has quantity exceeding its scan-type-aware availability.
   *
   * `stock_item` lines are compared against the scanned Stock_Item quantity and
   * `part` lines against the Part's `in_stock` total.
   *
   * @see Requirements 5.1, 5.2, 5.3
   */
  const hasStockWarnings = computed(() =>
    cartItems.value.some(item => itemHasStockWarning(item))
  )

  // Internal state accessors for testing
  const getBarcodeIndex = () => barcodeIndex
  const getModificationOrder = () => [...modificationOrder]

  return {
    // State
    cartItems,
    isCheckingOut,
    searchMode,

    // Actions
    addOrIncrementItem,
    updateQuantity,
    removeItem,
    voidLastItem,
    clearCart,
    checkout,
    setSearchMode,

    // Computed
    hasErrors,
    isEmpty,
    totalItems,
    hasStockWarnings,

    // Per-item helpers
    itemHasStockWarning,

    // Internal state accessors (for testing)
    getBarcodeIndex,
    getModificationOrder
  }
}
