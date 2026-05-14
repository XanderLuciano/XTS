<script setup lang="ts">
import type { Part, BomItem, CreateAssemblyDto, CreateBomItemDto } from '~/types/inventree'

const inventree = useInventreeApi()
const toast = useToast()

// --- Tab state ---
const activeTab = ref('view')

// --- View BOMs state ---
const assemblies = ref<Part[]>([])
const isLoadingAssemblies = ref(false)
const selectedAssembly = ref<Part | null>(null)
const bomItems = ref<BomItem[]>([])
const isLoadingBom = ref(false)
const buildQty = ref(1)

const fetchAssemblies = async () => {
  isLoadingAssemblies.value = true
  try {
    const result = await inventree.listAssemblies({ limit: 100 })
    assemblies.value = result.results
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load assemblies'
    toast.add({ title: 'Error', description: message, color: 'error' })
  } finally {
    isLoadingAssemblies.value = false
  }
}

const selectAssembly = async (assembly: Part) => {
  selectedAssembly.value = assembly
  isLoadingBom.value = true
  try {
    bomItems.value = await inventree.getBomItems(assembly.pk)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load BOM'
    toast.add({ title: 'Error', description: message, color: 'error' })
    bomItems.value = []
  } finally {
    isLoadingBom.value = false
  }
}

const getShortage = (item: BomItem): number => {
  const required = item.quantity * buildQty.value
  const available = item.sub_part_detail?.in_stock ?? 0
  return Math.max(0, required - available)
}

const totalShortages = computed(() =>
  bomItems.value.filter(item => getShortage(item) > 0).length
)

const canBuild = computed(() => {
  if (bomItems.value.length === 0) return 0
  let min = Infinity
  for (const item of bomItems.value) {
    const available = item.sub_part_detail?.in_stock ?? 0
    const perBuild = item.quantity
    if (perBuild > 0) {
      min = Math.min(min, Math.floor(available / perBuild))
    }
  }
  return min === Infinity ? 0 : min
})

// --- Create Assembly state ---
const newAssembly = ref<CreateAssemblyDto>({
  name: '',
  IPN: '',
  revision: '',
  description: '',
  category: null
})
const showAdvancedOptions = ref(false)
const categories = ref<{ pk: number; name: string }[]>([])
const isLoadingCategories = ref(false)
const printLabel = ref(false)
const bomComponentSearch = ref('')
const bomComponentResults = ref<Part[]>([])
const isSearchingParts = ref(false)
const pendingBomItems = ref<{ part: Part; quantity: number }[]>([])
const isCreating = ref(false)

// Persist category and printLabel preference in localStorage (SSR-safe)
watch(() => newAssembly.value.category, (val) => {
  if (import.meta.server) return
  try {
    if (val != null) {
      localStorage.setItem('bom_create_category', String(val))
    } else {
      localStorage.removeItem('bom_create_category')
    }
  } catch { /* ignore */ }
})

watch(printLabel, (val) => {
  if (import.meta.server) return
  try {
    localStorage.setItem('bom_create_print_label', String(val))
  } catch { /* ignore */ }
})

let partSearchTimeout: ReturnType<typeof setTimeout> | null = null

const searchPartsForBom = () => {
  if (partSearchTimeout) clearTimeout(partSearchTimeout)
  if (!bomComponentSearch.value) {
    bomComponentResults.value = []
    return
  }
  partSearchTimeout = setTimeout(async () => {
    isSearchingParts.value = true
    try {
      const results = await inventree.searchParts(bomComponentSearch.value)
      // Filter out parts already added
      const addedPks = new Set(pendingBomItems.value.map(i => i.part.pk))
      bomComponentResults.value = results.filter(p => !addedPks.has(p.pk))
    } catch {
      bomComponentResults.value = []
    } finally {
      isSearchingParts.value = false
    }
  }, 300)
}

const toggleAdvancedOptions = async () => {
  showAdvancedOptions.value = !showAdvancedOptions.value
  if (showAdvancedOptions.value && categories.value.length === 0) {
    isLoadingCategories.value = true
    try {
      categories.value = await inventree.getCategories()
      // Validate persisted category is still valid
      if (newAssembly.value.category != null) {
        const stillValid = categories.value.some(c => c.pk === newAssembly.value.category)
        if (!stillValid) {
          newAssembly.value.category = null
        }
      }
    } catch {
      // silently fail, dropdown will just be empty
    } finally {
      isLoadingCategories.value = false
    }
  }
}

