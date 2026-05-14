<script setup lang="ts">
import type { CreatePartDto, AddStockDto, PartCategory } from '~/types/inventree'

// Pre-defined vendor options
const VENDOR_OPTIONS = ['YihShan', 'UMT', 'NRG', 'Prime', 'CIM', 'CIMTAS', 'KMS']

interface PartForm {
  name: string
  description: string
  IPN: string
  revision: string
  vendor: string
  createStock: boolean
  stockQuantity: number
  printLabels: boolean
  labelMode: 'one' | 'per-item'
}

const inventree = useInventreeApi()
const toast = useToast()

const isLoading = ref(false)

const stockQuantityInput = ref<InstanceType<typeof UInput> | null>(null)

// Load persisted settings from localStorage (SSR-safe)
const partForm = reactive<PartForm>({
  name: '',
  description: '',
  IPN: '',
  revision: '',
  vendor: '',
  createStock: true,
  stockQuantity: 1,
  printLabels: false,
  labelMode: 'one'
})

const vendorItems = computed(() =>
  VENDOR_OPTIONS.map(v => ({ label: v, value: v }))
)

// Hydrate persisted settings on mount to avoid SSR mismatch
onMounted(() => {
  try {
    const storedPrintLabels = localStorage.getItem('create_part_print_labels')
    if (storedPrintLabels === 'true') {
      partForm.printLabels = true
    }

    const storedLabelMode = localStorage.getItem('create_part_label_mode')
    if (storedLabelMode === 'one' || storedLabelMode === 'per-item') {
      partForm.labelMode = storedLabelMode
    }

    const savedCategory = localStorage.getItem('create_part_category')
    if (savedCategory) {
      selectedCategory.value = Number(savedCategory)
    }
  } catch {
    // Corrupt or unavailable storage — keep defaults
  }
})

// Category state
const showAdvancedOptions = ref(false)
const categories = ref<PartCategory[]>([])
const isLoadingCategories = ref(false)
const selectedCategory = ref<number | null>(null)

const categoryItems = computed(() =>
  categories.value.map(c => ({ label: c.name, value: c.pk }))
)

const toggleAdvancedOptions = async () => {
  showAdvancedOptions.value = !showAdvancedOptions.value
  if (showAdvancedOptions.value && categories.value.length === 0) {
    isLoadingCategories.value = true
    try {
      categories.value = await inventree.getCategories()
      // Validate persisted category
      if (selectedCategory.value != null) {
        const stillValid = categories.value.some(c => c.pk === selectedCategory.value)
        if (!stillValid) {
          selectedCategory.value = null
        }
      }
    } catch {
      // silently fail
    } finally {
      isLoadingCategories.value = false
    }
  }
}

watch(selectedCategory, (val) => {
  if (import.meta.server) return
  try {
    if (val != null) {
      localStorage.setItem('create_part_category', String(val))
    } else {
      localStorage.removeItem('create_part_category')
    }
  } catch { /* ignore */ }
})

// Persist printLabels and labelMode to localStorage when they change
watch(() => partForm.printLabels, (val) => {
  if (import.meta.server) return
  try {
    localStorage.setItem('create_part_print_labels', String(val))
  } catch {
    // Quota exceeded or private browsing — silently ignore
  }
})

watch(() => partForm.labelMode, (val) => {
  if (import.meta.server) return
  try {
    localStorage.setItem('create_part_label_mode', val)
  } catch {
    // Quota exceeded or private browsing — silently ignore
  }
})

