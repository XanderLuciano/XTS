<script setup lang="ts">
import type { CreatePartDto, AddStockDto, PartCategory, Part, StockItem, StockLocation } from '~/types/inventree'
import type { ComponentPublicInstance } from 'vue'
import { generateBarcode, setBarcodeInNotes, sanitizeTickets, setTicketsInNotes, classifyBarcodeMatch } from '~/utils/barcode'
import { sanitizeRevision } from '~/utils/sanitizeRevision'

// Pre-defined vendor options
const VENDOR_OPTIONS = ['YihShan', 'UMT', 'NRG', 'Prime', 'CIM', 'CIMTAS', 'KMS']

// Printer settings (respect the user's global local-USB vs remote choice)
const { print: printLabel, load: loadPrinterSettings } = usePrinterSettings()
const { listenForUsbEvents, reconnect: reconnectLocalPrinter } = useLocalPrinter()

interface PartForm {
  name: string
  description: string
  IPN: string
  revision: string
  vendor: string
  createStock: boolean
  stockQuantity: number
  jiraTickets: string
  barcode: string
  printLabels: boolean
  labelMode: 'one' | 'per-item'
}

const inventree = useInventreeApi()
const toast = useToast()

const isLoading = ref(false)

const stockQuantityInput = ref<ComponentPublicInstance | null>(null)

// Load persisted settings from localStorage (SSR-safe)
const partForm = reactive<PartForm>({
  name: '',
  description: '',
  IPN: '',
  revision: '',
  vendor: '',
  createStock: true,
  stockQuantity: 1,
  jiraTickets: '',
  barcode: '',
  printLabels: false,
  labelMode: 'one'
})

const vendorItems = ref(
  VENDOR_OPTIONS.map(v => ({ label: v, value: v }))
)

/**
 * Add a custom vendor typed by the user so it persists as the selected value.
 * Without this, USelectMenu's create-item entry isn't committed to the model.
 */
const onCreateVendor = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return
  if (!vendorItems.value.some(item => item.value === trimmed)) {
    vendorItems.value.push({ label: trimmed, value: trimmed })
  }
  partForm.vendor = trimmed
}

const ticketValidation = computed(() => {
  if (!partForm.jiraTickets.trim()) return { valid: true, message: '' }
  const result = sanitizeTickets(partForm.jiraTickets)
  if (!result.valid) {
    return { valid: false, message: `Invalid ticket format: ${result.invalid.join(', ')}. Expected format: ABC-1234` }
  }
  return { valid: true, message: '' }
})

