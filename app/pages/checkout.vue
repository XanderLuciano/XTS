<script setup lang="ts">
import { resolveImageUrl as _resolveImageUrl } from '~/utils/resolveImageUrl'

const toast = useToast()
const config = useRuntimeConfig()

/**
 * Resolves a relative InvenTree image URL to an absolute URL.
 * Delegates to the shared utility, passing the configured API base URL.
 */
const resolveImageUrl = (url: string | undefined | null): string => {
  return _resolveImageUrl(url, config.public.inventreeApiUrl as string)
}

// Initialize the checkout cart composable with the InventreeService
// useInventreeApi() already returns an InventreeService instance
const inventreeService = useInventreeApi()
const {
  cartItems,
  isCheckingOut,
  searchMode,
  addOrIncrementItem,
  updateQuantity,
  removeItem,
  voidLastItem,
  clearCart,
  checkout,
  setSearchMode,
  hasErrors,
  isEmpty,
  totalItems,
  hasStockWarnings
} = useCheckoutCart(inventreeService)

// Barcode input state
const barcodeInput = ref('')
const barcodeInputRef = ref<HTMLInputElement | null>(null)

/**
 * Handles barcode scan (Enter key press)
 * Adds item to cart and clears input
 * @see Requirements 2.1, 2.6
 */
const handleScan = () => {
  if (!barcodeInput.value.trim()) return
  
  addOrIncrementItem(barcodeInput.value)
  barcodeInput.value = ''
  
  // Maintain focus on input for next scan
  focusInput()
}

/**
 * Focuses the barcode input field
 * @see Requirements 8.1, 8.4
 */
const focusInput = () => {
  nextTick(() => {
    const el = barcodeInputRef.value as any
    const input = el?.$el?.querySelector('input') ?? el
    input?.focus?.()
  })
}

/**
 * Handles void last item action
 * @see Requirements 7.1, 7.2
 */
const handleVoidLast = () => {
  const voidedItem = voidLastItem()
  if (voidedItem) {
    toast.add({
      title: 'Item voided',
      description: `Removed: ${voidedItem.barcode}`,
      color: 'warning'
    })
  }
  focusInput()
}

/**
 * Handles clear cart action
 * @see Requirements 5.1, 5.2
 */
const handleClearCart = () => {
  clearCart()
  toast.add({
    title: 'Cart cleared',
    color: 'info'
  })
  focusInput()
}

/**
 * Handles checkout action
 * @see Requirements 5.3, 5.4, 5.5, 6.1-6.5
 */
const handleCheckout = async () => {
  if (isEmpty.value) {
    toast.add({
      title: 'Cart is empty',
      description: 'Scan items before checking out',
      color: 'warning'
    })
    return
  }
  
  if (hasErrors.value) {
    toast.add({
      title: 'Cannot checkout',
      description: 'Remove error items before checking out',
      color: 'error'
    })
    return
  }
  
  if (hasStockWarnings.value) {
    toast.add({
      title: 'Cannot checkout',
      description: 'Some items exceed available stock',
      color: 'error'
    })
    return
  }
  
  const result = await checkout()
  
  if (result.success) {
    toast.add({
      title: 'Checkout complete',
      description: result.message,
      color: 'success'
    })
  } else {
    toast.add({
      title: 'Checkout failed',
      description: result.message,
      color: 'error'
    })
  }
  
  focusInput()
}

/**
 * Handles quantity update for a cart item
 * @see Requirements 4.3, 4.4
 */
const handleQuantityUpdate = (itemId: string, newQuantity: number) => {
  if (newQuantity > 0) {
    updateQuantity(itemId, newQuantity)
  }
}

/**
 * Handles remove item action
 * @see Requirements 4.5, 4.6
 */
const handleRemoveItem = (itemId: string) => {
  removeItem(itemId)
  focusInput()
}

// Auto-focus input on page load
// @see Requirements 1.2, 8.4
onMounted(() => {
  focusInput()
})

// Keyboard shortcut for void (Escape key)
// @see Requirement 7.1
onMounted(() => {
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleVoidLast()
    }
    if (event.key === '/') {
      const tag = (event.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      event.preventDefault()
      focusInput()
    }
  }
  
  window.addEventListener('keydown', handleKeydown)
  
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
})
</script>

