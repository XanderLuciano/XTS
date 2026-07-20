<script setup lang="ts">
import type { CreatePartDto, AddStockDto, StockItem, PartCategory, StockLocation } from '~/types/inventree'
import type { ScanResult, ScanRecord } from '~/types/scanner'
import type { ComponentPublicInstance } from 'vue'
import { resolveImageUrl as _resolveImageUrl } from '~/utils/resolveImageUrl'
import { isApiError, extractApiError } from '~/utils/apiError'

/** Minimal shape of a Nuxt UI UInput template ref — only the members we use. */
interface UInputRef extends ComponentPublicInstance {
  inputRef?: HTMLInputElement | null
}

const toast = useToast()
const config = useRuntimeConfig()
const { lookupBarcode, reLookupBarcode } = useScanLookup()

/**
 * Resolves a relative InvenTree image URL to an absolute URL.
 * Delegates to the shared utility, passing the configured API base URL.
 */
const resolveImageUrl = (url: string | undefined | null): string => {
  return _resolveImageUrl(url, config.public.inventreeApiUrl as string)
}

// --- Camera scanner state ---
const isScannerModalOpen = ref(false)
const scannerRef = ref<{ startCamera: () => Promise<void>, stopCamera: () => void } | null>(null)

const openScannerModal = () => {
  isScannerModalOpen.value = true
}

const closeScannerModal = () => {
  scannerRef.value?.stopCamera()
  isScannerModalOpen.value = false
}

const handleBarcodeDetected = (result: ScanResult) => {
  const record: ScanRecord = {
    barcode: result.value,
    type: result.type,
    timestamp: new Date(),
    lookupStatus: 'loading'
  }
  scanHistory.value.unshift(record)
  lookupBarcode(record, scanHistory)
  toast.add({
    title: `Scanned: ${result.value}`,
    description: result.type,
    color: 'success'
  })
}

const handleScannerError = (message: string) => {
  toast.add({
    title: 'Scanner error',
    description: message,
    color: 'error'
  })
}

