<script setup lang="ts">
import type { Part, PartCategory, StockItem } from '~/types/inventree'
import type { DropdownMenuItem } from '@nuxt/ui'
import { generateBarcode, extractBarcodeFromNotes, setBarcodeInNotes } from '~/utils/barcode'

const VENDOR_OPTIONS = ['YihShan', 'UMT', 'NRG', 'Prime', 'CIM', 'CIMTAS', 'KMS']

const inventree = useInventreeApi()
const toast = useToast()
const { print: printLabel, load: loadPrinterSettings } = usePrinterSettings()
const { listenForUsbEvents, reconnect: reconnectLocalPrinter } = useLocalPrinter()

const searchQuery = ref('')
const debouncedSearch = ref('')
const parts = ref<Part[]>([])
const totalCount = ref(0)
const currentPage = ref(1)
const pageSize = ref(25)
const pageSizeOptions = [10, 25, 50, 100, 500]
const isLoading = ref(false)
const printingPartPk = ref<number | null>(null)
const categoryMap = ref<Map<number, string>>(new Map())

// Part detail modal state
const isDetailOpen = ref(false)
const detailPart = ref<Part | null>(null)
const detailStockItems = ref<StockItem[]>([])
const isLoadingDetail = ref(false)
const editingBatchPk = ref<number | null>(null)
const editingBatchValue = ref('')
const isEditingCategory = ref(false)
const editingCategoryValue = ref<number | undefined>(undefined)

// Legacy barcode replace confirmation
const isReplaceConfirmOpen = ref(false)
const replacePart = ref<Part | null>(null)
const replaceStockItem = ref<StockItem | null>(null)
const isReplacingBarcode = ref(false)

const categoryItems = computed(() =>
  Array.from(categoryMap.value.entries()).map(([pk, name]) => ({ label: name, value: pk }))
)

let searchTimeout: ReturnType<typeof setTimeout> | null = null

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize.value))

const vendorItems = computed(() =>
  VENDOR_OPTIONS.map(v => ({ label: v, value: v }))
)

const fetchParts = async () => {
  isLoading.value = true
  try {
    const offset = (currentPage.value - 1) * pageSize.value
    const result = await inventree.listParts({
      search: debouncedSearch.value || undefined,
      limit: pageSize.value,
      offset
    })
    parts.value = result.results
    totalCount.value = result.count
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load parts'
    toast.add({ title: 'Error loading parts', description: message, color: 'error' })
  } finally {
    isLoading.value = false
  }
}

const onSearchInput = () => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    debouncedSearch.value = searchQuery.value
    currentPage.value = 1
    fetchParts()
  }, 300)
}

const goToPage = (page: number) => {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  fetchParts()
}

const changePageSize = (size: number) => {
  pageSize.value = size
  currentPage.value = 1
  fetchParts()

  if (import.meta.server) return
  try {
    localStorage.setItem('stock_view_page_size', String(size))
  } catch { /* ignore */ }
}

// --- Part Detail Modal ---
const openPartDetail = async (part: Part) => {
  detailPart.value = part
  isDetailOpen.value = true
  isLoadingDetail.value = true
  editingBatchPk.value = null
  isEditingCategory.value = false

  try {
    detailStockItems.value = await inventree.getStockItems(part.pk)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load stock items'
    toast.add({ title: 'Error', description: message, color: 'error' })
    detailStockItems.value = []
  } finally {
    isLoadingDetail.value = false
  }
}

const startEditCategory = () => {
  if (!detailPart.value) return
  editingCategoryValue.value = detailPart.value.category ?? undefined
  isEditingCategory.value = true
}

const cancelEditCategory = () => {
  isEditingCategory.value = false
}

