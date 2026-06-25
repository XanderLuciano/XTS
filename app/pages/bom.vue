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

// Edit mode state
const isEditing = ref(false)
const editingQuantities = ref<Map<number, number>>(new Map())
const isSavingEdit = ref(false)
const pendingAdditions = ref<{ part: Part, quantity: number }[]>([])
const pendingDeletions = ref<Set<number>>(new Set())

// Assembly detail editing
const editAssemblyName = ref('')
const editAssemblyIPN = ref('')
const editAssemblyRevision = ref('')
const editAssemblyDescription = ref('')

// Shared search for edit mode
const editSearch = useBomComponentSearch(() => {
  const existingPks = new Set(bomItems.value.map(i => i.sub_part))
  for (const item of pendingAdditions.value) existingPks.add(item.part.pk)
  return existingPks
})

// Delete assembly state
const isDeleteConfirmOpen = ref(false)
const isDeletingAssembly = ref(false)

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

// --- Edit Mode ---
const startEditing = () => {
  if (!selectedAssembly.value) return
  isEditing.value = true
  editingQuantities.value = new Map(bomItems.value.map(item => [item.pk, item.quantity]))
  pendingAdditions.value = []
  pendingDeletions.value = new Set()
  editSearch.clear()

  // Populate assembly detail fields
  editAssemblyName.value = selectedAssembly.value.name
  editAssemblyIPN.value = selectedAssembly.value.IPN || ''
  editAssemblyRevision.value = selectedAssembly.value.revision || ''
  editAssemblyDescription.value = selectedAssembly.value.description || ''
}

const cancelEditing = () => {
  isEditing.value = false
  editingQuantities.value = new Map()
  pendingAdditions.value = []
  pendingDeletions.value = new Set()
  editSearch.clear()
}

const markForDeletion = (itemPk: number) => {
  pendingDeletions.value.add(itemPk)
}

const unmarkForDeletion = (itemPk: number) => {
  pendingDeletions.value.delete(itemPk)
}

const addEditComponent = (part: Part) => {
  pendingAdditions.value.push({ part, quantity: 1 })
  editSearch.clear()
}

const removeEditAddition = (index: number) => {
  pendingAdditions.value.splice(index, 1)
}