// Close scanner modal on Escape key
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isScannerModalOpen.value) {
    closeScannerModal()
  }
  if (e.key === '/' && !isModalOpen.value && !isScannerModalOpen.value) {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    e.preventDefault()
    barcodeInputRef.value?.inputRef?.focus()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

onBeforeRouteLeave(() => {
  if (isScannerModalOpen.value) {
    closeScannerModal()
  }
})

interface ScrapedData {
  articleNumber: string
  name: string
  imageUrl: string
  description: string
  ipn: string
  link: string
}

interface PartForm {
  name: string
  IPN: string
  description: string
  link: string
  image: string
}

const barcodeInput = ref('')
const barcodeInputRef = ref<UInputRef | null>(null)
const scanHistory = ref<ScanRecord[]>([])
const selectedManufacturer = ref<'hoffmann' | 'sandvik'>('hoffmann')
const isModalOpen = ref(false)
const scrapedData = ref<ScrapedData | null>(null)
const partForm = ref<PartForm>({
  name: '',
  IPN: '',
  description: '',
  link: '',
  image: ''
})
const isCreating = ref(false)
const createStock = ref(true)
const stockQuantity = ref(1)
const linkBarcode = ref(true)
const currentBarcode = ref<string | null>(null)
const stockQuantityInput = ref<ComponentPublicInstance | null>(null)
const categories = ref<PartCategory[]>([])
const locations = ref<StockLocation[]>([])
const selectedCategory = ref<PartCategory | undefined>(undefined)
const selectedLocation = ref<StockLocation | undefined>(undefined)

// Selectable categories: hide structural containers (parts can't be assigned to
// them) and show the full path (e.g. "A/B") so nested categories are unambiguous.
const categoryItems = computed(() =>
  categories.value
    .filter(c => !c.structural)
    .map(c => ({ ...c, label: c.pathstring || c.name }))
)

watch(createStock, async (checked) => {
  if (checked) {
    await nextTick()
    const el = stockQuantityInput.value?.$el as HTMLElement | undefined
    const input = el?.querySelector('input') as HTMLInputElement | null
    if (input) {
      input.focus()
      input.select()
    }
  }
})

const handleScan = () => {
  if (!barcodeInput.value.trim()) return

  const record: ScanRecord = {
    barcode: barcodeInput.value.trim(),
    timestamp: new Date(),
    lookupStatus: 'loading'
  }
  scanHistory.value.unshift(record)
  lookupBarcode(record, scanHistory)

  barcodeInput.value = ''
}

const clearHistory = () => {
  scanHistory.value = []
  localStorage.removeItem('scanHistory')
}

/**
 * Template wrapper for re-looking up a scan. Templates auto-unwrap refs, so we
 * pass the actual `scanHistory` ref from here rather than from the template.
 */
const recheckScan = (scan: ScanRecord) => {
  reLookupBarcode(scan, scanHistory)
}

const removeHistoryItem = (index: number) => {
  scanHistory.value.splice(index, 1)
}

const formatTime = (date: Date) => {
  return date.toLocaleTimeString()
}

// Load scan history from localStorage on mount
onMounted(async () => {
  const input = document.querySelector('input[type="text"]') as HTMLInputElement
  input?.focus()

  const saved = localStorage.getItem('scanHistory')
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Array<Partial<ScanRecord> & { timestamp: string }>
      scanHistory.value = parsed.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp),
        // Backward compatibility: default to 'not_found' if lookupStatus is missing (old format)
        lookupStatus: item.lookupStatus || 'not_found'
      })) as ScanRecord[]

      // Re-trigger lookup for records that were in 'loading' state when the page was refreshed
      for (const record of scanHistory.value) {
        if (record.lookupStatus === 'loading') {
          lookupBarcode(record, scanHistory)
        }
      }
    } catch (e) {
      console.error('Failed to load scan history:', e)
    }
  }

  // Fetch categories and locations
  const inventree = useInventreeApi()
  try {
    categories.value = await inventree.getCategories()
  } catch (e) {
    console.error('Failed to load categories:', e)
  }
  try {
    locations.value = await inventree.getLocations()
  } catch (e) {
    console.error('Failed to load locations:', e)
  }

  // Restore last selections from localStorage
  const savedCategoryPk = localStorage.getItem('inventree_last_category')
  if (savedCategoryPk) {
    const pk = Number(savedCategoryPk)
    const match = categoryItems.value.find(c => c.pk === pk)
    if (match) selectedCategory.value = match
  }

  const savedLocationPk = localStorage.getItem('inventree_last_location')
  if (savedLocationPk) {
    const pk = Number(savedLocationPk)
    const match = locations.value.find(l => l.pk === pk)
    if (match) selectedLocation.value = match
  }
})

// Save to localStorage whenever history changes
watch(scanHistory, (newHistory) => {
  localStorage.setItem('scanHistory', JSON.stringify(newHistory))
}, { deep: true })

watch(selectedCategory, (cat) => {
  if (cat) {
    localStorage.setItem('inventree_last_category', String(cat.pk))
  } else {
    localStorage.removeItem('inventree_last_category')
  }
})

watch(selectedLocation, (loc) => {
  if (loc) {
    localStorage.setItem('inventree_last_location', String(loc.pk))
  } else {
    localStorage.removeItem('inventree_last_location')
  }
})