const saveCategory = async () => {
  if (!detailPart.value) return
  try {
    const categoryValue = editingCategoryValue.value ?? null
    await inventree.updatePart(detailPart.value.pk, { category: categoryValue })
    detailPart.value.category = categoryValue
    // Also update in the main list
    const inList = parts.value.find(p => p.pk === detailPart.value!.pk)
    if (inList) inList.category = categoryValue
    toast.add({ title: 'Category updated', color: 'success' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update category'
    toast.add({ title: 'Update failed', description: message, color: 'error' })
  } finally {
    isEditingCategory.value = false
  }
}

const startEditBatch = (item: StockItem) => {
  editingBatchPk.value = item.pk
  editingBatchValue.value = item.batch || ''
}

const cancelEditBatch = () => {
  editingBatchPk.value = null
  editingBatchValue.value = ''
}

const saveBatch = async (item: StockItem) => {
  try {
    await inventree.updateStockItem(item.pk, { batch: editingBatchValue.value || null })
    item.batch = editingBatchValue.value || null
    toast.add({ title: 'Vendor updated', description: editingBatchValue.value || 'Cleared', color: 'success' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update'
    toast.add({ title: 'Update failed', description: message, color: 'error' })
  } finally {
    editingBatchPk.value = null
    editingBatchValue.value = ''
  }
}

// --- Print Label ---
const isVendorPickerOpen = ref(false)
const vendorPickerPart = ref<Part | null>(null)
const vendorPickerStockItems = ref<StockItem[]>([])

const printLabelForStockItem = async (part: Part, stockItem: StockItem) => {
  printingPartPk.value = part.pk
  isVendorPickerOpen.value = false

  try {
    let barcode: string

    // Check if we can find the barcode in notes (for reprinting)
    const storedBarcode = extractBarcodeFromNotes(stockItem.notes)

    if (storedBarcode) {
      // Reprint: use the stored barcode
      barcode = storedBarcode
    } else if (stockItem.barcode_hash) {
      // Has a barcode linked but not in notes (old format) — ask user to confirm replacement
      replacePart.value = part
      replaceStockItem.value = stockItem
      isReplaceConfirmOpen.value = true
      printingPartPk.value = null
      return
    } else {
      // No barcode at all — generate new deterministic one
      barcode = generateBarcode({
        ipn: part.IPN,
        revision: part.revision,
        batch: stockItem.batch || '',
        stockItemPk: stockItem.pk
      })

      // Link and store
      await inventree.linkBarcode(barcode, stockItem.pk)
      const updatedNotes = setBarcodeInNotes(stockItem.notes, barcode)
      await inventree.updateStockItem(stockItem.pk, { notes: updatedNotes })
      stockItem.notes = updatedNotes
      stockItem.barcode_hash = 'linked'
    }

    const result = await printLabel({
      barcode,
      partName: part.name,
      partNumber: part.IPN || 'N/A',
      quantity: stockItem.quantity > 1 ? stockItem.quantity : undefined,
      vendor: stockItem.batch || undefined
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to print label')
    }

    const vendorLabel = stockItem.batch ? ` (${stockItem.batch})` : ''
    toast.add({
      title: storedBarcode ? 'Label reprinted' : 'Label printed',
      description: `${part.name}${vendorLabel} — ${barcode}`,
      color: 'success'
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to print label'
    toast.add({ title: 'Print failed', description: message, color: 'error' })
  } finally {
    printingPartPk.value = null
  }
}

const confirmReplaceBarcode = async () => {
  if (!replacePart.value || !replaceStockItem.value) return
  isReplacingBarcode.value = true

  const part = replacePart.value
  const stockItem = replaceStockItem.value

  try {
    // Unlink old barcode
    await inventree.unlinkBarcode(stockItem.pk)

    // Generate new deterministic barcode
    const barcode = generateBarcode({
      ipn: part.IPN,
      revision: part.revision,
      batch: stockItem.batch || '',
      stockItemPk: stockItem.pk
    })

    // Link new barcode
    await inventree.linkBarcode(barcode, stockItem.pk)

    // Store in notes
    const updatedNotes = setBarcodeInNotes(stockItem.notes, barcode)
    await inventree.updateStockItem(stockItem.pk, { notes: updatedNotes })
    stockItem.notes = updatedNotes
    stockItem.barcode_hash = 'linked'

    // Print label
    const result = await printLabel({
      barcode,
      partName: part.name,
      partNumber: part.IPN || 'N/A',
      quantity: stockItem.quantity > 1 ? stockItem.quantity : undefined,
      vendor: stockItem.batch || undefined
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to print label')
    }

    const vendorLabel = stockItem.batch ? ` (${stockItem.batch})` : ''
    toast.add({
      title: 'Barcode replaced & label printed',
      description: `${part.name}${vendorLabel} — ${barcode}`,
      color: 'success'
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to replace barcode'
    toast.add({ title: 'Replace failed', description: message, color: 'error' })
  } finally {
    isReplacingBarcode.value = false
    isReplaceConfirmOpen.value = false
    replacePart.value = null
    replaceStockItem.value = null
  }
}

const printLabelForPart = async (part: Part) => {
  printingPartPk.value = part.pk
  try {
    const stockItems = await inventree.getStockItems(part.pk)

    if (stockItems.length === 0) {
      // No stock items — can't print
      toast.add({ title: 'No stock items', description: 'This part has no stock items to print a label for.', color: 'error' })
      printingPartPk.value = null
    } else if (stockItems.length === 1) {
      // Single stock item — print directly
      await printLabelForStockItem(part, stockItems[0]!)
    } else {
      // Multiple stock items — ask user which one
      vendorPickerPart.value = part
      vendorPickerStockItems.value = stockItems
      isVendorPickerOpen.value = true
      printingPartPk.value = null
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to print label'
    toast.add({ title: 'Print failed', description: message, color: 'error' })
    printingPartPk.value = null
  }
}

const getRowActions = (part: Part): DropdownMenuItem[][] => {
  return [
    [
      {
        label: 'Print Label',
        icon: 'i-lucide-printer',
        disabled: printingPartPk.value === part.pk,
        onSelect: () => printLabelForPart(part)
      }
    ]
  ]
}

const getCategoryName = (categoryId: number | null): string => {
  if (categoryId == null) return '—'
  return categoryMap.value.get(categoryId) || '—'
}

onMounted(() => {
  loadPrinterSettings()
  listenForUsbEvents()
  reconnectLocalPrinter()

  try {
    const saved = localStorage.getItem('stock_view_page_size')
    if (saved) {
      const num = Number(saved)
      if (pageSizeOptions.includes(num)) {
        pageSize.value = num
      }
    }
  } catch { /* ignore */ }

  fetchParts()

  inventree.getCategories().then((cats: PartCategory[]) => {
    const map = new Map<number, string>()
    for (const c of cats) {
      map.set(c.pk, c.name)
    }
    categoryMap.value = map
  }).catch(() => { /* non-critical */ })
})
</script>

<template>
  <div class="container mx-auto p-6 max-w-6xl">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold mb-1">
        View Stock
      </h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Browse all parts and their current stock levels
      </p>
    </div>

    <!-- Search -->
    <div class="mb-4">
      <UInput
        v-model="searchQuery"
        placeholder="Search by name, IPN, or description..."
        icon="i-lucide-search"
        size="lg"
        :loading="isLoading"
        @input="onSearchInput"
      />
    </div>

    <!-- Results summary -->
    <div class="flex items-center justify-between mb-3">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        <span v-if="!isLoading">{{ totalCount }} part{{ totalCount !== 1 ? 's' : '' }} found</span>
        <span v-else>Loading...</span>
      </p>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-500 dark:text-gray-400">Per page:</span>
          <USelectMenu
            :model-value="pageSize"
            :items="pageSizeOptions"
            :search-input="false"
            size="xs"
            class="w-18"
            @update:model-value="changePageSize"
          />
        </div>
        <p
          v-if="totalPages > 1"
          class="text-sm text-gray-500 dark:text-gray-400"
        >
          Page {{ currentPage }} of {{ totalPages }}
        </p>
      </div>
    </div>

    <!-- Table -->
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-200 dark:border-gray-700">
              <th class="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Part
              </th>
              <th class="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                IPN
              </th>
              <th class="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Rev
              </th>
              <th class="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Category
              </th>
              <th class="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Description
              </th>
              <th class="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Stock
              </th>
              <th class="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading && parts.length === 0">
              <td
                colspan="7"
                class="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
              >
                <UIcon
                  name="i-lucide-loader-2"
                  class="w-5 h-5 animate-spin inline-block mr-2"
                />
                Loading parts...
              </td>
            </tr>
            <tr v-else-if="!isLoading && parts.length === 0">
              <td
                colspan="7"
                class="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
              >
                No parts found{{ debouncedSearch ? ` matching "${debouncedSearch}"` : '' }}
              </td>
            </tr>
            <tr
              v-for="part in parts"
              :key="part.pk"
              class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
              @click="openPartDetail(part)"
            >
              <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                {{ part.name }}
              </td>
              <td class="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">
                {{ part.IPN || '—' }}
              </td>
              <td class="px-4 py-3 text-gray-600 dark:text-gray-400">
                {{ part.revision || '—' }}
              </td>
              <td class="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                {{ getCategoryName(part.category) }}
              </td>
              <td class="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                {{ part.description || '—' }}
              </td>
              <td class="px-4 py-3 text-right">
                <UBadge
                  :color="part.in_stock > 0 ? 'success' : 'error'"
                  variant="subtle"
                  size="sm"
                >
                  {{ part.in_stock }}
                </UBadge>
              </td>
              <td
                class="px-2 py-3 text-center"
                @click.stop
              >
                <UDropdownMenu :items="getRowActions(part)">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    icon="i-lucide-ellipsis-vertical"
                    :loading="printingPartPk === part.pk"
                  />
                </UDropdownMenu>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- Pagination -->
    <div
      v-if="totalPages > 1"
      class="flex items-center justify-center gap-2 mt-4"
    >
      <UButton
        variant="outline"
        size="sm"
        icon="i-lucide-chevron-left"
        :disabled="currentPage <= 1"
        @click="goToPage(currentPage - 1)"
      />
      <template
        v-for="page in totalPages"
        :key="page"
      >
        <UButton
          v-if="page === 1 || page === totalPages || (page >= currentPage - 2 && page <= currentPage + 2)"
          :variant="page === currentPage ? 'solid' : 'outline'"
          size="sm"
          @click="goToPage(page)"
        >
          {{ page }}
        </UButton>
        <span
          v-else-if="page === currentPage - 3 || page === currentPage + 3"
          class="text-gray-400 px-1"
        >...</span>
      </template>
      <UButton
        variant="outline"
        size="sm"
        icon="i-lucide-chevron-right"
        :disabled="currentPage >= totalPages"
        @click="goToPage(currentPage + 1)"
      />
    </div>

    <!-- Part Detail Modal -->
    <UModal v-model:open="isDetailOpen">
      <template #content>
        <div class="p-6 max-w-2xl w-full">
          <div
            v-if="detailPart"
            class="space-y-4"
          >
            <!-- Part info header -->
            <div class="flex items-start justify-between">
              <div>
                <h2 class="text-lg font-bold">
                  {{ detailPart.name }}
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ detailPart.description || 'No description' }}
                </p>
              </div>
              <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-x"
                size="sm"
                @click="isDetailOpen = false"
              />
            </div>

            <!-- Part metadata -->
            <div class="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  IPN
                </p>
                <p class="font-mono font-medium">
                  {{ detailPart.IPN || '—' }}
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Revision
                </p>
                <p class="font-medium">
                  {{ detailPart.revision || '—' }}
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Total Stock
                </p>
                <p
                  class="font-bold"
                  :class="detailPart.in_stock > 0 ? 'text-green-600' : 'text-red-600'"
                >
                  {{ detailPart.in_stock }}
                </p>
              </div>
            </div>

            <!-- Category (full width for editing) -->
            <div class="text-sm">
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Category
              </p>
              <div
                v-if="isEditingCategory"
                class="flex items-center gap-2"
              >
                <USelectMenu
                  v-model="editingCategoryValue"
                  :items="categoryItems"
                  value-key="value"
                  placeholder="Select a category..."
                  :search-input="true"
                  size="sm"
                  class="flex-1"
                />
                <UButton
                  size="xs"
                  icon="i-lucide-check"
                  color="success"
                  variant="ghost"
                  @click="saveCategory"
                />
                <UButton
                  size="xs"
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  @click="cancelEditCategory"
                />
              </div>
              <button
                v-else
                class="flex items-center gap-1 font-medium hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                @click="startEditCategory"
              >
                <span>{{ getCategoryName(detailPart.category) }}</span>
                <UIcon
                  name="i-lucide-pencil"
                  class="w-3 h-3 opacity-50"
                />
              </button>
            </div>

            <USeparator />

            <!-- Stock items table -->
            <div>
              <h3 class="text-sm font-semibold mb-2">
                Stock Items
              </h3>

              <div
                v-if="isLoadingDetail"
                class="text-center py-4 text-gray-500"
              >
                <UIcon
                  name="i-lucide-loader-2"
                  class="w-4 h-4 animate-spin inline-block mr-1"
                />
                Loading stock items...
              </div>

              <div
                v-else-if="detailStockItems.length === 0"
                class="text-center py-4 text-gray-500 text-sm"
              >
                No stock items for this part.
              </div>

              <div
                v-else
                class="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700"
              >
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">
                        Vendor (Batch)
                      </th>
                      <th class="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-400">
                        Quantity
                      </th>
                      <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">
                        Serial
                      </th>
                      <th class="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in detailStockItems"
                      :key="item.pk"
                      class="border-b border-gray-100 dark:border-gray-800 last:border-0"
                    >
                      <td class="px-3 py-2">
                        <!-- Editing mode -->
                        <div
                          v-if="editingBatchPk === item.pk"
                          class="flex items-center gap-2"
                        >
                          <USelectMenu
                            v-model="editingBatchValue"
                            :items="vendorItems"
                            value-key="value"
                            placeholder="Select vendor..."
                            :search-input="true"
                            :create-item="true"
                            size="xs"
                            class="w-32"
                          />
                          <UButton
                            size="xs"
                            icon="i-lucide-check"
                            color="success"
                            variant="ghost"
                            @click="saveBatch(item)"
                          />
                          <UButton
                            size="xs"
                            icon="i-lucide-x"
                            color="neutral"
                            variant="ghost"
                            @click="cancelEditBatch"
                          />
                        </div>
                        <!-- Display mode -->
                        <button
                          v-else
                          class="flex items-center gap-1 text-left hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                          @click="startEditBatch(item)"
                        >
                          <span
                            v-if="item.batch"
                            class="font-medium"
                          >{{ item.batch }}</span>
                          <span
                            v-else
                            class="text-gray-400 italic"
                          >No vendor — click to set</span>
                          <UIcon
                            name="i-lucide-pencil"
                            class="w-3 h-3 opacity-50"
                          />
                        </button>
                      </td>
                      <td class="px-3 py-2 text-right font-medium">
                        {{ item.quantity }}
                      </td>
                      <td class="px-3 py-2 text-gray-500 text-xs">
                        {{ item.serial || '—' }}
                      </td>
                      <td class="px-2 py-2">
                        <UButton
                          variant="ghost"
                          color="neutral"
                          size="xs"
                          icon="i-lucide-pencil"
                          @click="startEditBatch(item)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Vendor Picker Modal (for printing when multiple stock items exist) -->
    <UModal v-model:open="isVendorPickerOpen">
      <template #content>
        <div class="p-6 max-w-md w-full">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-semibold">
              Select Stock Item to Print
            </h3>
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              size="sm"
              @click="isVendorPickerOpen = false"
            />
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
            This part has multiple stock items. Choose which one to print a label for:
          </p>
          <div class="space-y-2">
            <button
              v-for="item in vendorPickerStockItems"
              :key="item.pk"
              class="w-full flex items-center justify-between p-3 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              @click="printLabelForStockItem(vendorPickerPart!, item)"
            >
              <div>
                <p class="text-sm font-medium">
                  {{ item.batch || 'No vendor' }}
                </p>
                <p class="text-xs text-gray-500">
                  Qty: {{ item.quantity }}
                </p>
              </div>
              <UIcon
                name="i-lucide-printer"
                class="w-4 h-4 text-gray-400"
              />
            </button>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Replace Barcode Confirmation Modal -->
    <UModal v-model:open="isReplaceConfirmOpen">
      <template #content>
        <div class="p-6 max-w-sm">
          <h3 class="text-lg font-bold mb-2">
            Replace Barcode
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            This stock item has a legacy barcode that was not stored in the system.
            Replacing it will <strong>permanently invalidate</strong> the old barcode — any existing labels with the old code will no longer scan.
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            A new barcode will be generated, linked, and printed.
          </p>
          <div class="flex gap-2 justify-end">
            <UButton
              variant="outline"
              color="neutral"
              size="sm"
              @click="isReplaceConfirmOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="warning"
              size="sm"
              :loading="isReplacingBarcode"
              icon="i-lucide-refresh-cw"
              @click="confirmReplaceBarcode"
            >
              Replace & Print
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
