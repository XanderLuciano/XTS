<script setup lang="ts">
import type { Part } from '~/types/inventree'
import type { KitItem, RevisionOption } from '~/types/kit'
import { resolveImageUrl as _resolveImageUrl } from '~/utils/resolveImageUrl'
import { buildKitSummaryMarkdown } from '~/utils/kitSummary'
import { describeLocationCode } from '~/utils/locationCode'

const toast = useToast()
const config = useRuntimeConfig()
const inventree = useInventreeApi()

const resolveImageUrl = (url: string | undefined | null): string =>
  _resolveImageUrl(url, config.public.inventreeApiUrl as string)

const {
  assemblyPk,
  assemblyName,
  assemblyIPN,
  kitName,
  buildQty,
  items,
  unmatchedScans,
  isLoading,
  isCompleting,
  completed,
  highlightedItemId,
  loadKit,
  setBuildQty,
  scan,
  updateNote,
  updateKitQty,
  overrideRevision,
  getRevisionOptions,
  skipItem,
  unskipItem,
  removeScan,
  removeUnmatched,
  completeKit,
  clearKit,
  loadFromStorage,
  totalRequired,
  totalScanned,
  blockingItems,
  canComplete,
  hasRevMismatch
} = useKitList(inventree)

// --- Assembly selection --------------------------------------------------
const assemblies = ref<Part[]>([])
const isLoadingAssemblies = ref(false)
const assemblySearch = ref('')

const filteredAssemblies = computed(() => {
  const q = assemblySearch.value.trim().toLowerCase()
  if (!q) return assemblies.value
  return assemblies.value.filter(a =>
    a.name.toLowerCase().includes(q) || (a.IPN || '').toLowerCase().includes(q)
  )
})

const fetchAssemblies = async () => {
  isLoadingAssemblies.value = true
  try {
    const result = await inventree.listAssemblies({ limit: 200 })
    assemblies.value = result.results
  } catch (error) {
    toast.add({
      title: 'Error',
      description: error instanceof Error ? error.message : 'Failed to load assemblies',
      color: 'error'
    })
  } finally {
    isLoadingAssemblies.value = false
  }
}

const selectAssembly = async (assembly: Part) => {
  await loadKit(assembly)
  focusInput()
}

// --- Barcode scanning ----------------------------------------------------
const barcodeInput = ref('')
const barcodeInputRef = ref<HTMLInputElement | null>(null)

const focusInput = () => {
  nextTick(() => {
    const el: unknown = barcodeInputRef.value
    if (!el) return
    const root = el instanceof HTMLElement ? el : (el as { $el?: HTMLElement }).$el
    const input = root?.querySelector('input') ?? root
    if (input instanceof HTMLElement) input.focus()
  })
}

const handleScan = async () => {
  const value = barcodeInput.value.trim()
  if (!value) return
  barcodeInput.value = ''
  await scan(value)
  focusInput()
}

// --- Revision override modal ---------------------------------------------
const isRevModalOpen = ref(false)
const revTargetItem = ref<KitItem | null>(null)
const revInput = ref('')
const isApplyingRev = ref(false)
const revOptions = ref<RevisionOption[]>([])
const isLoadingRevOptions = ref(false)

const openRevModal = async (item: KitItem) => {
  revTargetItem.value = item
  revInput.value = item.targetRevision
  revOptions.value = []
  isRevModalOpen.value = true
  isLoadingRevOptions.value = true
  try {
    revOptions.value = await getRevisionOptions(item.id)
  } finally {
    isLoadingRevOptions.value = false
  }
}

const selectRevOption = (option: RevisionOption) => {
  revInput.value = option.revision
}

const applyRevOverride = async () => {
  if (!revTargetItem.value) return
  isApplyingRev.value = true
  const ok = await overrideRevision(revTargetItem.value.id, revInput.value)
  isApplyingRev.value = false
  if (ok) {
    toast.add({ title: 'Revision updated', color: 'success' })
    isRevModalOpen.value = false
  } else {
    toast.add({
      title: 'Could not override',
      description: revTargetItem.value.errorMessage || 'Part revision not found',
      color: 'error'
    })
  }
}