const categoryItems = computed(() =>
  categories.value.map(c => ({ label: c.name, value: c.pk }))
)

const addComponentToBom = (part: Part) => {
  pendingBomItems.value.push({ part, quantity: 1 })
  bomComponentSearch.value = ''
  bomComponentResults.value = []
}

const removeComponentFromBom = (index: number) => {
  pendingBomItems.value.splice(index, 1)
}

const createAssemblyWithBom = async () => {
  if (!newAssembly.value.name) {
    toast.add({ title: 'Name is required', color: 'warning' })
    return
  }
  if (pendingBomItems.value.length === 0) {
    toast.add({ title: 'Add at least one component', color: 'warning' })
    return
  }

  isCreating.value = true
  try {
    // 1. Create the assembly part
    const assembly = await inventree.createAssembly(newAssembly.value)

    // 2. Add BOM items
    for (const item of pendingBomItems.value) {
      const bomData: CreateBomItemDto = {
        part: assembly.pk,
        sub_part: item.part.pk,
        quantity: item.quantity
      }
      await inventree.createBomItem(bomData)
    }

    // 3. Create a stock item for the assembly so we can link a barcode
    let stockItem: { pk: number } | undefined
    try {
      stockItem = await inventree.addStock({
        part: assembly.pk,
        quantity: 0,
        notes: 'Stock item created for BOM barcode linking'
      })
    } catch {
      // Non-critical — label printing will still work, just no barcode link
    }

    // 4. Print label and link barcode if requested
    if (printLabel.value) {
      try {
        const partId = (newAssembly.value.IPN || newAssembly.value.name).replace(/\s+/g, '-').toUpperCase()
        const revision = newAssembly.value.revision || '0'
        const uid = Math.random().toString(36).slice(2, 8)
        const barcode = `${partId}-${revision}-${uid}`

        const printerUrl = localStorage.getItem('zebra_printer_url') || ''
        const printerApiKey = localStorage.getItem('zebra_api_key') || ''

        await $fetch('/api/print-label', {
          method: 'POST',
          body: {
            barcode,
            partName: newAssembly.value.name,
            partNumber: newAssembly.value.IPN || 'N/A',
            printerUrl: printerUrl || undefined,
            apiKey: printerApiKey || undefined
          }
        })

        // Link barcode to the stock item
        if (stockItem) {
          await inventree.linkBarcode(barcode, stockItem.pk)
        }

        toast.add({
          title: 'Label printed',
          description: `Barcode: ${barcode}`,
          color: 'success'
        })
      } catch (labelError) {
        const message = labelError instanceof Error ? labelError.message : 'Failed to print label'
        toast.add({ title: 'Label printing failed', description: message, color: 'error' })
      }
    }

    toast.add({
      title: 'Assembly created',
      description: `${assembly.name} with ${pendingBomItems.value.length} components`,
      color: 'success'
    })

    // Reset form (keep category and printLabel — they persist)
    newAssembly.value = { name: '', IPN: '', revision: '', description: '', category: newAssembly.value.category }
    pendingBomItems.value = []
    showAdvancedOptions.value = false

    // Switch to view tab and refresh
    activeTab.value = 'view'
    await fetchAssemblies()
    await selectAssembly(assembly)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create assembly'
    toast.add({ title: 'Error', description: message, color: 'error' })
  } finally {
    isCreating.value = false
  }
}

onMounted(() => {
  fetchAssemblies()

  // Hydrate persisted preferences from localStorage
  try {
    const savedCategory = localStorage.getItem('bom_create_category')
    if (savedCategory) {
      newAssembly.value.category = Number(savedCategory)
    }
    const savedPrintLabel = localStorage.getItem('bom_create_print_label')
    if (savedPrintLabel === 'true') {
      printLabel.value = true
    }
  } catch {
    // localStorage unavailable — keep defaults
  }
})
</script>