const lookupProduct = async (barcode: string, index: number) => {
  const scan = scanHistory.value[index]
  if (!scan) return

  scan.lookupStatus = 'loading'

  const apiEndpoint = selectedManufacturer.value === 'hoffmann'
    ? '/api/scrape-hoffmann'
    : '/api/scrape-sandvik'

  try {
    const response = await $fetch<{ success: boolean, data: ScrapedData }>(`${apiEndpoint}?barcode=${encodeURIComponent(barcode)}`)

    if (response.success && response.data) {
      scrapedData.value = response.data
      partForm.value = {
        name: response.data.name,
        IPN: response.data.ipn,
        description: response.data.description,
        link: response.data.link,
        image: response.data.imageUrl
      }
      createStock.value = true
      stockQuantity.value = 1
      currentBarcode.value = barcode
      linkBarcode.value = true

      // Restore selectors to localStorage defaults
      const savedCategoryPk = localStorage.getItem('inventree_last_category')
      if (savedCategoryPk) {
        const pk = Number(savedCategoryPk)
        selectedCategory.value = categoryItems.value.find(c => c.pk === pk) || undefined
      } else {
        selectedCategory.value = undefined
      }

      const savedLocationPk = localStorage.getItem('inventree_last_location')
      if (savedLocationPk) {
        const pk = Number(savedLocationPk)
        selectedLocation.value = locations.value.find(l => l.pk === pk) || undefined
      } else {
        selectedLocation.value = undefined
      }

      isModalOpen.value = true
      toast.add({ title: 'Product found', color: 'success' })
    }
  } catch (error) {
    // $fetch wraps server errors in a FetchError whose `.data` holds the
    // Nitro error body ({ message, data }). Pull out the detailed stage info
    // the scraper now returns so production failures are diagnosable.
    const fetchError = error as { data?: { message?: string, data?: Record<string, unknown> }, message?: string }
    const serverDetail = fetchError?.data?.data
    const description = fetchError?.data?.message
      || (error instanceof Error ? error.message : 'Could not fetch product data')

    // Log the full structured detail to the browser console for debugging.
    console.error('Scrape lookup failed:', { description, detail: serverDetail })

    toast.add({
      title: 'Lookup failed',
      description,
      color: 'error'
    })
  } finally {
    scan.lookupStatus = 'not_found'
  }
}

const createPart = async () => {
  const inventree = useInventreeApi()
  isCreating.value = true

  try {
    // Check if part already exists
    const check = await inventree.checkPartExists(partForm.value.IPN, partForm.value.name)

    if (check.exists) {
      toast.add({
        title: 'Part already exists',
        description: `A part with ${check.field} "${check.field === 'IPN' ? partForm.value.IPN : partForm.value.name}" already exists`,
        color: 'warning'
      })
      isCreating.value = false
      return
    }

    // Create the part
    const partData: CreatePartDto = {
      name: partForm.value.name,
      IPN: partForm.value.IPN,
      description: partForm.value.description,
      link: partForm.value.link,
      remote_image: partForm.value.image || '',
      category: selectedCategory.value?.pk ?? null
    }

    const response = await inventree.createPart(partData)

    toast.add({ title: 'Part created successfully', color: 'success' })

    // Create initial stock if checkbox is checked
    if (createStock.value) {
      let stockItem: StockItem | undefined
      try {
        const stockData: AddStockDto = {
          part: response.pk,
          quantity: stockQuantity.value,
          location: selectedLocation.value?.pk ?? null,
          notes: 'Initial stock created with part'
        }
        stockItem = await inventree.addStock(stockData)
        toast.add({
          title: 'Initial stock added',
          description: `${stockQuantity.value} units`,
          color: 'success'
        })
      } catch (stockError) {
        const message = stockError instanceof Error ? stockError.message : 'Failed to add stock'
        toast.add({
          title: 'Failed to add initial stock',
          description: message,
          color: 'error'
        })
      }

      // Link barcode to stock item
      if (stockItem && linkBarcode.value && currentBarcode.value) {
        try {
          await inventree.linkBarcode(currentBarcode.value, stockItem.pk)
          toast.add({
            title: 'Barcode linked to stock item',
            description: `Barcode: ${currentBarcode.value}`,
            color: 'success'
          })
        } catch (linkError) {
          const message = linkError instanceof Error ? linkError.message : 'Failed to link barcode'
          toast.add({
            title: 'Failed to link barcode',
            description: message,
            color: 'error'
          })
        }
      }
    }

    isModalOpen.value = false

    // Auto re-lookup barcode after successful part creation with barcode linking
    if (linkBarcode.value && currentBarcode.value) {
      const record = scanHistory.value.find(r => r.barcode === currentBarcode.value)
      if (record) {
        reLookupBarcode(record, scanHistory)
      }
    }
  } catch (error: unknown) {
    let errorMessage = 'Unknown error'
    const errorData = isApiError(error)
      ? (error.data as Record<string, unknown> | undefined)
      : undefined

    if (errorData) {
      const nonFieldErrors = errorData.non_field_errors as string[] | undefined
      const detail = errorData.detail as string | undefined
      const ipnErrors = errorData.IPN as string[] | undefined
      const nameErrors = errorData.name as string[] | undefined

      if (nonFieldErrors?.length) {
        errorMessage = nonFieldErrors[0]!
      } else if (detail) {
        errorMessage = detail
      } else if (ipnErrors?.length) {
        errorMessage = `IPN: ${ipnErrors[0]}`
      } else if (nameErrors?.length) {
        errorMessage = `Name: ${nameErrors[0]}`
      } else {
        errorMessage = extractApiError(error, errorMessage)
      }
    } else {
      errorMessage = extractApiError(error, errorMessage)
    }

    toast.add({
      title: 'Failed to create part',
      description: errorMessage,
      color: 'error'
    })
  } finally {
    isCreating.value = false
  }
}

