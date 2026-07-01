<script setup lang="ts">
import { resolveImageUrl as _resolveImageUrl } from '~/utils/resolveImageUrl'
import { buildCheckoutReceiptMarkdown, buildCheckoutReceiptCsv, type ReceiptLine } from '~/utils/checkoutReceipt'

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

// Optional checkout reason recorded against each stock removal in InvenTree
const checkoutReason = ref('')

// Persisted "Add full quantity" toggle. When enabled, a scan sets the cart
// quantity to the full available amount for the scanned item instead of
// incrementing by one.
// @see Requirements 3.1, 3.2, 6.1
const ADD_FULL_QUANTITY_KEY = 'checkout_add_full_quantity'
const addFullQuantity = ref(false)

// Receipt opt-in + generated receipt state
const makeReceipt = ref(false)
const receiptLines = ref<ReceiptLine[]>([])
const receiptReason = ref('')
const receiptGeneratedAt = ref<Date | null>(null)

/** Markdown receipt rendered from the last checkout, for copy/paste + print. */
const receiptMarkdown = computed(() =>
  buildCheckoutReceiptMarkdown({
    lines: receiptLines.value,
    reason: receiptReason.value,
    generatedAt: receiptGeneratedAt.value ?? new Date()
  })
)

/** Total quantity of items removed, shown in the receipt header. */
const receiptTotalQty = computed(() =>
  receiptLines.value.reduce((sum, l) => sum + l.quantity, 0)
)

/** Human-friendly generated timestamp for the rendered receipt. */
const receiptGeneratedLabel = computed(() =>
  (receiptGeneratedAt.value ?? new Date()).toLocaleString()
)