// --- Skip modal ----------------------------------------------------------
const isSkipModalOpen = ref(false)
const skipTargetItem = ref<KitItem | null>(null)
const skipReasonInput = ref('')

const openSkipModal = (item: KitItem) => {
  skipTargetItem.value = item
  skipReasonInput.value = ''
  isSkipModalOpen.value = true
}

const confirmSkip = () => {
  if (!skipTargetItem.value) return
  skipItem(skipTargetItem.value.id, skipReasonInput.value)
  isSkipModalOpen.value = false
  focusInput()
}

// --- Complete kit --------------------------------------------------------
const isCompleteConfirmOpen = ref(false)

const handleComplete = async () => {
  isCompleteConfirmOpen.value = false
  const result = await completeKit()
  if (result.success) {
    toast.add({ title: 'Kit complete', description: result.message, color: 'success' })
  } else {
    toast.add({ title: 'Completion incomplete', description: result.message, color: 'error' })
  }
}

// --- Change assembly (discard) ------------------------------------------
const isDiscardConfirmOpen = ref(false)

const handleDiscard = () => {
  clearKit()
  isDiscardConfirmOpen.value = false
  fetchAssemblies()
}

// --- Summary markdown ----------------------------------------------------
const summaryMarkdown = computed(() =>
  buildKitSummaryMarkdown({
    kitName: kitName.value,
    assemblyName: assemblyName.value,
    buildQty: buildQty.value,
    items: items.value
  })
)