// Auto-focus input on mount
onMounted(() => {
  const input = document.querySelector('input[type="text"]') as HTMLInputElement
  input?.focus()
})
</script>

<template>
  <div class="container mx-auto p-6 max-w-3xl">
    <div class="mb-8">
      <h1 class="text-2xl font-bold mb-2">
        Barcode Scanner
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        Scan barcodes to capture and track them
      </p>
    </div>

    <!-- Scanner Modal -->
    <UModal
      v-model:open="isScannerModalOpen"
      title="Camera Scanner"
    >
      <template #body>
        <BarcodeScanner
          ref="scannerRef"
          :auto-start="true"
          @barcode-detected="handleBarcodeDetected"
          @error="handleScannerError"
        />
      </template>
      <template #footer>
        <div class="flex justify-end">
          <UButton
            variant="ghost"
            @click="closeScannerModal"
          >
            Close
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Scanner Input -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold">
          Scan Barcode
        </h2>
      </template>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Manufacturer</label>
          <div class="flex gap-2">
            <UButton
              :variant="selectedManufacturer === 'hoffmann' ? 'solid' : 'outline'"
              size="sm"
              @click="selectedManufacturer = 'hoffmann'"
            >
              Hoffmann Group
            </UButton>
            <UButton
              :variant="selectedManufacturer === 'sandvik' ? 'solid' : 'outline'"
              size="sm"
              @click="selectedManufacturer = 'sandvik'"
            >
              Sandvik Coromant
            </UButton>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Barcode</label>
          <p class="text-xs text-gray-500 mb-2">
            Focus here and scan with your barcode scanner
          </p>
          <div class="flex gap-2 items-center">
            <UTooltip text="Scan with camera">
              <UButton
                icon="i-lucide-camera"
                size="lg"
                variant="outline"
                aria-label="Scan with camera"
                @click="openScannerModal"
              />
            </UTooltip>
            <UInput
              ref="barcodeInputRef"
              v-model="barcodeInput"
              placeholder="Scan or type barcode..."
              size="lg"
              autofocus
              class="flex-1"
              @keyup.enter="handleScan"
            >
              <template #trailing>
                <UKbd
                  value="/"
                  size="sm"
                />
              </template>
            </UInput>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Scan History -->
    <UCard class="mb-6">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">
            Scan History ({{ scanHistory.length }})
          </h2>
          <UTooltip text="Clear all scan history">
            <UButton
              v-if="scanHistory.length > 0"
              variant="ghost"
              size="xs"
              icon="i-lucide-trash-2"
              @click="clearHistory"
            >
              Clear
            </UButton>
          </UTooltip>
        </div>
      </template>

      <div
        v-if="scanHistory.length === 0"
        class="text-center py-8 text-gray-500"
      >
        No scans yet. Scan a barcode to get started.
      </div>

      <div
        v-else
        class="space-y-2"
      >
        <div
          v-for="(scan, index) in scanHistory"
          :key="index"
          class="p-3 rounded-lg border"
          :class="{
            'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700': scan.lookupStatus === 'loading',
            'bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-700': scan.lookupStatus === 'found',
            'bg-amber-50 dark:bg-amber-900/20 border-amber-500 dark:border-amber-700': scan.lookupStatus === 'not_found',
            'bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-700': scan.lookupStatus === 'error'
          }"
        >
          <!-- Loading State -->
          <div
            v-if="scan.lookupStatus === 'loading'"
            class="flex items-center justify-between"
          >
            <div class="flex items-center gap-3 flex-1">
              <UIcon
                name="i-lucide-loader-2"
                class="w-5 h-5 animate-spin text-gray-400"
              />
              <div>
                <p class="font-mono font-semibold">
                  {{ scan.barcode }}
                </p>
                <p class="text-xs text-gray-500">
                  {{ formatTime(scan.timestamp) }}
                </p>
              </div>
            </div>
            <UTooltip text="Remove from history">
              <UButton
                size="xs"
                color="error"
                variant="ghost"
                icon="i-lucide-x"
                aria-label="Remove scan from history"
                @click="removeHistoryItem(index)"
              />
            </UTooltip>
          </div>

          <!-- Found State -->
          <div
            v-else-if="scan.lookupStatus === 'found'"
            class="flex items-center justify-between gap-3"
          >
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <img
                v-if="scan.part?.thumbnail || scan.part?.image"
                :src="resolveImageUrl(scan.part?.thumbnail || scan.part?.image)"
                :alt="scan.part?.name"
                class="w-12 h-12 object-cover rounded flex-shrink-0"
              >
              <UIcon
                v-else
                name="i-lucide-package"
                class="w-12 h-12 text-gray-400 flex-shrink-0"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="font-semibold truncate">
                    {{ scan.part?.name }}
                  </p>
                  <UBadge
                    color="success"
                    size="xs"
                  >
                    Found
                  </UBadge>
                </div>
                <p
                  v-if="scan.part?.IPN"
                  class="text-xs text-gray-500"
                >
                  IPN: {{ scan.part.IPN }}
                </p>
                <p
                  v-if="scan.part?.description"
                  class="text-xs text-gray-500 truncate"
                >
                  {{ scan.part.description }}
                </p>
                <p class="text-xs text-gray-500">
                  Stock: {{ scan.part?.in_stock ?? 'N/A' }} | Barcode: {{ scan.barcode }}
                </p>
                <a
                  v-if="scan.part?.link"
                  :href="scan.part.link"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs text-primary hover:underline"
                >
                  View part ↗
                </a>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <p class="text-xs text-gray-500 hidden sm:block">
                {{ formatTime(scan.timestamp) }}
              </p>
              <UTooltip text="Remove from history">
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-x"
                  aria-label="Remove scan from history"
                  @click="removeHistoryItem(index)"
                />
              </UTooltip>
            </div>
          </div>

          <!-- Not Found State -->
          <div v-else-if="scan.lookupStatus === 'not_found'">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <p class="font-mono font-semibold">
                    {{ scan.barcode }}
                  </p>
                  <UBadge
                    color="warning"
                    size="xs"
                  >
                    Not Found
                  </UBadge>
                </div>
                <p class="text-xs text-gray-500">
                  {{ formatTime(scan.timestamp) }}
                </p>
              </div>
              <UTooltip text="Remove from history">
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-x"
                  aria-label="Remove scan from history"
                  @click="removeHistoryItem(index)"
                />
              </UTooltip>
            </div>
            <div class="flex items-center gap-2 mt-2">
              <UTooltip text="Search manufacturer catalog for this barcode">
                <UButton
                  size="xs"
                  color="primary"
                  icon="i-lucide-search"
                  @click="lookupProduct(scan.barcode, index)"
                >
                  Manufacturer Lookup
                </UButton>
              </UTooltip>
              <UTooltip text="Manually create a new part in InvenTree">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-plus"
                  @click="() => { currentBarcode = scan.barcode; isModalOpen = true }"
                >
                  Create Part
                </UButton>
              </UTooltip>
              <UTooltip text="Re-check this barcode against InvenTree">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-refresh-cw"
                  @click="recheckScan(scan)"
                >
                  Re-check
                </UButton>
              </UTooltip>
            </div>
          </div>

          <!-- Error State -->
          <div v-else-if="scan.lookupStatus === 'error'">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <p class="font-mono font-semibold">
                    {{ scan.barcode }}
                  </p>
                  <UBadge
                    color="error"
                    size="xs"
                  >
                    Error
                  </UBadge>
                </div>
                <p class="text-xs text-red-600 dark:text-red-400">
                  {{ scan.errorMessage }}
                </p>
                <p class="text-xs text-gray-500">
                  {{ formatTime(scan.timestamp) }}
                </p>
              </div>
              <UTooltip text="Remove from history">
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-x"
                  aria-label="Remove scan from history"
                  @click="removeHistoryItem(index)"
                />
              </UTooltip>
            </div>
            <div class="flex items-center gap-2 mt-2">
              <UTooltip text="Retry barcode lookup against InvenTree">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-refresh-cw"
                  @click="recheckScan(scan)"
                >
                  Retry
                </UButton>
              </UTooltip>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Create Part Modal -->
    <UModal
      v-model:open="isModalOpen"
      title="Create Part from Scraped Data"
      :ui="{ content: 'sm:max-w-4xl' }"
    >
      <template #body>
        <div class="flex gap-6">
          <!-- Image Preview and Category - Left Side -->
          <div class="flex-shrink-0 w-64 space-y-4">
            <div v-if="partForm.image">
              <p class="text-sm font-medium mb-2">
                Image Preview:
              </p>
              <img
                :src="partForm.image"
                alt="Product preview"
                class="w-full rounded border"
              >
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Part Category</label>
              <USelectMenu
                v-model="selectedCategory"
                :items="categoryItems"
                placeholder="Select category..."
                searchable
                option-attribute="label"
                value-attribute="pk"
                class="w-full"
              />
            </div>

            <div v-if="createStock">
              <label class="block text-sm font-medium mb-1">Stock Location</label>
              <USelectMenu
                v-model="selectedLocation"
                :items="locations"
                placeholder="Select location..."
                searchable
                option-attribute="name"
                value-attribute="pk"
                :clear="true"
                class="w-full"
              />
            </div>
          </div>

          <!-- Form Fields - Right Side -->
          <div class="flex-1 space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Name *</label>
              <UInput
                v-model="partForm.name"
                size="lg"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">IPN (Internal Part Number) *</label>
              <UInput
                v-model="partForm.IPN"
                size="lg"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Description</label>
              <UTextarea
                v-model="partForm.description"
                :rows="6"
                size="lg"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Link</label>
              <p class="text-xs text-gray-500 mb-1">
                Auto-generated from article number
              </p>
              <UInput
                v-model="partForm.link"
                readonly
                size="lg"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Image URL</label>
              <UInput
                v-model="partForm.image"
                size="lg"
                class="w-full"
              />
            </div>

            <USeparator
              label="Initial Stock"
              class="mt-4"
            />

            <div class="space-y-3 mt-3">
              <div class="flex items-center gap-2">
                <UCheckbox v-model="createStock" />
                <div>
                  <label class="text-sm font-medium">Create Initial Stock</label>
                  <p class="text-xs text-gray-500">
                    Add stock when creating this part
                  </p>
                </div>
              </div>

              <UFormField
                v-if="createStock"
                label="Stock Quantity"
                description="Number of units to add"
              >
                <UInput
                  ref="stockQuantityInput"
                  v-model.number="stockQuantity"
                  type="number"
                  min="1"
                />
              </UFormField>

              <div
                v-if="createStock"
                class="flex items-center gap-2 mt-3"
              >
                <UCheckbox v-model="linkBarcode" />
                <div>
                  <label class="text-sm font-medium">Link Barcode to Stock Item</label>
                  <p class="text-xs text-gray-500">
                    Link barcode {{ currentBarcode }} to the new stock item
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            @click="isModalOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            :loading="isCreating"
            color="primary"
            @click="createPart"
          >
            Create Part
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