const saveEdits = async () => {
  if (!selectedAssembly.value) return
  isSavingEdit.value = true

  try {
    // 0. Update assembly details if changed
    const detailChanges: Record<string, string> = {}
    if (editAssemblyName.value !== selectedAssembly.value.name) detailChanges.name = editAssemblyName.value
    if (editAssemblyIPN.value !== (selectedAssembly.value.IPN || '')) detailChanges.IPN = editAssemblyIPN.value
    if (editAssemblyRevision.value !== (selectedAssembly.value.revision || '')) detailChanges.revision = editAssemblyRevision.value
    if (editAssemblyDescription.value !== (selectedAssembly.value.description || '')) detailChanges.description = editAssemblyDescription.value

    if (Object.keys(detailChanges).length > 0) {
      await inventree.updatePart(selectedAssembly.value.pk, detailChanges)
      // Update local state
      if (detailChanges.name) selectedAssembly.value.name = detailChanges.name
      if ('IPN' in detailChanges) selectedAssembly.value.IPN = detailChanges.IPN
      if ('revision' in detailChanges) selectedAssembly.value.revision = detailChanges.revision
      if ('description' in detailChanges) selectedAssembly.value.description = detailChanges.description
    }

    // 1. Delete removed items
    for (const pk of pendingDeletions.value) {
      await inventree.deleteBomItem(pk)
    }

    // 2. Update quantities for existing items
    for (const item of bomItems.value) {
      if (pendingDeletions.value.has(item.pk)) continue
      const newQty = editingQuantities.value.get(item.pk)
      if (newQty != null && newQty !== item.quantity) {
        await inventree.updateBomItem(item.pk, { quantity: newQty })
      }
    }

    // 3. Add new items
    for (const addition of pendingAdditions.value) {
      await inventree.createBomItem({
        part: selectedAssembly.value.pk,
        sub_part: addition.part.pk,
        quantity: addition.quantity
      })
    }

    toast.add({ title: 'BOM updated', color: 'success' })

    // Refresh BOM and assembly list
    isEditing.value = false
    await fetchAssemblies()
    await selectAssembly(selectedAssembly.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save changes'
    toast.add({ title: 'Error', description: message, color: 'error' })
  } finally {
    isSavingEdit.value = false
  }
}

// --- Delete Assembly ---
const confirmDeleteAssembly = () => {
  isDeleteConfirmOpen.value = true
}

const deleteAssembly = async () => {
  if (!selectedAssembly.value) return
  isDeletingAssembly.value = true

  try {
    await inventree.deleteAssembly(selectedAssembly.value.pk)
    toast.add({ title: 'Assembly deleted', description: selectedAssembly.value.name, color: 'success' })
    selectedAssembly.value = null
    bomItems.value = []
    isDeleteConfirmOpen.value = false
    await fetchAssemblies()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete assembly'
    toast.add({ title: 'Error', description: message, color: 'error' })
  } finally {
    isDeletingAssembly.value = false
  }
}

// --- Create Assembly state ---
const newAssembly = ref<CreateAssemblyDto>({
  name: '',
  IPN: '',
  revision: '',
  description: '',
  category: null
})
const showAdvancedOptions = ref(false)
const categories = ref<{ pk: number, name: string }[]>([])
const isLoadingCategories = ref(false)
const printLabel = ref(false)
const pendingBomItems = ref<{ part: Part, quantity: number }[]>([])
const isCreating = ref(false)

// Shared search for create mode
const createSearch = useBomComponentSearch(() => {
  return new Set(pendingBomItems.value.map(i => i.part.pk))
})

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
  createSearch.clear()
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
      <h1 class="text-2xl font-bold mb-1">
        Bill of Materials
      </h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Manage assemblies and their component requirements
      </p>
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
              <h3 class="font-semibold text-sm">
                Assemblies
              </h3>
            </template>

            <div
              v-if="isLoadingAssemblies"
              class="text-center py-4 text-gray-500"
            >
              <UIcon
                name="i-lucide-loader-2"
                class="w-4 h-4 animate-spin inline-block mr-1"
              />
              Loading...
            </div>

            <div
              v-else-if="assemblies.length === 0"
              class="text-center py-4 text-gray-500 text-sm"
            >
              No assemblies found. Create one first.
            </div>

            <div
              v-else
              class="space-y-1"
            >
              <button
                v-for="assembly in assemblies"
                :key="assembly.pk"
                class="w-full text-left px-3 py-2 rounded-md text-sm transition-colors"
                :class="selectedAssembly?.pk === assembly.pk
                  ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
                @click="selectAssembly(assembly)"
              >
                <div class="font-medium">
                  {{ assembly.name }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {{ assembly.IPN || 'No IPN' }}
                </div>
              </button>
            </div>
          </UCard>
        </div>

        <!-- Right: BOM details -->
        <div class="lg:col-span-2">
          <div
            v-if="!selectedAssembly"
            class="text-center py-12 text-gray-500 dark:text-gray-400"
          >
            <UIcon
              name="i-lucide-package"
              class="w-10 h-10 mx-auto mb-3 opacity-50"
            />
            <p>Select an assembly to view its BOM</p>
          </div>

          <div v-else>
            <!-- Assembly header -->
            <UCard class="mb-4">
              <div
                v-if="!isEditing"
                class="flex items-center justify-between"
              >
                <div>
                  <h2 class="text-lg font-bold">
                    {{ selectedAssembly.name }}
                  </h2>
                  <div class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    <span
                      v-if="selectedAssembly.IPN"
                      class="font-mono"
                    >{{ selectedAssembly.IPN }}</span>
                    <span v-if="selectedAssembly.revision">Rev {{ selectedAssembly.revision }}</span>
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {{ selectedAssembly.description || 'No description' }}
                  </p>
                </div>
                <div class="flex items-center gap-3">
                  <div class="text-right">
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      Can build
                    </p>
                    <p
                      class="text-lg font-bold"
                      :class="canBuild > 0 ? 'text-green-600' : 'text-red-600'"
                    >
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

              <!-- Editable assembly details -->
              <div
                v-else
                class="space-y-3"
              >
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Name</label>
                    <UInput
                      v-model="editAssemblyName"
                      size="sm"
                      class="w-full"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">IPN</label>
                    <UInput
                      v-model="editAssemblyIPN"
                      size="sm"
                      class="w-full"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Revision</label>
                    <UInput
                      v-model="editAssemblyRevision"
                      size="sm"
                      class="w-full"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Description</label>
                    <UInput
                      v-model="editAssemblyDescription"
                      size="sm"
                      class="w-full"
                    />
                  </div>
                </div>
              </div>

              <!-- Save/Cancel (edit mode only) -->
              <div
                v-if="isEditing"
                class="flex gap-2 mt-3"
              >
                <UButton
                  size="xs"
                  icon="i-lucide-check"
                  :loading="isSavingEdit"
                  @click="saveEdits"
                >
                  Save Changes
                </UButton>
                <UButton
                  size="xs"
                  variant="outline"
                  color="neutral"
                  icon="i-lucide-x"
                  @click="cancelEditing"
                >
                  Cancel
                </UButton>
              </div>
            </UCard>

            <!-- Shortage + action bar -->
            <div
              v-if="!isEditing"
              class="flex items-center justify-between mb-4"
            >
              <div>
                <UBadge
                  v-if="totalShortages > 0"
                  color="error"
                  variant="subtle"
                >
                  {{ totalShortages }} component{{ totalShortages !== 1 ? 's' : '' }} short for {{ buildQty }} build{{ buildQty !== 1 ? 's' : '' }}
                </UBadge>
              </div>
              <div class="flex gap-2">
                <UButton
                  size="xs"
                  variant="outline"
                  icon="i-lucide-pencil"
                  @click="startEditing"
                >
                  Edit BOM
                </UButton>
                <UButton
                  size="xs"
                  variant="outline"
                  color="error"
                  icon="i-lucide-trash-2"
                  @click="confirmDeleteAssembly"
                >
                  Delete
                </UButton>
              </div>
            </div>

            <!-- Add components in edit mode -->
            <div
              v-if="isEditing"
              class="mb-4"
            >
              <UCard>
                <template #header>
                  <h4 class="text-sm font-semibold">
                    Add Components
                  </h4>
                </template>
                <UInput
                  v-model="editSearch.searchQuery.value"
                  placeholder="Search parts to add..."
                  icon="i-lucide-search"
                  :loading="editSearch.isSearching.value"
                  size="sm"
                  @input="editSearch.search"
                />
                <div
                  v-if="editSearch.searchResults.value.length > 0"
                  class="mt-1 border border-gray-200 dark:border-gray-700 rounded-md max-h-36 overflow-y-auto bg-white dark:bg-gray-900"
                >
                  <button
                    v-for="part in editSearch.searchResults.value"
                    :key="part.pk"
                    class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0"
                    @click="addEditComponent(part)"
                  >
                    <span class="font-medium">{{ part.name }}</span>
                    <span class="text-xs text-gray-500 ml-2">{{ part.IPN || '' }}</span>
                  </button>
                </div>
                <!-- Pending additions -->
                <div
                  v-if="pendingAdditions.length > 0"
                  class="mt-3 space-y-2"
                >
                  <div
                    v-for="(item, index) in pendingAdditions"
                    :key="item.part.pk"
                    class="flex items-center gap-2 p-2 rounded bg-green-50 dark:bg-green-950/20 text-sm"
                  >
                    <UBadge
                      color="success"
                      variant="subtle"
                      size="xs"
                    >
                      NEW
                    </UBadge>
                    <span class="flex-1 truncate font-medium">{{ item.part.name }}</span>
                    <UInput
                      v-model.number="item.quantity"
                      type="number"
                      :min="1"
                      size="xs"
                      class="w-16"
                    />
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="error"
                      icon="i-lucide-x"
                      @click="removeEditAddition(index)"
                    />
                  </div>
                </div>
              </UCard>
            </div>

            <!-- BOM table -->
            <UCard :ui="{ body: 'p-0 sm:p-0' }">
              <div
                v-if="isLoadingBom"
                class="text-center py-8 text-gray-500"
              >
                <UIcon
                  name="i-lucide-loader-2"
                  class="w-5 h-5 animate-spin inline-block mr-2"
                />
                Loading BOM...
              </div>

              <div
                v-else-if="bomItems.length === 0 && !isEditing"
                class="text-center py-8 text-gray-500 text-sm"
              >
                This assembly has no BOM items.
              </div>

              <div
                v-else
                class="overflow-x-auto"
              >
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-gray-200 dark:border-gray-700">
                      <th class="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        Component
                      </th>
                      <th class="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        IPN
                      </th>
                      <th class="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        Qty/Build
                      </th>
                      <th
                        v-if="!isEditing"
                        class="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300"
                      >
                        Required
                      </th>
                      <th
                        v-if="!isEditing"
                        class="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300"
                      >
                        In Stock
                      </th>
                      <th
                        v-if="!isEditing"
                        class="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300"
                      >
                        Shortage
                      </th>
                      <th
                        v-if="isEditing"
                        class="w-10 px-2 py-3"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in bomItems"
                      :key="item.pk"
                      class="border-b border-gray-100 dark:border-gray-800"
                      :class="[
                        !isEditing && getShortage(item) > 0 ? 'bg-red-50 dark:bg-red-950/20' : '',
                        pendingDeletions.has(item.pk) ? 'opacity-40 line-through' : ''
                      ]"
                    >
                      <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        {{ item.sub_part_detail?.name || `Part #${item.sub_part}` }}
                      </td>
                      <td class="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">
                        {{ item.sub_part_detail?.IPN || '—' }}
                      </td>
                      <td class="px-4 py-3 text-right">
                        <UInput
                          v-if="isEditing && !pendingDeletions.has(item.pk)"
                          :model-value="editingQuantities.get(item.pk)"
                          type="number"
                          :min="1"
                          size="xs"
                          class="w-16 ml-auto"
                          @update:model-value="(v: string | number) => editingQuantities.set(item.pk, Number(v))"
                        />
                        <span
                          v-else
                          class="text-gray-700 dark:text-gray-300"
                        >{{ item.quantity }}</span>
                      </td>
                      <td
                        v-if="!isEditing"
                        class="px-4 py-3 text-right text-gray-700 dark:text-gray-300"
                      >
                        {{ item.quantity * buildQty }}
                      </td>
                      <td
                        v-if="!isEditing"
                        class="px-4 py-3 text-right"
                      >
                        <UBadge
                          :color="(item.sub_part_detail?.in_stock ?? 0) > 0 ? 'success' : 'error'"
                          variant="subtle"
                          size="sm"
                        >
                          {{ item.sub_part_detail?.in_stock ?? 0 }}
                        </UBadge>
                      </td>
                      <td
                        v-if="!isEditing"
                        class="px-4 py-3 text-right"
                      >
                        <UBadge
                          v-if="getShortage(item) > 0"
                          color="error"
                          variant="solid"
                          size="sm"
                        >
                          -{{ getShortage(item) }}
                        </UBadge>
                        <span
                          v-else
                          class="text-green-600 dark:text-green-400 text-xs font-medium"
                        >OK</span>
                      </td>
                      <td
                        v-if="isEditing"
                        class="px-2 py-3 text-center"
                      >
                        <UButton
                          v-if="!pendingDeletions.has(item.pk)"
                          size="xs"
                          variant="ghost"
                          color="error"
                          icon="i-lucide-trash-2"
                          @click="markForDeletion(item.pk)"
                        />
                        <UButton
                          v-else
                          size="xs"
                          variant="ghost"
                          color="neutral"
                          icon="i-lucide-undo-2"
                          @click="unmarkForDeletion(item.pk)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </UCard>

            <!-- Delete confirmation modal -->
            <UModal v-model:open="isDeleteConfirmOpen">
              <template #content>
                <div class="p-6 max-w-sm">
                  <h3 class="text-lg font-bold mb-2">
                    Delete Assembly
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Are you sure you want to delete <strong>{{ selectedAssembly?.name }}</strong>?
                    This will remove the assembly and all its BOM items. This cannot be undone.
                  </p>
                  <div class="flex gap-2 justify-end">
                    <UButton
                      variant="outline"
                      color="neutral"
                      size="sm"
                      @click="isDeleteConfirmOpen = false"
                    >
                      Cancel
                    </UButton>
                    <UButton
                      color="error"
                      size="sm"
                      :loading="isDeletingAssembly"
                      icon="i-lucide-trash-2"
                      @click="deleteAssembly"
                    >
                      Delete
                    </UButton>
                  </div>
                </div>
              </template>
            </UModal>
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
            <h3 class="font-semibold">
              Assembly Details
            </h3>
          </template>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Name *</label>
              <UInput
                v-model="newAssembly.name"
                placeholder="e.g. Controller Board Assembly"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">IPN</label>
              <UInput
                v-model="newAssembly.IPN"
                placeholder="e.g. ASM-001"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Revision</label>
              <UInput
                v-model="newAssembly.revision"
                placeholder="e.g. A"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Description</label>
              <UTextarea
                v-model="newAssembly.description"
                placeholder="Describe what this assembly is..."
                :rows="3"
                class="w-full"
              />
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

              <div
                v-if="showAdvancedOptions"
                class="mt-3 space-y-3 pl-5 border-l-2 border-gray-200 dark:border-gray-700"
              >
                <div>
                  <label class="block text-sm font-medium mb-1">Category</label>
                  <USelectMenu
                    :model-value="newAssembly.category ?? undefined"
                    :items="categoryItems"
                    value-key="value"
                    placeholder="Select a category..."
                    :loading="isLoadingCategories"
                    :search-input="true"
                    class="w-full"
                    @update:model-value="(val: number | null) => newAssembly.category = val"
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
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Print a Zebra label with QR barcode and link it to this assembly
                </p>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Right: BOM components -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">
              Components ({{ pendingBomItems.length }})
            </h3>
          </template>

          <!-- Search for parts -->
          <div class="mb-4">
            <UInput
              v-model="createSearch.searchQuery.value"
              placeholder="Search parts to add..."
              icon="i-lucide-search"
              :loading="createSearch.isSearching.value"
              @input="createSearch.search"
            />

            <!-- Search results dropdown -->
            <div
              v-if="createSearch.searchResults.value.length > 0"
              class="mt-1 border border-gray-200 dark:border-gray-700 rounded-md max-h-48 overflow-y-auto bg-white dark:bg-gray-900"
            >
              <button
                v-for="part in createSearch.searchResults.value"
                :key="part.pk"
                class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0"
                @click="addComponentToBom(part)"
              >
                <div class="font-medium">
                  {{ part.name }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ part.IPN || 'No IPN' }} · Stock: {{ part.in_stock }}
                </div>
              </button>
            </div>
          </div>

          <!-- Added components list -->
          <div
            v-if="pendingBomItems.length === 0"
            class="text-center py-6 text-gray-500 text-sm"
          >
            Search and add components above
          </div>

          <div
            v-else
            class="space-y-2"
          >
            <div
              v-for="(item, index) in pendingBomItems"
              :key="item.part.pk"
              class="flex items-center gap-3 p-2 rounded-md bg-gray-50 dark:bg-gray-800/50"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ item.part.name }}
                </p>
                <p class="text-xs text-gray-500">
                  {{ item.part.IPN || 'No IPN' }}
                </p>
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