watch(() => partForm.createStock, async (checked) => {
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

const createPart = async () => {
  isLoading.value = true

  try {
    // Compose display name: "165580-001 · Rev A · 10K Ohm Resistor"
    const composedName = [
      partForm.IPN,
      partForm.revision ? `Rev ${partForm.revision}` : null,
      partForm.name
    ].filter(Boolean).join(' · ')

    let partPk: number | undefined
    let isExistingPart = false

    // Check if a part with same IPN + revision already exists
    if (partForm.IPN) {
      const existingPart = await inventree.findPartByIPNAndRevision(partForm.IPN, partForm.revision || '')
      if (existingPart) {
        partPk = existingPart.pk
        isExistingPart = true
        toast.add({
          title: 'Existing part found',
          description: `${existingPart.name} — adding stock to existing part`,
          color: 'info'
        })
      }
    }

    // Create new part if it doesn't exist
    if (!isExistingPart) {
      const partData: CreatePartDto = {
        name: composedName,
        IPN: partForm.IPN,
        revision: partForm.revision || undefined,
        description: partForm.description || undefined,
        category: selectedCategory.value,
        active: true,
        component: true,
        purchaseable: true
      }

      const response = await inventree.createPart(partData)
      partPk = response.pk
      toast.add({ title: 'Part created', description: composedName, color: 'success' })
    }

    let stockItem: { pk: number } | undefined

    // Add stock with vendor tracking
    if (partForm.createStock && partPk) {
      try {
        if (partForm.vendor) {
          // Vendor-aware: find or create stock item by batch
          stockItem = await inventree.addStockWithVendor(
            partPk,
            partForm.stockQuantity,
            partForm.vendor,
            `Stock ${isExistingPart ? 'added' : 'created'} via webapp`
          )
          toast.add({
            title: 'Stock added',
            description: `${partForm.stockQuantity} units (vendor: ${partForm.vendor})`,
            color: 'success'
          })
        } else {
          // No vendor: use standard addStock
          const stockData: AddStockDto = {
            part: partPk,
            quantity: partForm.stockQuantity,
            notes: 'Initial stock created with part'
          }
          stockItem = await inventree.addStock(stockData)
          toast.add({ title: 'Stock added', description: `${partForm.stockQuantity} units`, color: 'success' })
        }
      } catch (stockError) {
        const message = stockError instanceof Error ? stockError.message : 'Failed to add stock'
        toast.add({ title: 'Failed to add stock', description: message, color: 'error' })
      }
    }

    // Print labels and link barcode if label printing is enabled
    if (partForm.printLabels && stockItem) {
      try {
        // Generate one barcode for all labels (per-item prints identical copies)
        const partId = (partForm.IPN || partForm.name).replace(/\s+/g, '-').toUpperCase()
        const revision = partForm.revision || '0'
        const uid = Math.random().toString(36).slice(2, 8)
        const barcode = `${partId}-${revision}-${uid}`

        const labelCount = partForm.labelMode === 'per-item'
          ? partForm.stockQuantity
          : 1
        const quantity = partForm.labelMode === 'one' ? partForm.stockQuantity : undefined

        // Print N labels (identical copies for per-item, or one label with quantity)
        const printerUrl = localStorage.getItem('zebra_printer_url') || ''
        const printerApiKey = localStorage.getItem('zebra_api_key') || ''

        for (let i = 0; i < labelCount; i++) {
          await $fetch('/api/print-label', {
            method: 'POST',
            body: {
              barcode,
              partName: partForm.name,
              partNumber: partForm.IPN || 'N/A',
              quantity,
              printerUrl: printerUrl || undefined,
              apiKey: printerApiKey || undefined
            }
          })
        }

        // Link barcode to the stock item (once — all labels share the same barcode)
        await inventree.linkBarcode(barcode, stockItem.pk)

        // Single summary toast
        const copies = labelCount > 1 ? ` (${labelCount} identical copies)` : ''
        toast.add({
          title: labelCount === 1 ? 'Label printed' : `${labelCount} labels printed`,
          description: `Barcode: ${barcode}${copies}`,
          color: 'success'
        })
      } catch (labelError) {
        const message = labelError instanceof Error ? labelError.message : 'Failed to print label'
        toast.add({ title: 'Label printing failed', description: message, color: 'error' })
      }
    }

    // Reset form (keep vendor, printLabels, labelMode — they persist across sessions)
    partForm.name = ''
    partForm.description = ''
    partForm.IPN = ''
    partForm.revision = ''
    partForm.createStock = true
    partForm.stockQuantity = 1
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create part'
    toast.add({ title: 'Failed to create part', description: message, color: 'error' })
  } finally {
    isLoading.value = false
  }
}

</script>

<template>
  <div class="container mx-auto p-6 max-w-3xl">
    <div class="mb-8">
      <h1 class="text-2xl font-bold mb-2">Create Part</h1>
      <p class="text-gray-600 dark:text-gray-400">Add a new part to the InvenTree database</p>
    </div>

    <!-- Part Creation Form -->
    <UCard class="mb-6">
      <div class="space-y-6">
        <!-- Part Number (IPN) -->
        <UFormField label="Part Number" description="Engineering part number, e.g. 165801-001 (optional)">
          <UInput v-model="partForm.IPN" placeholder="e.g. 165801-001" class="w-full" />
        </UFormField>

        <!-- Part Revision -->
        <UFormField label="Part Revision" description="Just the letter or number — &quot;Rev&quot; is prepended automatically (optional)">
          <UInput v-model="partForm.revision" placeholder="e.g. A" class="w-full" />
        </UFormField>

        <!-- Part Name -->
        <UFormField label="Part Name" required description="The display name of the part">
          <UInput v-model="partForm.name" placeholder="e.g. Fork Arm" size="lg" class="w-full" />
        </UFormField>

        <!-- Description -->
        <UFormField label="Description" description="Optional description of the part">
          <UTextarea v-model="partForm.description" placeholder="e.g. Injection molded ABS, black, snap-fit" :rows="3" class="w-full" />
        </UFormField>

        <!-- Vendor -->
        <UFormField label="Vendor" description="Supplier/vendor for this stock (tracked per stock line item)">
          <USelectMenu
            v-model="partForm.vendor"
            :items="vendorItems"
            value-key="value"
            placeholder="Select or type a vendor..."
            :search-input="true"
            :create-item="true"
            class="w-full"
          />
        </UFormField>

        <!-- Advanced Options -->
        <div>
          <button
            type="button"
            class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            @click="toggleAdvancedOptions"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="w-4 h-4 transition-transform"
              :class="showAdvancedOptions ? 'rotate-90' : ''"
            />
            Advanced Options
          </button>

          <div v-if="showAdvancedOptions" class="mt-3 space-y-3 pl-5 border-l-2 border-gray-200 dark:border-gray-700">
            <div>
              <label class="block text-sm font-medium mb-1">Category</label>
              <USelectMenu
                :model-value="selectedCategory"
                :items="categoryItems"
                value-key="value"
                placeholder="Select a category..."
                :loading="isLoadingCategories"
                :search-input="true"
                class="w-full"
                @update:model-value="(val: any) => selectedCategory = val"
              />
            </div>
          </div>
        </div>

        <USeparator />

        <!-- Initial Stock -->
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UCheckbox v-model="partForm.createStock" />
            <div>
              <label class="text-sm font-medium">Create Initial Stock</label>
              <p class="text-xs text-gray-500">Initial stock will be created when the part is saved</p>
            </div>
          </div>

          <UFormField v-if="partForm.createStock" label="Stock Quantity" description="Number of units to add">
            <UInput ref="stockQuantityInput" v-model.number="partForm.stockQuantity" type="number" min="1" class="w-full" />
          </UFormField>

          <!-- Label Printing -->
          <div v-if="partForm.createStock" class="space-y-3 pt-2">
            <div class="flex items-center gap-2">
              <UCheckbox v-model="partForm.printLabels" />
              <div>
                <label class="text-sm font-medium">Print labels for this stock</label>
                <p class="text-xs text-gray-500">Print Zebra labels with part name, part number, and QR code</p>
              </div>
            </div>

            <div v-if="partForm.printLabels" class="ml-7 space-y-3">
              <div class="flex items-center gap-4">
                <URadioGroup
                  v-model="partForm.labelMode"
                  :items="[
                    { label: 'One label for this part', value: 'one' },
                    { label: 'One label per item', value: 'per-item' }
                  ]"
                />
              </div>
              <p class="text-xs text-gray-500">
                <template v-if="partForm.labelMode === 'one'">
                  Prints a single label with the total quantity ({{ partForm.stockQuantity }}).
                  Attach it to the bin or container.
                </template>
                <template v-else>
                  Prints {{ partForm.stockQuantity }} labels — one for each item.
                  All share the same barcode linked to the stock item in InvenTree.
                </template>
              </p>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton
            @click="createPart"
            :loading="isLoading"
            :disabled="!partForm.name"
            icon="i-lucide-plus"
            size="lg"
          >
            Create Part
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
