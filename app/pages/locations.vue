<script setup lang="ts">
import type { StockLocation } from '~/types/inventree'
import { buildLocationCode, describeLocationCode, isValidComponent } from '~/utils/locationCode'

const toast = useToast()
const inventree = useInventreeApi()
const { print: _print, load: loadPrinterSettings, printLocation } = usePrinterSettings()
const { listenForUsbEvents, reconnect: reconnectLocalPrinter } = useLocalPrinter()

interface LocationForm {
  room: number
  shelf: number
  row: number
  bin: number
}

const form = reactive<LocationForm>({
  room: 1,
  shelf: 1,
  row: 1,
  bin: 1
})

const autoPrint = ref(true)
const isCreating = ref(false)

// Live preview of the encoded code
const previewCode = computed(() => {
  if (![form.room, form.shelf, form.row, form.bin].every(isValidComponent)) {
    return ''
  }
  return buildLocationCode({
    room: form.room,
    shelf: form.shelf,
    row: form.row,
    bin: form.bin
  })
})

const previewDescription = computed(() =>
  previewCode.value ? describeLocationCode(previewCode.value) : ''
)

const formValid = computed(() =>
  [form.room, form.shelf, form.row, form.bin].every(isValidComponent)
)

// Existing locations list
const locations = ref<StockLocation[]>([])
const isLoadingLocations = ref(false)
const searchQuery = ref('')

const loadLocations = async () => {
  isLoadingLocations.value = true
  try {
    locations.value = await inventree.getLocations()
  } catch (e) {
    console.error('Failed to load locations:', e)
    toast.add({ title: 'Failed to load locations', color: 'error' })
  } finally {
    isLoadingLocations.value = false
  }
}

const filteredLocations = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return locations.value
  return locations.value.filter(l =>
    l.name.toLowerCase().includes(q)
    || (l.description || '').toLowerCase().includes(q)
  )
})

onMounted(() => {
  loadPrinterSettings()
  listenForUsbEvents()
  reconnectLocalPrinter()
  loadLocations()
})

/**
 * Print a location label using the user's configured print method.
 * Returns true on success.
 */
const printLabelFor = async (code: string): Promise<boolean> => {
  const result = await printLocation(code, describeLocationCode(code))
  if (result.success) {
    toast.add({
      title: 'Label printed',
      description: `${code} (via ${result.method === 'local' ? 'USB' : 'server'})`,
      color: 'success'
    })
    return true
  }
  toast.add({
    title: 'Label print failed',
    description: result.error || 'Unknown print error',
    color: 'error'
  })
  return false
}

const createLocation = async () => {
  if (!formValid.value) {
    toast.add({ title: 'Invalid location', description: 'Each component must be between 0 and 999', color: 'error' })
    return
  }

  isCreating.value = true
  const code = previewCode.value

  try {
    // Guard against duplicates
    const existing = await inventree.findLocationByName(code)
    if (existing) {
      toast.add({
        title: 'Location already exists',
        description: `${code} is already in InvenTree`,
        color: 'warning'
      })
      isCreating.value = false
      return
    }

    const created = await inventree.createLocation({
      name: code,
      description: describeLocationCode(code)
    })

    toast.add({ title: 'Location created', description: code, color: 'success' })

    // Link the encoded code as a scannable barcode on the location
    try {
      await inventree.linkLocationBarcode(code, created.pk)
    } catch (linkError) {
      const message = linkError instanceof Error ? linkError.message : 'Failed to link barcode'
      toast.add({ title: 'Barcode link failed', description: message, color: 'warning' })
    }

    if (autoPrint.value) {
      await printLabelFor(code)
    }

    await loadLocations()

    // Advance the bin number for quick sequential entry
    if (isValidComponent(form.bin + 1)) {
      form.bin += 1
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create location'
    toast.add({ title: 'Failed to create location', description: message, color: 'error' })
  } finally {
    isCreating.value = false
  }
}

// Reprint flow for existing (possibly damaged) labels
const reprintLocation = async (location: StockLocation) => {
  await printLabelFor(location.name)
}
</script>

<template>
  <div class="container mx-auto p-6 max-w-3xl">
    <div class="mb-8">
      <h1 class="text-2xl font-bold mb-2">
        Locations
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        Create bin locations and print scannable labels
      </p>
    </div>

    <!-- Create Location -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold">
          New Bin Location
        </h2>
      </template>

      <div class="space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <UFormField
            label="Room"
            description="0–999"
          >
            <UInput
              v-model.number="form.room"
              type="number"
              min="0"
              max="999"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Rack"
            description="0–999"
          >
            <UInput
              v-model.number="form.shelf"
              type="number"
              min="0"
              max="999"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Shelf"
            description="0–999"
          >
            <UInput
              v-model.number="form.row"
              type="number"
              min="0"
              max="999"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Bin"
            description="0–999"
          >
            <UInput
              v-model.number="form.bin"
              type="number"
              min="0"
              max="999"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Preview -->
        <div class="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
          <p class="text-xs uppercase tracking-wider text-gray-500 mb-1">
            Encoded Location Code
          </p>
          <template v-if="previewCode">
            <p class="font-mono text-2xl font-bold">
              {{ previewCode }}
            </p>
            <p class="text-sm text-gray-500 mt-1">
              {{ previewDescription }}
            </p>
          </template>
          <p
            v-else
            class="text-sm text-red-500"
          >
            Enter values between 0 and 999 for each component
          </p>
        </div>

        <div class="flex items-center gap-2">
          <UCheckbox v-model="autoPrint" />
          <div>
            <label class="text-sm font-medium">Print label after creating</label>
            <p class="text-xs text-gray-500">
              Uses your configured default printer (Config → Default Printer)
            </p>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton
            :loading="isCreating"
            :disabled="!formValid"
            icon="i-lucide-plus"
            size="lg"
            @click="createLocation"
          >
            Create Location
          </UButton>
        </div>
      </template>
    </UCard>

    <!-- Existing Locations -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-lg font-semibold">
            Existing Locations ({{ locations.length }})
          </h2>
          <UButton
            variant="ghost"
            size="xs"
            icon="i-lucide-refresh-cw"
            :loading="isLoadingLocations"
            @click="loadLocations"
          >
            Refresh
          </UButton>
        </div>
      </template>

      <div class="mb-4">
        <UInput
          v-model="searchQuery"
          placeholder="Search locations..."
          icon="i-lucide-search"
          class="w-full"
        />
      </div>

      <div
        v-if="isLoadingLocations"
        class="text-center py-8 text-gray-500"
      >
        Loading...
      </div>

      <div
        v-else-if="filteredLocations.length === 0"
        class="text-center py-8 text-gray-500"
      >
        No locations found.
      </div>

      <div
        v-else
        class="space-y-2"
      >
        <div
          v-for="location in filteredLocations"
          :key="location.pk"
          class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <div class="min-w-0">
            <p class="font-mono font-semibold truncate">
              {{ location.name }}
            </p>
            <p
              v-if="location.description"
              class="text-xs text-gray-500 truncate"
            >
              {{ location.description }}
            </p>
          </div>
          <UTooltip text="Reprint label for this location">
            <UButton
              size="xs"
              variant="outline"
              icon="i-lucide-printer"
              @click="reprintLocation(location)"
            >
              Reprint
            </UButton>
          </UTooltip>
        </div>
      </div>
    </UCard>
  </div>
</template>