const copyReceipt = async () => {
  try {
    await navigator.clipboard.writeText(receiptMarkdown.value)
    toast.add({ title: 'Receipt copied to clipboard', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', description: 'Select and copy manually', color: 'error' })
  }
}

const printReceipt = () => {
  window.print()
}

/** Build a timestamped filename like checkout-receipt-2026-06-29T12-00-00.csv */
const receiptFilename = (ext: string): string => {
  const ts = (receiptGeneratedAt.value ?? new Date())
    .toISOString()
    .replace(/[:.]/g, '-')
  return `checkout-receipt-${ts}.${ext}`
}

const saveCsv = () => {
  const csv = buildCheckoutReceiptCsv(receiptLines.value)
  // Prepend a BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = receiptFilename('csv')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  toast.add({ title: 'CSV saved', color: 'success' })
}

const dismissReceipt = () => {
  receiptLines.value = []
  receiptGeneratedAt.value = null
  receiptReason.value = ''
}

/**
 * Handles barcode scan (Enter key press)
 * Adds item to cart and clears input
 * @see Requirements 2.1, 2.6
 */
const handleScan = () => {
  if (!barcodeInput.value.trim()) return

  addOrIncrementItem(barcodeInput.value, { addFullQuantity: addFullQuantity.value })
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
    const el: unknown = barcodeInputRef.value
    if (!el) return
    // The ref may be the raw <input>, or a Nuxt UI component instance with $el.
    const root = el instanceof HTMLElement
      ? el
      : (el as { $el?: HTMLElement }).$el
    const input = root?.querySelector('input') ?? root
    if (input instanceof HTMLElement) input.focus()
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

  const result = await checkout({
    reason: checkoutReason.value,
    makeReceipt: makeReceipt.value
  })

  if (result.success) {
    // Capture receipt lines (if requested) before the cart is cleared.
    if (makeReceipt.value && result.receiptLines && result.receiptLines.length > 0) {
      receiptLines.value = result.receiptLines
      receiptReason.value = checkoutReason.value.trim()
      receiptGeneratedAt.value = new Date()
    }
    checkoutReason.value = ''
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

  // Restore the persisted "Add full quantity" toggle. Guard against
  // localStorage being unavailable or holding a corrupt value; default to
  // disabled in that case.
  // @see Requirements 3.2, 6.1
  try {
    addFullQuantity.value = localStorage.getItem(ADD_FULL_QUANTITY_KEY) === 'true'
  } catch {
    addFullQuantity.value = false
  }
})

// Persist the "Add full quantity" toggle whenever it changes.
// @see Requirement 3.2
watch(addFullQuantity, (enabled) => {
  try {
    localStorage.setItem(ADD_FULL_QUANTITY_KEY, enabled ? 'true' : 'false')
  } catch {
    // localStorage unavailable — persistence is best-effort, ignore.
  }
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
    <div class="mb-6 print:hidden">
      <h1 class="text-2xl font-bold mb-1">
        Self-Checkout
      </h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Scan items to add to cart, then checkout to remove from stock
      </p>
    </div>

    <UCard class="print:hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">
              Self-Checkout
            </h2>
            <UTooltip
              text="Scan items to build a cart, then checkout to remove from stock."
              arrow
            >
              <UIcon
                name="i-lucide-help-circle"
                class="w-4 h-4 text-muted cursor-help"
              />
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
            <UKbd
              value="/"
              size="sm"
            />
          </template>
        </UInput>

        <UCheckbox
          v-model="addFullQuantity"
          label="Add full quantity"
          description="Scanning sets the quantity to the full available amount instead of adding one."
        />
      </div>

      <USeparator class="mb-4" />

      <div class="flex items-center justify-between mb-3">
        <span class="text-sm text-gray-500">Cart ({{ totalItems }})</span>
        <UBadge
          v-if="cartItems.length > 0"
          color="primary"
          size="sm"
        >
          {{ cartItems.length }} item(s)
        </UBadge>
      </div>

      <!-- Empty Cart State -->
      <div
        v-if="cartItems.length === 0"
        class="text-center py-12 text-gray-500"
      >
        <UIcon
          name="i-lucide-shopping-cart"
          class="w-12 h-12 mx-auto mb-4 opacity-50"
        />
        <p class="text-lg">
          Cart is empty
        </p>
        <p class="text-sm">
          Scan a barcode to add items
        </p>
      </div>

      <!-- Cart Items List (placeholder for task 5.3) -->
      <div
        v-else
        class="space-y-3"
      >
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
              <UIcon
                name="i-lucide-loader-2"
                class="w-6 h-6 animate-spin text-gray-400"
              />
              <div>
                <p class="font-mono font-semibold">
                  {{ item.barcode }}
                </p>
                <p class="text-sm text-gray-500">
                  Loading...
                </p>
              </div>
            </template>

            <!-- Loaded State -->
            <template v-else-if="item.status === 'loaded' && item.part">
              <img
                v-if="item.part.thumbnail || item.part.image"
                :src="resolveImageUrl(item.part.thumbnail || item.part.image)"
                :alt="item.part.name"
                class="w-12 h-12 object-cover rounded"
              >
              <UIcon
                v-else
                name="i-lucide-package"
                class="w-12 h-12 text-gray-400"
              />
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <p class="font-semibold">
                    {{ item.part.name }}
                  </p>
                  <!-- Scan-type indicator distinguishing a stock-item scan from a part scan -->
                  <!-- @see Requirement 2.5 -->
                  <UBadge
                    v-if="item.scanType === 'stock_item'"
                    color="primary"
                    variant="subtle"
                    size="sm"
                    icon="i-lucide-box"
                  >
                    Stock Item
                  </UBadge>
                  <UBadge
                    v-else
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    icon="i-lucide-package"
                  >
                    Part
                  </UBadge>
                </div>
                <!-- Part-wide stock total, always shown. @see Requirement 2.1 -->
                <p class="text-sm text-gray-500">
                  Stock: {{ item.part.in_stock }} | Barcode: {{ item.barcode }}
                </p>
                <!-- Stock-item quantity + batch label, only for stock-item scans. -->
                <!-- @see Requirements 2.2, 2.3 -->
                <p
                  v-if="item.scanType === 'stock_item' && item.stockItem"
                  class="text-sm text-gray-500"
                >
                  This batch: {{ item.stockItem.quantity }}<span v-if="item.stockItem.batch"> | Batch: {{ item.stockItem.batch }}</span>
                </p>
              </div>
            </template>

            <!-- Error State -->
            <template v-else-if="item.status === 'error'">
              <UIcon
                name="i-lucide-alert-circle"
                class="w-6 h-6 text-red-500"
              />
              <div>
                <p class="font-mono font-semibold text-red-700 dark:text-red-400">
                  {{ item.barcode }}
                </p>
                <p class="text-sm text-red-600 dark:text-red-400">
                  {{ item.errorMessage }}
                </p>
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
            <span
              v-else
              class="text-sm text-gray-500 w-20 text-center"
            >
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
        <div class="space-y-4">
          <!-- Optional checkout reason + receipt opt-in -->
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div class="flex-1">
              <label class="block text-xs font-medium text-gray-500 mb-1">
                Checkout reason (optional)
              </label>
              <UInput
                v-model="checkoutReason"
                placeholder="e.g. prototype build, RMA, customer sample..."
                icon="i-lucide-message-square-text"
                class="w-full"
              />
              <p class="text-xs text-gray-400 mt-1">
                Recorded against each stock removal in InvenTree.
              </p>
            </div>
            <UCheckbox
              v-model="makeReceipt"
              label="Make a receipt"
              class="sm:pb-7"
            />
          </div>

          <div class="flex flex-wrap gap-4 justify-end">
            <UButton
              color="warning"
              variant="outline"
              size="lg"
              icon="i-lucide-undo-2"
              @click="handleVoidLast"
            >
              Void Last <UKbd
                value="Esc"
                size="sm"
              />
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
        </div>
      </template>
    </UCard>

    <!-- ============ Checkout Receipt ============ -->
    <UCard
      v-if="receiptLines.length > 0"
      class="mt-6 receipt-card"
    >
      <template #header>
        <div class="flex items-center justify-between print:hidden">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-receipt"
              class="w-5 h-5 text-primary"
            />
            <h2 class="text-lg font-semibold">
              Checkout Receipt
            </h2>
          </div>
          <div class="flex gap-2">
            <UButton
              size="sm"
              variant="outline"
              icon="i-lucide-copy"
              @click="copyReceipt"
            >
              Copy Markdown
            </UButton>
            <UButton
              size="sm"
              variant="outline"
              icon="i-lucide-file-spreadsheet"
              @click="saveCsv"
            >
              Save CSV
            </UButton>
            <UButton
              size="sm"
              variant="outline"
              icon="i-lucide-printer"
              @click="printReceipt"
            >
              Print
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-x"
              @click="dismissReceipt"
            >
              Dismiss
            </UButton>
          </div>
        </div>
      </template>

      <!-- Rendered, human-readable receipt (also what gets printed) -->
      <div class="receipt-body">
        <div class="hidden print:block mb-4">
          <h1 class="text-xl font-bold">
            Checkout Receipt
          </h1>
        </div>

        <dl class="text-sm mb-4 space-y-1">
          <div class="flex gap-2">
            <dt class="font-medium text-gray-500 dark:text-gray-400 w-32">
              Generated
            </dt>
            <dd>{{ receiptGeneratedLabel }}</dd>
          </div>
          <div
            v-if="receiptReason"
            class="flex gap-2"
          >
            <dt class="font-medium text-gray-500 dark:text-gray-400 w-32">
              Reason
            </dt>
            <dd>{{ receiptReason }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="font-medium text-gray-500 dark:text-gray-400 w-32">
              Total removed
            </dt>
            <dd>{{ receiptTotalQty }}</dd>
          </div>
        </dl>

        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse receipt-table">
            <thead>
              <tr class="border-b-2 border-gray-300 dark:border-gray-600 text-left">
                <th class="py-2 pr-3 font-semibold">
                  Part
                </th>
                <th class="py-2 px-3 font-semibold">
                  IPN
                </th>
                <th class="py-2 px-3 font-semibold">
                  Rev
                </th>
                <th class="py-2 px-3 font-semibold">
                  Vendor
                </th>
                <th class="py-2 px-3 font-semibold text-right">
                  Qty
                </th>
                <th class="py-2 pl-3 font-semibold">
                  Stock Notes
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(line, idx) in receiptLines"
                :key="`${line.stockItemPk}-${idx}`"
                class="border-b border-gray-200 dark:border-gray-700"
              >
                <td class="py-2 pr-3">
                  {{ line.partName }}
                </td>
                <td class="py-2 px-3 font-mono">
                  {{ line.ipn || '—' }}
                </td>
                <td class="py-2 px-3">
                  {{ line.revision || '—' }}
                </td>
                <td class="py-2 px-3">
                  {{ line.vendor || '—' }}
                </td>
                <td class="py-2 px-3 text-right tabular-nums">
                  {{ line.quantity }}
                </td>
                <td class="py-2 pl-3 text-gray-600 dark:text-gray-400">
                  {{ line.stockNotes || '—' }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                <td
                  class="py-2 pr-3"
                  colspan="4"
                >
                  Total
                </td>
                <td class="py-2 px-3 text-right tabular-nums">
                  {{ receiptTotalQty }}
                </td>
                <td class="py-2 pl-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </UCard>
  </div>
</template>

<style>
@media print {
  .print\:hidden {
    display: none !important;
  }

  /* Show only the receipt when printing, laid out for a clean paper copy. */
  .receipt-card {
    box-shadow: none !important;
    border: none !important;
  }

  .receipt-table th,
  .receipt-table td {
    border-color: #999 !important;
  }
}
</style>