<template>
  <div class="p-6 w-full max-w-4xl mx-auto">
    <div class="mb-6">
      <h1 class="text-2xl font-bold mb-1">Self-Checkout</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">Scan items to add to cart, then checkout to remove from stock</p>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">Self-Checkout</h2>
            <UTooltip text="Scan items to build a cart, then checkout to remove from stock." arrow>
              <UIcon name="i-lucide-help-circle" class="w-4 h-4 text-muted cursor-help" />
            </UTooltip>
          </div>
          <div class="flex gap-2">
            <UButton 
              size="xs"
              :variant="searchMode === 'barcode' ? 'solid' : 'outline'"
              @click="setSearchMode('barcode')"
            >
              Barcode Lookup
            </UButton>
            <UButton 
              size="xs"
              :variant="searchMode === 'part' ? 'solid' : 'outline'"
              @click="setSearchMode('part')"
            >
              Part Search
            </UButton>
          </div>
        </div>
      </template>

      <div class="space-y-2 mb-4">
        <UInput
          ref="barcodeInputRef"
          v-model="barcodeInput"
          :placeholder="searchMode === 'barcode' ? 'Scan barcode...' : 'Search parts...'"
          :icon="searchMode === 'barcode' ? 'i-lucide-scan-barcode' : 'i-lucide-search'"
          size="lg"
          autofocus
          @keyup.enter="handleScan"
        >
          <template #trailing>
            <UKbd value="/" size="sm" />
          </template>
        </UInput>
      </div>

      <USeparator class="mb-4" />

      <div class="flex items-center justify-between mb-3">
        <span class="text-sm text-gray-500">Cart ({{ totalItems }})</span>
        <UBadge v-if="cartItems.length > 0" color="primary" size="sm">
          {{ cartItems.length }} item(s)
        </UBadge>
      </div>

      <!-- Empty Cart State -->
      <div v-if="cartItems.length === 0" class="text-center py-12 text-gray-500">
        <UIcon name="i-lucide-shopping-cart" class="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p class="text-lg">Cart is empty</p>
        <p class="text-sm">Scan a barcode to add items</p>
      </div>

      <!-- Cart Items List (placeholder for task 5.3) -->
      <div v-else class="space-y-3">
        <div
          v-for="item in cartItems"
          :key="item.id"
          class="flex items-center justify-between p-4 rounded-lg border"
          :class="{
            'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700': item.status === 'loading',
            'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800': item.status === 'loaded',
            'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800': item.status === 'error'
          }"
        >
          <!-- Item Info -->
          <div class="flex items-center gap-4 flex-1">
            <!-- Loading State -->
            <template v-if="item.status === 'loading'">
              <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-gray-400" />
              <div>
                <p class="font-mono font-semibold">{{ item.barcode }}</p>
                <p class="text-sm text-gray-500">Loading...</p>
              </div>
            </template>

            <!-- Loaded State -->
            <template v-else-if="item.status === 'loaded' && item.part">
              <img
                v-if="item.part.thumbnail || item.part.image"
                :src="resolveImageUrl(item.part.thumbnail || item.part.image)"
                :alt="item.part.name"
                class="w-12 h-12 object-cover rounded"
              />
              <UIcon v-else name="i-lucide-package" class="w-12 h-12 text-gray-400" />
              <div class="flex-1">
                <p class="font-semibold">{{ item.part.name }}</p>
                <p class="text-sm text-gray-500">
                  Stock: {{ item.part.in_stock }} | Barcode: {{ item.barcode }}
                </p>
              </div>
            </template>

            <!-- Error State -->
            <template v-else-if="item.status === 'error'">
              <UIcon name="i-lucide-alert-circle" class="w-6 h-6 text-red-500" />
              <div>
                <p class="font-mono font-semibold text-red-700 dark:text-red-400">{{ item.barcode }}</p>
                <p class="text-sm text-red-600 dark:text-red-400">{{ item.errorMessage }}</p>
              </div>
            </template>
          </div>

          <!-- Quantity and Actions -->
          <div class="flex items-center gap-3">
            <!-- Quantity Input (disabled for error items) -->
            <UInput
              v-if="item.status !== 'error'"
              :model-value="item.quantity"
              type="number"
              min="1"
              size="sm"
              class="w-20"
              @update:model-value="(val: string | number) => handleQuantityUpdate(item.id, Number(val))"
              @focus="($event.target as HTMLInputElement)?.select()"
            />
            <span v-else class="text-sm text-gray-500 w-20 text-center">
              Qty: {{ item.quantity }}
            </span>

            <!-- Remove Button -->
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              icon="i-lucide-trash-2"
              @click="handleRemoveItem(item.id)"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex flex-wrap gap-4 justify-end">
          <UButton
            color="warning"
            variant="outline"
            size="lg"
            icon="i-lucide-undo-2"
            @click="handleVoidLast"
          >
            Void Last <UKbd value="Esc" size="sm" />
          </UButton>

          <UButton
            color="neutral"
            variant="outline"
            size="lg"
            icon="i-lucide-trash"
            @click="handleClearCart"
          >
            Clear Cart
          </UButton>

          <UButton
            color="primary"
            size="lg"
            icon="i-lucide-check"
            :loading="isCheckingOut"
            :disabled="hasErrors || isEmpty || isCheckingOut || hasStockWarnings"
            @click="handleCheckout"
          >
            Checkout
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