// Hydrate persisted settings on mount to avoid SSR mismatch
onMounted(async () => {
  // Initialise printer preference + local USB listener so the print option
  // honours the global config (local vs remote).
  loadPrinterSettings()
  listenForUsbEvents()
  reconnectLocalPrinter()

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

    const savedLocation = localStorage.getItem('create_part_location')
    if (savedLocation) {
      selectedLocation.value = Number(savedLocation)
    }
  } catch {
    // Corrupt or unavailable storage — keep defaults
  }

  // Load categories since advanced options are expanded by default
  if (categories.value.length === 0) {
    isLoadingCategories.value = true
    try {
      categories.value = await inventree.getCategories()
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

  // Load locations for the optional initial-stock location picker
  if (locations.value.length === 0) {
    isLoadingLocations.value = true
    try {
      locations.value = await inventree.getLocations()
      if (selectedLocation.value != null) {
        const stillValid = locations.value.some(l => l.pk === selectedLocation.value)
        if (!stillValid) {
          selectedLocation.value = null
        }
      }
    } catch {
      // silently fail
    } finally {
      isLoadingLocations.value = false
    }
  }
})

// Category state
const showAdvancedOptions = ref(true)
const categories = ref<PartCategory[]>([])
const isLoadingCategories = ref(false)
const selectedCategory = ref<number | null>(null)

const categoryItems = computed(() =>
  categories.value.map(c => ({ label: c.name, value: c.pk }))
)

// Location state (optional location for initial stock)
const locations = ref<StockLocation[]>([])
const isLoadingLocations = ref(false)
const selectedLocation = ref<number | null>(null)

const locationItems = computed(() =>
  locations.value.map(l => ({ label: l.name, value: l.pk }))
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

watch(selectedLocation, (val) => {
  if (import.meta.server) return
  try {
    if (val != null) {
      localStorage.setItem('create_part_location', String(val))
    } else {
      localStorage.removeItem('create_part_location')
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
    // Validate JIRA tickets if provided
    let parsedTickets: string[] = []
    if (partForm.createStock && partForm.jiraTickets.trim()) {
      const ticketResult = sanitizeTickets(partForm.jiraTickets)
      if (!ticketResult.valid) {
        toast.add({ title: 'Invalid JIRA tickets', description: `Fix: ${ticketResult.invalid.join(', ')}`, color: 'error' })
        isLoading.value = false
        return
      }
      parsedTickets = ticketResult.tickets
    }

    // Sanitize revision input
    if (partForm.revision) {
      partForm.revision = sanitizeRevision(partForm.revision)
    }

    // Validate provided barcode is not already in use.
    // If it is in use, compare the existing part's IPN to the one being created
    // and let the user know whether it's the same part or a different one.
    const manualBarcode = partForm.barcode.trim()
    if (manualBarcode) {
      let existingBarcodePart: Part | null = null
      try {
        existingBarcodePart = await inventree.scanBarcode(manualBarcode)
      } catch {
        // Treat lookup failures as "unable to verify" and stop to avoid duplicate barcodes
        toast.add({
          title: 'Could not verify barcode',
          description: 'Unable to check whether this barcode is already in use. Please try again.',
          color: 'error'
        })
        isLoading.value = false
        return
      }

      if (existingBarcodePart) {
        const existingIpn = existingBarcodePart.IPN || '(no IPN)'
        const existingRev = existingBarcodePart.revision || ''
        const matchKind = classifyBarcodeMatch({
          existingIpn: existingBarcodePart.IPN,
          existingRevision: existingBarcodePart.revision,
          enteredIpn: partForm.IPN,
          enteredRevision: partForm.revision
        })

        const existingLabel = `${existingBarcodePart.name} (IPN: ${existingIpn}${existingRev ? `, Rev ${existingRev}` : ''})`
        let description: string
        if (matchKind === 'same-part') {
          description = `Barcode ${manualBarcode} is already linked to this part (IPN: ${existingIpn}${existingRev ? `, Rev ${existingRev}` : ''}).`
        } else if (matchKind === 'same-ipn-diff-rev') {
          // Same part number but a different revision — likely a different revision of the same part
          description = `Barcode ${manualBarcode} is already in use by a different revision of this part: ${existingLabel}.`
        } else {
          description = `Barcode ${manualBarcode} is already in use by a different part: ${existingLabel}.`
        }

        toast.add({
          title: 'Barcode already in use',
          description,
          color: matchKind === 'same-part' ? 'warning' : 'error'
        })
        isLoading.value = false
        return
      }
    }

    // Compose display name: "165580-001 · Rev A · 10K Ohm Resistor"
    const composedName = [
      partForm.IPN,
      partForm.revision ? `Rev ${partForm.revision}` : null,
      partForm.name
    ].filter(Boolean).join(' · ')

    let partPk: number | undefined
    let isExistingPart = false
    let action: 'created-part' | 'added-stock-new-vendor' | 'added-stock-existing-vendor' = 'created-part'

    // Step 1: Check if a part with same IPN + revision already exists
    if (partForm.IPN) {
      const existingPart = await inventree.findPartByIPNAndRevision(partForm.IPN, partForm.revision || '')
      if (existingPart) {
        partPk = existingPart.pk
        isExistingPart = true
      }
    }

    // Step 2: Create new part only if IPN+Rev is truly new
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
      action = 'created-part'
      toast.add({ title: 'Part created', description: composedName, color: 'success' })
    }

    let stockItem: StockItem | undefined

    // Step 3: Handle stock
    if (partForm.createStock && partPk) {
      try {
        if (partForm.vendor) {
          // Check if stock item with this vendor already exists
          const existingVendorStock = await inventree.getStockItemsByBatch(partPk, partForm.vendor)

          if (existingVendorStock.length > 0) {
            // Same part, same vendor — add to existing stock item
            const existing = existingVendorStock[0]!
            const hasBarcode = !!existing.barcode_hash
            stockItem = await inventree.addToExistingStock(existing.pk, {
              quantity: partForm.stockQuantity,
              notes: 'Stock added via webapp'
            })
            // Store JIRA tickets in notes if provided
            if (parsedTickets.length > 0) {
              const currentNotes = existing.notes || ''
              const updatedNotes = setTicketsInNotes(currentNotes, parsedTickets)
              await inventree.updateStockItem(existing.pk, { notes: updatedNotes })
            }
            // Preserve barcode_hash info for label printing decision
            if (hasBarcode) {
              action = 'added-stock-existing-vendor'
            } else {
              // Stock item exists but has no barcode — we can still print one
              action = isExistingPart ? 'added-stock-new-vendor' : action
            }
            toast.add({
              title: 'Added to existing stock',
              description: `+${partForm.stockQuantity} units to ${partForm.vendor} stock`,
              color: 'success'
            })
          } else {
            // Same part, new vendor — create new stock item with batch
            const stockNotes = parsedTickets.length > 0
              ? setTicketsInNotes('New vendor stock created via webapp', parsedTickets)
              : 'New vendor stock created via webapp'
            stockItem = await inventree.createStockItem({
              part: partPk,
              quantity: partForm.stockQuantity,
              location: selectedLocation.value,
              batch: partForm.vendor,
              notes: stockNotes
            })
            action = isExistingPart ? 'added-stock-new-vendor' : action
            toast.add({
              title: isExistingPart ? 'New vendor stock created' : 'Stock created',
              description: `${partForm.stockQuantity} units (vendor: ${partForm.vendor})`,
              color: 'success'
            })
          }
        } else {
          // No vendor specified — use standard addStock (merges into first item)
          const baseNotes = `Stock ${isExistingPart ? 'added' : 'created'} via webapp`
          const stockNotes = parsedTickets.length > 0
            ? setTicketsInNotes(baseNotes, parsedTickets)
            : baseNotes
          const stockData: AddStockDto = {
            part: partPk,
            quantity: partForm.stockQuantity,
            location: selectedLocation.value,
            notes: stockNotes
          }
          stockItem = await inventree.addStock(stockData)
          toast.add({
            title: isExistingPart ? 'Added to existing stock' : 'Stock created',
            description: `${partForm.stockQuantity} units`,
            color: 'success'
          })
        }
      } catch (stockError) {
        const message = stockError instanceof Error ? stockError.message : 'Failed to add stock'
        toast.add({ title: 'Failed to add stock', description: message, color: 'error' })
      }
    }

    // Summary toast for existing part cases
    if (isExistingPart && action !== 'created-part') {
      toast.add({
        title: 'Existing part detected',
        description: `${composedName} already exists — stock updated`,
        color: 'info'
      })
    }

    // Step 4: Link barcode and optionally print labels
    // We link a barcode when the user provided one manually, or when printing labels
    // (which generates a deterministic barcode). Skip when we added to an existing
    // vendor's stock since that item already has a barcode/label.
    const shouldHandleBarcode = (manualBarcode || partForm.printLabels)
      && stockItem
      && action !== 'added-stock-existing-vendor'

    if (shouldHandleBarcode && stockItem) {
      try {
        const barcode = manualBarcode || generateBarcode({
          ipn: partForm.IPN,
          revision: partForm.revision,
          batch: partForm.vendor,
          stockItemPk: stockItem.pk
        })

        // Print labels only when requested
        if (partForm.printLabels) {
          const labelCount = partForm.labelMode === 'per-item'
            ? partForm.stockQuantity
            : 1
          const quantity = partForm.labelMode === 'one' ? partForm.stockQuantity : undefined

          for (let i = 0; i < labelCount; i++) {
            // Route through usePrinterSettings so the user's configured
            // method (local USB vs remote server) is respected.
            const printResult = await printLabel({
              barcode,
              partName: partForm.name,
              partNumber: partForm.IPN || 'N/A',
              quantity,
              vendor: partForm.vendor || undefined
            })
            if (!printResult.success) {
              throw new Error(printResult.error || 'Failed to print label')
            }
          }
        }

        // Link barcode to the stock item
        await inventree.linkBarcode(barcode, stockItem.pk)

        // Store barcode in notes for future reprinting
        const currentNotes = stockItem.notes || ''
        const updatedNotes = setBarcodeInNotes(currentNotes, barcode)
        await inventree.updateStockItem(stockItem.pk, { notes: updatedNotes })

        if (partForm.printLabels) {
          const labelCount = partForm.labelMode === 'per-item' ? partForm.stockQuantity : 1
          const copies = labelCount > 1 ? ` (${labelCount} identical copies)` : ''
          toast.add({
            title: labelCount === 1 ? 'Label printed' : `${labelCount} labels printed`,
            description: `Barcode: ${barcode}${copies}`,
            color: 'success'
          })
        } else {
          toast.add({
            title: 'Barcode linked',
            description: `Barcode ${barcode} linked to stock item`,
            color: 'success'
          })
        }
      } catch (labelError) {
        const message = labelError instanceof Error ? labelError.message : 'Failed to link barcode or print label'
        toast.add({ title: 'Barcode/label step failed', description: message, color: 'error' })
      }
    }

    // Inform user label was skipped when adding to existing vendor stock
    if (partForm.printLabels && action === 'added-stock-existing-vendor') {
      toast.add({
        title: 'Label not printed',
        description: 'Stock was added to an existing item that already has a barcode label',
        color: 'warning'
      })
    }

    // Reset form (keep vendor, printLabels, labelMode — they persist across sessions)
    partForm.name = ''
    partForm.description = ''
    partForm.IPN = ''
    partForm.revision = ''
    partForm.jiraTickets = ''
    partForm.barcode = ''
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
      <h1 class="text-2xl font-bold mb-2">
        Create Part
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        Add a new part to the InvenTree database
      </p>
    </div>

    <!-- Part Creation Form -->
    <UCard class="mb-6">
      <div class="space-y-6">
        <!-- Part Number (IPN) -->
        <UFormField
          label="Part Number"
          required
          description="Engineering part number, e.g. 165801-001"
        >
          <UInput
            v-model="partForm.IPN"
            placeholder="e.g. 165801-001"
            class="w-full"
          />
        </UFormField>

        <!-- Part Revision -->
        <UFormField
          label="Part Revision"
          required
          description="Just the letter or number — &quot;Rev&quot; is prepended automatically"
        >
          <UInput
            v-model="partForm.revision"
            placeholder="e.g. A"
            class="w-full"
          />
        </UFormField>

        <!-- Part Name -->
        <UFormField
          label="Part Name"
          required
          description="The display name of the part"
        >
          <UInput
            v-model="partForm.name"
            placeholder="e.g. Fork Arm"
            size="lg"
            class="w-full"
          />
        </UFormField>

        <!-- Description -->
        <UFormField
          label="Description"
          description="Optional description of the part"
        >
          <UTextarea
            v-model="partForm.description"
            placeholder="e.g. Injection molded ABS, black, snap-fit"
            :rows="3"
            class="w-full"
          />
        </UFormField>

        <!-- Vendor -->
        <UFormField
          label="Vendor"
          description="Supplier/vendor for this stock (tracked per stock line item)"
        >
          <USelectMenu
            v-model="partForm.vendor"
            :items="vendorItems"
            value-key="value"
            placeholder="Select or type a vendor..."
            :search-input="true"
            :create-item="true"
            class="w-full"
            @create="onCreateVendor"
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

          <div
            v-if="showAdvancedOptions"
            class="mt-3 space-y-3 pl-5 border-l-2 border-gray-200 dark:border-gray-700"
          >
            <div>
              <label class="block text-sm font-medium mb-1">Category</label>
              <USelectMenu
                :model-value="selectedCategory ?? undefined"
                :items="categoryItems"
                value-key="value"
                placeholder="Select a category..."
                :loading="isLoadingCategories"
                :search-input="true"
                class="w-full"
                @update:model-value="(val: number | null) => selectedCategory = val"
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
              <p class="text-xs text-gray-500">
                Initial stock will be created when the part is saved
              </p>
            </div>
          </div>

          <UFormField
            v-if="partForm.createStock"
            label="Stock Quantity"
            description="Number of units to add"
          >
            <UInput
              ref="stockQuantityInput"
              v-model.number="partForm.stockQuantity"
              type="number"
              min="1"
              class="w-full"
            />
          </UFormField>

          <!-- Stock Location (optional) -->
          <UFormField
            v-if="partForm.createStock"
            label="Stock Location"
            description="Optional — where this initial stock is stored"
          >
            <USelectMenu
              :model-value="selectedLocation ?? undefined"
              :items="locationItems"
              value-key="value"
              placeholder="Select a location..."
              :loading="isLoadingLocations"
              :search-input="true"
              class="w-full"
              @update:model-value="(val: number | null) => selectedLocation = val"
            />
          </UFormField>

          <!-- JIRA Ticket(s) -->
          <UFormField
            v-if="partForm.createStock"
            label="JIRA Ticket(s)"
            description="Optional — comma-separated ticket references (e.g. PI-1234, MFG-12345)"
            :error="!ticketValidation.valid ? ticketValidation.message : undefined"
          >
            <UInput
              v-model="partForm.jiraTickets"
              placeholder="e.g. PI-1234, MFG-12345"
              class="w-full"
              :ui="{ base: 'font-mono' }"
              :color="!ticketValidation.valid ? 'error' : undefined"
            />
          </UFormField>

          <!-- Existing Barcode -->
          <UFormField
            v-if="partForm.createStock"
            label="Existing Barcode"
            description="Optional — if the part already has a barcode applied, enter it here to link it instead of generating a new one"
          >
            <UInput
              v-model="partForm.barcode"
              placeholder="Scan or type existing barcode..."
              class="w-full"
              :ui="{ base: 'font-mono' }"
            />
          </UFormField>

          <!-- Label Printing -->
          <div
            v-if="partForm.createStock"
            class="space-y-3 pt-2"
          >
            <div class="flex items-center gap-2">
              <UCheckbox v-model="partForm.printLabels" />
              <div>
                <label class="text-sm font-medium">Print labels for this stock</label>
                <p class="text-xs text-gray-500">
                  Print Zebra labels with part name, part number, and QR code
                </p>
              </div>
            </div>

            <div
              v-if="partForm.printLabels"
              class="ml-7 space-y-3"
            >
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
            :loading="isLoading"
            :disabled="!partForm.name || !ticketValidation.valid"
            icon="i-lucide-plus"
            size="lg"
            @click="createPart"
          >
            Create Part
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