const copySummary = async () => {
  try {
    await navigator.clipboard.writeText(summaryMarkdown.value)
    toast.add({ title: 'Copied to clipboard', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', description: 'Select and copy manually', color: 'error' })
  }
}

const printSummary = () => {
  window.print()
}

// --- Status display helpers ----------------------------------------------
const statusBadge = (item: KitItem): { color: 'success' | 'warning' | 'error' | 'neutral' | 'primary', label: string } => {
  switch (item.status) {
    case 'complete': return { color: 'success', label: 'Complete' }
    case 'rev-mismatch': return { color: 'warning', label: 'Rev mismatch' }
    case 'partial': return { color: 'primary', label: `${item.scans.length}/${item.kitQty}` }
    case 'skipped': return { color: 'neutral', label: 'Skipped' }
    case 'error': return { color: 'error', label: 'Error' }
    default: return { color: 'neutral', label: 'Pending' }
  }
}

const rowClass = (item: KitItem): string => {
  if (highlightedItemId.value === item.id) return 'animate-highlight-pulse'
  switch (item.status) {
    case 'complete': return 'bg-green-50 dark:bg-green-900/20'
    case 'rev-mismatch': return 'bg-amber-50 dark:bg-amber-900/20'
    case 'error': return 'bg-red-50 dark:bg-red-900/20'
    case 'skipped': return 'bg-gray-50 dark:bg-gray-900/40 opacity-70'
    default: return ''
  }
}

// Clear highlight after the pulse animation runs.
watch(highlightedItemId, (id) => {
  if (id) {
    setTimeout(() => {
      if (highlightedItemId.value === id) highlightedItemId.value = null
    }, 1500)
  }
})

onMounted(() => {
  const restored = loadFromStorage()
  if (restored) {
    toast.add({ title: 'Kit restored', description: 'Resumed your in-progress kit', color: 'info' })
    focusInput()
  } else {
    fetchAssemblies()
  }

  // Press "/" to jump focus to the barcode input (matches checkout / stock-take).
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== '/') return
    const tag = (event.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    event.preventDefault()
    focusInput()
  }

  window.addEventListener('keydown', handleKeydown)
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
})
</script>

<template>
  <div class="container mx-auto p-6 max-w-6xl">
    <div class="mb-6">
      <h1 class="text-2xl font-bold mb-1">
        Kit List
      </h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Pick a BOM, scan parts into a kit, then check everything out at once
      </p>
    </div>

    <!-- ============ ASSEMBLY PICKER (no kit loaded) ============ -->
    <div v-if="assemblyPk === null">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">
            Choose an assembly to kit
          </h2>
        </template>

        <UInput
          v-model="assemblySearch"
          placeholder="Search assemblies..."
          icon="i-lucide-search"
          size="lg"
          class="mb-4 w-full"
        />

        <div
          v-if="isLoadingAssemblies"
          class="text-center py-8 text-gray-500"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="w-5 h-5 animate-spin inline-block mr-2"
          />
          Loading assemblies...
        </div>

        <div
          v-else-if="filteredAssemblies.length === 0"
          class="text-center py-8 text-gray-500 text-sm"
        >
          No assemblies found.
        </div>

        <div
          v-else
          class="grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          <button
            v-for="assembly in filteredAssemblies"
            :key="assembly.pk"
            class="text-left px-4 py-3 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-300 transition-colors"
            @click="selectAssembly(assembly)"
          >
            <div class="font-medium">
              {{ assembly.name }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {{ assembly.IPN || 'No IPN' }}<span v-if="assembly.revision"> · Rev {{ assembly.revision }}</span>
            </div>
          </button>
        </div>
      </UCard>
    </div>

    <!-- ============ KIT WORKSPACE ============ -->
    <div v-else>
      <div
        v-if="isLoading"
        class="text-center py-12 text-gray-500"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="w-6 h-6 animate-spin inline-block mr-2"
        />
        Loading BOM...
      </div>

      <template v-else>
        <!-- Kit header -->
        <UCard class="mb-4 print:hidden">
          <div class="flex flex-col sm:flex-row sm:items-end gap-4">
            <div class="flex-1">
              <label class="block text-xs font-medium text-gray-500 mb-1">Kit name</label>
              <UInput
                v-model="kitName"
                size="lg"
                class="w-full"
                :disabled="completed"
              />
              <p class="text-xs text-gray-500 mt-1">
                {{ assemblyName }}
                <span class="font-mono">{{ assemblyIPN ? `(${assemblyIPN})` : '' }}</span>
              </p>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Build qty</label>
              <UInput
                :model-value="buildQty"
                type="number"
                :min="1"
                size="lg"
                class="w-24"
                :disabled="completed"
                @update:model-value="(v: string | number) => setBuildQty(Number(v))"
              />
            </div>
            <div class="flex gap-2">
              <UButton
                variant="outline"
                color="neutral"
                icon="i-lucide-arrow-left"
                @click="isDiscardConfirmOpen = true"
              >
                Change assembly
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Scan bar -->
        <UCard
          v-if="!completed"
          class="mb-4 print:hidden"
        >
          <div class="flex items-center gap-3 mb-3">
            <UInput
              ref="barcodeInputRef"
              v-model="barcodeInput"
              placeholder="Scan a part barcode..."
              icon="i-lucide-scan-barcode"
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
            <div class="text-right text-sm">
              <div class="text-gray-500">
                Scanned
              </div>
              <div class="font-semibold">
                {{ totalScanned }} / {{ totalRequired }}
              </div>
            </div>
          </div>

          <!-- Unmatched / error scans -->
          <div
            v-if="unmatchedScans.length > 0"
            class="space-y-2"
          >
            <div
              v-for="(u, index) in unmatchedScans"
              :key="`${u.barcode}-${u.scannedAt}`"
              class="flex items-center justify-between gap-2 p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm"
            >
              <div class="flex items-center gap-2 min-w-0">
                <UIcon
                  name="i-lucide-alert-circle"
                  class="w-4 h-4 text-red-500 shrink-0"
                />
                <span class="font-mono font-semibold shrink-0">{{ u.barcode }}</span>
                <span class="text-red-600 dark:text-red-400 truncate">{{ u.reason }}</span>
              </div>
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-x"
                @click="removeUnmatched(index)"
              />
            </div>
          </div>
        </UCard>

        <!-- Completed banner -->
        <div
          v-if="completed"
          class="mb-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-center gap-3 print:hidden"
        >
          <UIcon
            name="i-lucide-check-circle"
            class="w-6 h-6 text-green-600"
          />
          <div>
            <p class="font-semibold text-green-800 dark:text-green-300">
              Kit complete
            </p>
            <p class="text-sm text-green-700 dark:text-green-400">
              All items checked out. Copy or print the summary below.
            </p>
          </div>
        </div>

        <!-- Kit items table -->
        <UCard
          class="mb-4 print:hidden"
          :ui="{ body: 'p-0 sm:p-0' }"
        >
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700">
                  <th class="text-left px-3 py-3 font-semibold">
                    Component
                  </th>
                  <th class="text-right px-3 py-3 font-semibold">
                    Qty
                  </th>
                  <th class="text-right px-3 py-3 font-semibold">
                    In stock
                  </th>
                  <th class="text-left px-3 py-3 font-semibold">
                    Locations
                  </th>
                  <th class="text-left px-3 py-3 font-semibold">
                    Note
                  </th>
                  <th class="text-center px-3 py-3 font-semibold">
                    Status
                  </th>
                  <th class="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in items"
                  :key="item.id"
                  class="border-b border-gray-100 dark:border-gray-800 transition-all duration-300"
                  :class="rowClass(item)"
                >
                  <!-- Component -->
                  <td class="px-3 py-3">
                    <div class="flex items-center gap-3">
                      <img
                        v-if="item.thumbnail"
                        :src="resolveImageUrl(item.thumbnail)"
                        :alt="item.name"
                        class="w-9 h-9 object-cover rounded shrink-0"
                      >
                      <UIcon
                        v-else
                        name="i-lucide-package"
                        class="w-9 h-9 text-gray-400 shrink-0"
                      />
                      <div class="min-w-0">
                        <div class="font-medium truncate">
                          {{ item.name }}
                        </div>
                        <div class="text-xs text-gray-500 font-mono flex items-center gap-1">
                          {{ item.ipn || '—' }}
                          <span>·</span>
                          <button
                            class="inline-flex items-center gap-0.5 hover:text-primary"
                            :disabled="completed"
                            @click="openRevModal(item)"
                          >
                            Rev {{ item.targetRevision || '—' }}
                            <UIcon
                              v-if="!completed"
                              name="i-lucide-pencil"
                              class="w-3 h-3"
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>

                  <!-- Qty -->
                  <td class="px-3 py-3 text-right">
                    <UInput
                      :model-value="item.kitQty"
                      type="number"
                      :min="0"
                      size="xs"
                      class="w-16 ml-auto"
                      :disabled="completed || item.status === 'skipped'"
                      @update:model-value="(v: string | number) => updateKitQty(item.id, Number(v))"
                    />
                    <div class="text-xs text-gray-400 mt-0.5">
                      req {{ item.requiredQty }}
                    </div>
                  </td>

                  <!-- In stock -->
                  <td class="px-3 py-3 text-right">
                    <UIcon
                      v-if="item.resolving"
                      name="i-lucide-loader-2"
                      class="w-4 h-4 animate-spin text-gray-400 inline-block"
                    />
                    <UBadge
                      v-else
                      :color="item.inStock >= item.kitQty ? 'success' : 'error'"
                      variant="subtle"
                      size="sm"
                    >
                      {{ item.inStock }}
                    </UBadge>
                  </td>

                  <!-- Locations -->
                  <td class="px-3 py-3 max-w-56">
                    <div
                      v-if="item.resolving"
                      class="text-xs text-gray-400"
                    >
                      ...
                    </div>
                    <div
                      v-else-if="item.locations.length === 0"
                      class="text-xs text-gray-400"
                    >
                      None
                    </div>
                    <div
                      v-else
                      class="space-y-0.5"
                    >
                      <div
                        v-for="loc in item.locations"
                        :key="loc.stockItemPk"
                        class="text-xs flex items-center gap-1 flex-wrap"
                      >
                        <UIcon
                          name="i-lucide-map-pin"
                          class="w-3 h-3 text-gray-400 shrink-0"
                        />
                        <UTooltip :text="describeLocationCode(loc.locationName)">
                          <span class="font-mono whitespace-nowrap">{{ loc.locationName }}</span>
                        </UTooltip>
                        <span class="text-gray-400">×{{ loc.quantity }}</span>
                        <span
                          v-if="loc.batch"
                          class="text-gray-400"
                        >({{ loc.batch }})</span>
                      </div>
                    </div>
                  </td>

                  <!-- Note -->
                  <td class="px-3 py-3">
                    <UInput
                      v-if="item.status !== 'skipped'"
                      :model-value="item.note"
                      placeholder="Add note..."
                      size="xs"
                      class="w-40"
                      :disabled="completed"
                      @update:model-value="(v: string | number) => updateNote(item.id, String(v))"
                    />
                    <span
                      v-else
                      class="text-xs text-gray-500 italic"
                    >
                      Skipped: {{ item.skipReason }}
                    </span>
                    <p
                      v-if="item.errorMessage"
                      class="text-xs text-red-600 dark:text-red-400 mt-1"
                    >
                      {{ item.errorMessage }}
                    </p>
                    <!-- Scan chips -->
                    <div
                      v-if="item.scans.length > 0"
                      class="flex flex-wrap gap-1 mt-1"
                    >
                      <UBadge
                        v-for="(s, sIdx) in item.scans"
                        :key="`${s.barcode}-${sIdx}`"
                        :color="s.matchKind === 'exact' ? 'success' : 'warning'"
                        variant="subtle"
                        size="xs"
                        class="cursor-pointer"
                        :title="`${s.barcode} (rev ${s.revision || '—'}${s.batch ? ', batch ' + s.batch : ''})`"
                        @click="!completed && removeScan(item.id, sIdx)"
                      >
                        rev {{ s.revision || '—' }}
                        <UIcon
                          v-if="!completed"
                          name="i-lucide-x"
                          class="w-3 h-3 ml-0.5"
                        />
                      </UBadge>
                    </div>
                  </td>

                  <!-- Status -->
                  <td class="px-3 py-3 text-center">
                    <UBadge
                      :color="statusBadge(item).color"
                      variant="subtle"
                      size="sm"
                    >
                      {{ statusBadge(item).label }}
                    </UBadge>
                  </td>

                  <!-- Actions -->
                  <td class="px-2 py-3 text-center">
                    <UButton
                      v-if="!completed && item.status !== 'skipped'"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      icon="i-lucide-skip-forward"
                      title="Skip this part"
                      @click="openSkipModal(item)"
                    />
                    <UButton
                      v-else-if="!completed && item.status === 'skipped'"
                      size="xs"
                      variant="ghost"
                      color="primary"
                      icon="i-lucide-undo-2"
                      title="Un-skip"
                      @click="unskipItem(item.id)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>

        <!-- Action bar -->
        <div
          v-if="!completed"
          class="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden"
        >
          <div class="text-sm text-gray-500">
            <span v-if="blockingItems.length > 0">
              {{ blockingItems.length }} item(s) still need scanning or skipping
            </span>
            <span
              v-else
              class="text-green-600 dark:text-green-400 font-medium"
            >
              All items accounted for
            </span>
            <span
              v-if="hasRevMismatch"
              class="text-amber-600 dark:text-amber-400 ml-2"
            >
              · contains rev mismatches
            </span>
          </div>
          <UButton
            color="primary"
            size="lg"
            icon="i-lucide-check"
            :loading="isCompleting"
            :disabled="!canComplete || isCompleting"
            @click="isCompleteConfirmOpen = true"
          >
            Complete Kit & Check Out
          </UButton>
        </div>

        <!-- Summary (shown once completed, or on demand) -->
        <UCard v-if="completed">
          <template #header>
            <div class="flex items-center justify-between print:hidden">
              <h2 class="text-lg font-semibold">
                Kit Summary
              </h2>
              <div class="flex gap-2">
                <UButton
                  size="sm"
                  variant="outline"
                  icon="i-lucide-copy"
                  @click="copySummary"
                >
                  Copy Markdown
                </UButton>
                <UButton
                  size="sm"
                  variant="outline"
                  icon="i-lucide-printer"
                  @click="printSummary"
                >
                  Print
                </UButton>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-plus"
                  @click="handleDiscard"
                >
                  Start New Kit
                </UButton>
              </div>
            </div>
          </template>

          <pre class="text-xs whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900 p-4 rounded-md overflow-x-auto">{{ summaryMarkdown }}</pre>
        </UCard>
      </template>
    </div>

    <!-- ============ Revision override modal ============ -->
    <UModal v-model:open="isRevModalOpen">
      <template #content>
        <div class="p-6 max-w-md">
          <h3 class="text-lg font-bold mb-1">
            Override revision
          </h3>
          <p class="text-sm text-gray-500 mb-4">
            {{ revTargetItem?.name }} ({{ revTargetItem?.ipn }})
          </p>

          <!-- Available revisions on hand -->
          <label class="block text-xs font-medium text-gray-500 mb-1">Available revisions</label>
          <div
            v-if="isLoadingRevOptions"
            class="text-sm text-gray-400 py-2"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="w-4 h-4 animate-spin inline-block mr-1"
            />
            Loading revisions...
          </div>
          <div
            v-else-if="revOptions.length === 0"
            class="text-sm text-gray-400 py-2"
          >
            No other revisions found for this IPN. Enter one manually below.
          </div>
          <div
            v-else
            class="space-y-1 mb-4 max-h-48 overflow-y-auto"
          >
            <button
              v-for="option in revOptions"
              :key="option.partPk"
              class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-sm transition-colors"
              :class="revInput === option.revision
                ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'"
              @click="selectRevOption(option)"
            >
              <span class="font-medium">
                Rev {{ option.revision || '—' }}
              </span>
              <UBadge
                :color="option.inStock > 0 ? 'success' : 'neutral'"
                variant="subtle"
                size="sm"
              >
                {{ option.inStock }} in stock
              </UBadge>
            </button>
          </div>

          <label class="block text-xs font-medium text-gray-500 mb-1">Revision (manual override)</label>
          <UInput
            v-model="revInput"
            placeholder="e.g. A or 02"
            size="lg"
            class="w-full mb-4"
            @keyup.enter="applyRevOverride"
          />
          <div class="flex gap-2 justify-end">
            <UButton
              variant="outline"
              color="neutral"
              @click="isRevModalOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="isApplyingRev"
              @click="applyRevOverride"
            >
              Apply
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ============ Skip modal ============ -->
    <UModal v-model:open="isSkipModalOpen">
      <template #content>
        <div class="p-6 max-w-sm">
          <h3 class="text-lg font-bold mb-1">
            Skip part
          </h3>
          <p class="text-sm text-gray-500 mb-4">
            {{ skipTargetItem?.name }} will not be checked out. Record why.
          </p>
          <label class="block text-xs font-medium text-gray-500 mb-1">Reason</label>
          <UTextarea
            v-model="skipReasonInput"
            placeholder="e.g. out of stock, using existing inventory..."
            :rows="3"
            class="w-full mb-4"
            @keyup.enter="confirmSkip"
          />
          <div class="flex gap-2 justify-end">
            <UButton
              variant="outline"
              color="neutral"
              @click="isSkipModalOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="warning"
              icon="i-lucide-skip-forward"
              @click="confirmSkip"
            >
              Skip Part
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ============ Complete confirmation modal ============ -->
    <UModal v-model:open="isCompleteConfirmOpen">
      <template #content>
        <div class="p-6 max-w-md">
          <h3 class="text-lg font-bold mb-2">
            Complete kit "{{ kitName }}"?
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            This will remove stock for each non-skipped item in InvenTree. The kit
            name and your per-part notes are recorded as the removal reason. Items
            that fail will stay here so you can fix and retry.
          </p>
          <div class="flex gap-2 justify-end">
            <UButton
              variant="outline"
              color="neutral"
              @click="isCompleteConfirmOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              icon="i-lucide-check"
              :loading="isCompleting"
              @click="handleComplete"
            >
              Check Out Kit
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ============ Discard confirmation modal ============ -->
    <UModal v-model:open="isDiscardConfirmOpen">
      <template #content>
        <div class="p-6 max-w-sm">
          <h3 class="text-lg font-bold mb-2">
            Change assembly?
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            This clears the current kit, including any scans and notes. This can't be undone.
          </p>
          <div class="flex gap-2 justify-end">
            <UButton
              variant="outline"
              color="neutral"
              @click="isDiscardConfirmOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              icon="i-lucide-trash-2"
              @click="handleDiscard"
            >
              Discard Kit
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
@keyframes highlight-pulse {
  0%, 100% {
    background-color: rgba(59, 130, 246, 0.15);
  }
  50% {
    background-color: rgba(59, 130, 246, 0.35);
  }
}

.animate-highlight-pulse {
  animation: highlight-pulse 0.75s ease-in-out 2;
}

@media print {
  .print\:hidden {
    display: none !important;
  }
}
</style>