<template>
  <div class="container mx-auto p-6 max-w-6xl">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold mb-1">Bill of Materials</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">Manage assemblies and their component requirements</p>
    </div>

    <!-- Tabs -->
    <div class="flex gap-2 mb-6">
      <UButton
        :variant="activeTab === 'view' ? 'solid' : 'outline'"
        size="sm"
        icon="i-lucide-list"
        @click="activeTab = 'view'"
      >
        View BOMs
      </UButton>
      <UButton
        :variant="activeTab === 'create' ? 'solid' : 'outline'"
        size="sm"
        icon="i-lucide-plus"
        @click="activeTab = 'create'"
      >
        Create Assembly
      </UButton>
    </div>

    <!-- VIEW BOMs TAB -->
    <div v-if="activeTab === 'view'">
      <!-- Assembly selector -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left: Assembly list -->
        <div>
          <UCard>
            <template #header>
              <h3 class="font-semibold text-sm">Assemblies</h3>
            </template>

            <div v-if="isLoadingAssemblies" class="text-center py-4 text-gray-500">
              <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin inline-block mr-1" />
              Loading...
            </div>

            <div v-else-if="assemblies.length === 0" class="text-center py-4 text-gray-500 text-sm">
              No assemblies found. Create one first.
            </div>

            <div v-else class="space-y-1">
              <button
                v-for="assembly in assemblies"
                :key="assembly.pk"
                class="w-full text-left px-3 py-2 rounded-md text-sm transition-colors"
                :class="selectedAssembly?.pk === assembly.pk
                  ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
                @click="selectAssembly(assembly)"
              >
                <div class="font-medium">{{ assembly.name }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">{{ assembly.IPN || 'No IPN' }}</div>
              </button>
            </div>
          </UCard>
        </div>

        <!-- Right: BOM details -->
        <div class="lg:col-span-2">
          <div v-if="!selectedAssembly" class="text-center py-12 text-gray-500 dark:text-gray-400">
            <UIcon name="i-lucide-package" class="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Select an assembly to view its BOM</p>
          </div>

          <div v-else>
            <!-- Assembly header -->
            <UCard class="mb-4">
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="text-lg font-bold">{{ selectedAssembly.name }}</h2>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ selectedAssembly.description || 'No description' }}
                  </p>
                </div>
                <div class="flex items-center gap-3">
                  <div class="text-right">
                    <p class="text-xs text-gray-500 dark:text-gray-400">Can build</p>
                    <p class="text-lg font-bold" :class="canBuild > 0 ? 'text-green-600' : 'text-red-600'">
                      {{ canBuild }}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="text-xs text-gray-500 dark:text-gray-400">Build qty:</label>
                    <UInput
                      v-model.number="buildQty"
                      type="number"
                      :min="1"
                      size="xs"
                      class="w-16"
                    />
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Shortage summary -->
            <div v-if="totalShortages > 0" class="mb-4">
              <UBadge color="error" variant="subtle">
                {{ totalShortages }} component{{ totalShortages !== 1 ? 's' : '' }} short for {{ buildQty }} build{{ buildQty !== 1 ? 's' : '' }}
              </UBadge>
            </div>

            <!-- BOM table -->
            <UCard :ui="{ body: 'p-0 sm:p-0' }">
              <div v-if="isLoadingBom" class="text-center py-8 text-gray-500">
                <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin inline-block mr-2" />
                Loading BOM...
              </div>

              <div v-else-if="bomItems.length === 0" class="text-center py-8 text-gray-500 text-sm">
                This assembly has no BOM items.
              </div>

              <div v-else class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-gray-200 dark:border-gray-700">
                      <th class="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Component</th>
                      <th class="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">IPN</th>
                      <th class="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Qty/Build</th>
                      <th class="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Required</th>
                      <th class="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">In Stock</th>
                      <th class="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Shortage</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in bomItems"
                      :key="item.pk"
                      class="border-b border-gray-100 dark:border-gray-800"
                      :class="getShortage(item) > 0 ? 'bg-red-50 dark:bg-red-950/20' : ''"
                    >
                      <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        {{ item.sub_part_detail?.name || `Part #${item.sub_part}` }}
                      </td>
                      <td class="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">
                        {{ item.sub_part_detail?.IPN || '—' }}
                      </td>
                      <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {{ item.quantity }}
                      </td>
                      <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {{ item.quantity * buildQty }}
                      </td>
                      <td class="px-4 py-3 text-right">
                        <UBadge
                          :color="(item.sub_part_detail?.in_stock ?? 0) > 0 ? 'success' : 'error'"
                          variant="subtle"
                          size="sm"
                        >
                          {{ item.sub_part_detail?.in_stock ?? 0 }}
                        </UBadge>
                      </td>
                      <td class="px-4 py-3 text-right">
                        <UBadge
                          v-if="getShortage(item) > 0"
                          color="error"
                          variant="solid"
                          size="sm"
                        >
                          -{{ getShortage(item) }}
                        </UBadge>
                        <span v-else class="text-green-600 dark:text-green-400 text-xs font-medium">OK</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE ASSEMBLY TAB -->
    <div v-if="activeTab === 'create'">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left: Assembly details -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Assembly Details</h3>
          </template>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Name *</label>
              <UInput v-model="newAssembly.name" placeholder="e.g. Controller Board Assembly" class="w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">IPN</label>
              <UInput v-model="newAssembly.IPN" placeholder="e.g. ASM-001" class="w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Revision</label>
              <UInput v-model="newAssembly.revision" placeholder="e.g. A" class="w-full" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Description</label>
              <UTextarea v-model="newAssembly.description" placeholder="Describe what this assembly is..." :rows="3" class="w-full" />
            </div>

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
                    :model-value="newAssembly.category"
                    :items="categoryItems"
                    value-key="value"
                    placeholder="Select a category..."
                    :loading="isLoadingCategories"
                    :search-input="true"
                    class="w-full"
                    @update:model-value="(val: any) => newAssembly.category = val"
                  />
                </div>
              </div>
            </div>

            <USeparator class="my-2" />

            <!-- Print Label Option -->
            <div class="flex items-center gap-2">
              <UCheckbox v-model="printLabel" />
              <div>
                <label class="text-sm font-medium">Print label on create</label>
                <p class="text-xs text-gray-500 dark:text-gray-400">Print a Zebra label with QR barcode and link it to this assembly</p>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Right: BOM components -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Components ({{ pendingBomItems.length }})</h3>
          </template>

          <!-- Search for parts -->
          <div class="mb-4">
            <UInput
              v-model="bomComponentSearch"
              placeholder="Search parts to add..."
              icon="i-lucide-search"
              :loading="isSearchingParts"
              @input="searchPartsForBom"
            />

            <!-- Search results dropdown -->
            <div
              v-if="bomComponentResults.length > 0"
              class="mt-1 border border-gray-200 dark:border-gray-700 rounded-md max-h-48 overflow-y-auto bg-white dark:bg-gray-900"
            >
              <button
                v-for="part in bomComponentResults"
                :key="part.pk"
                class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0"
                @click="addComponentToBom(part)"
              >
                <div class="font-medium">{{ part.name }}</div>
                <div class="text-xs text-gray-500">{{ part.IPN || 'No IPN' }} · Stock: {{ part.in_stock }}</div>
              </button>
            </div>
          </div>

          <!-- Added components list -->
          <div v-if="pendingBomItems.length === 0" class="text-center py-6 text-gray-500 text-sm">
            Search and add components above
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="(item, index) in pendingBomItems"
              :key="item.part.pk"
              class="flex items-center gap-3 p-2 rounded-md bg-gray-50 dark:bg-gray-800/50"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ item.part.name }}</p>
                <p class="text-xs text-gray-500">{{ item.part.IPN || 'No IPN' }}</p>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-xs text-gray-500">Qty:</label>
                <UInput
                  v-model.number="item.quantity"
                  type="number"
                  :min="1"
                  size="xs"
                  class="w-16"
                />
              </div>
              <UButton
                variant="ghost"
                color="error"
                size="xs"
                icon="i-lucide-x"
                @click="removeComponentFromBom(index)"
              />
            </div>
          </div>

          <template #footer>
            <UButton
              block
              :loading="isCreating"
              :disabled="!newAssembly.name || pendingBomItems.length === 0"
              icon="i-lucide-check"
              @click="createAssemblyWithBom"
            >
              Create Assembly with {{ pendingBomItems.length }} Component{{ pendingBomItems.length !== 1 ? 's' : '' }}
            </UButton>
          </template>
        </UCard>
      </div>
    </div>
  </div>
</template>
