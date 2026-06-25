<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { StockLocation } from '~/types/inventree'

const toast = useToast()
const config = useRuntimeConfig()

/**
 * Resolves a relative InvenTree image URL to an absolute URL
 * The API returns paths like /media/part_images/foo.png
 */
const resolveImageUrl = (url: string | undefined | null): string => {
  if (!url) return ''
  if (url.startsWith('http')) return url
  const baseUrl = (config.public.inventreeApiUrl as string || '').replace(/\/api\/?$/, '')
  return `${baseUrl}${url}`
}

// Initialize the stock taking log composable with the InventreeService
const inventreeService = useInventreeApi()
const {
  logEntries,
  isSubmitting,
  searchMode,
  addItem,
  updateCount,
  updateLocation,
  removeEntry,
  removeLastEntry,
  clearLog,
  applyStockTake,
  setSearchMode,
  loadFromStorage,
  isEmpty,
  hasErrors,
  entryCount,
  highlightedEntryId
} = useStockTakingLog(inventreeService)

// Stock locations for the location picker
const locations = ref<StockLocation[]>([])

const locationItems = computed(() =>
  locations.value.map(l => ({ label: l.name, value: l.pk }))
)

const getLocationName = (pk: number | null): string => {
  if (pk == null) return 'No location'
  return locations.value.find(l => l.pk === pk)?.name ?? `Location #${pk}`
}

/**
 * Handles location change for a log entry.
 */
const handleLocationUpdate = (entryId: string, newLocation: number | null) => {
  updateLocation(entryId, newLocation)
}

// Barcode input state
const barcodeInput = ref('')
const barcodeInputRef = ref<HTMLInputElement | null>(null)

/**
 * Handles barcode scan (Enter key press)
 * Adds item to log and clears input
 * @see Requirements 2.1, 2.6
 */
const handleScan = () => {
  if (!barcodeInput.value.trim()) return
  addItem(barcodeInput.value)
  barcodeInput.value = ''
  focusInput()
}

/**
 * Focuses the barcode input field
 * @see Requirements 2.1
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
 * Handles count update for a log entry
 * @see Requirements 4.4
 */
const handleCountUpdate = (entryId: string, newCount: number) => {
  if (newCount >= 0) {
    updateCount(entryId, newCount)
  }
}

/**
 * Handles removing a log entry
 * @see Requirements 8.1
 */
const handleRemoveEntry = (entryId: string) => {
  removeEntry(entryId)
  focusInput()
}

/**
 * Handles undo last entry action
 * @see Requirements 5.1, 5.2
 */
const handleUndoLast = () => {
  const removed = removeLastEntry()
  if (removed) {
    toast.add({
      title: 'Entry removed',
      description: `Removed: ${removed.barcode}`,
      color: 'warning'
    })
  }
  focusInput()
}

/**
 * Handles clear log action
 * @see Requirements 8.2
 */
const handleClearLog = () => {
  clearLog()
  toast.add({
    title: 'Log cleared',
    color: 'info'
  })
  focusInput()
}

/**
 * Handles apply stock take action
 * @see Requirements 7.5, 7.6, 7.7
 */
const handleApplyStockTake = async () => {
  if (isEmpty.value) {
    toast.add({ title: 'Log is empty', description: 'Scan items before applying', color: 'warning' })
    return
  }
  if (hasErrors.value) {
    toast.add({ title: 'Cannot apply', description: 'Remove error items before applying', color: 'error' })
    return
  }
  const result = await applyStockTake()
  if (result.success) {
    toast.add({ title: 'Stock take applied', description: result.message, color: 'success' })
  } else {
    toast.add({ title: 'Stock take failed', description: result.message, color: 'error' })
  }
  focusInput()
}

// Entry refs for scroll-to-highlight
const entryRefs = ref<Record<string, HTMLElement>>({})

const setEntryRef = (entryId: string, el: Element | ComponentPublicInstance | null) => {
  if (el instanceof HTMLElement) {
    entryRefs.value[entryId] = el
  }
}

// Watch for highlight changes to scroll to entry
// @see Requirements 3.1
watch(highlightedEntryId, (newId) => {
  if (newId) {
    nextTick(() => {
      const el = entryRefs.value[newId]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
    // Clear highlight after animation
    setTimeout(() => {
      highlightedEntryId.value = null
    }, 1500)
  }
})

// Restore log from localStorage and auto-focus input on page load
// @see Requirements 2.1, 6.2
onMounted(() => {
  loadFromStorage()
  focusInput()

  inventreeService.getLocations()
    .then((locs) => { locations.value = locs })
    .catch((e) => { console.error('Failed to load locations:', e) })
})

// Keyboard shortcut for undo (Escape key)
// @see Requirement 5.1
onMounted(() => {
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleUndoLast()
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
      <h1 class="text-2xl font-bold mb-1">
        Stock Taking
      </h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Scan items to verify and adjust stock counts
      </p>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">
              Stock Taking
            </h2>
            <UTooltip
              text="Scan items to verify and adjust stock counts. Submit all changes in bulk."
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
      </div>

      <USeparator class="mb-4" />

      <div class="flex items-center justify-between mb-3">
        <span class="text-sm text-gray-500">Log ({{ entryCount }})</span>
        <UBadge
          v-if="logEntries.length > 0"
          color="primary"
          size="sm"
        >
          {{ logEntries.length }} item(s)
        </UBadge>
      </div>

      <!-- Empty State -->
      <div
        v-if="logEntries.length === 0"
        class="text-center py-12 text-gray-500"
      >
        <UIcon
          name="i-lucide-clipboard-list"
          class="w-12 h-12 mx-auto mb-4 opacity-50"
        />
        <p class="text-lg">
          Log is empty
        </p>
        <p class="text-sm">
          Scan a barcode to add items
        </p>
      </div>

      <!-- Log Entries -->
      <div
        v-else
        class="space-y-3"
      >
        <div
          v-for="entry in logEntries"
          :key="entry.id"
          :ref="(el) => setEntryRef(entry.id, el)"
          class="flex items-center justify-between p-4 rounded-lg border transition-all duration-300"
          :class="{
            'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700': entry.status === 'loading',
            'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800': entry.status === 'loaded',
            'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800': entry.status === 'error',
            'animate-highlight-pulse': highlightedEntryId === entry.id
          }"
        >
          <!-- Part Info -->
          <div class="flex items-center gap-4 flex-1">
            <!-- Loading State -->
            <template v-if="entry.status === 'loading'">
              <UIcon
                name="i-lucide-loader-circle"
                class="w-6 h-6 animate-spin text-gray-400"
              />
              <div>
                <p class="font-mono font-semibold">
                  {{ entry.barcode }}
                </p>
                <p class="text-sm text-gray-500">
                  Loading...
                </p>
              </div>
            </template>

            <!-- Loaded State -->
            <template v-else-if="entry.status === 'loaded'">
              <img
                v-if="entry.part.thumbnail || entry.part.image"
                :src="resolveImageUrl(entry.part.thumbnail || entry.part.image)"
                :alt="entry.part.name"
                class="w-12 h-12 object-cover rounded"
              >
              <UIcon
                v-else
                name="i-lucide-package"
                class="w-12 h-12 text-gray-400"
              />
              <div class="flex-1">
                <p class="font-semibold">
                  {{ entry.part.name }}
                </p>
                <p class="text-sm text-gray-500">
                  System: {{ entry.systemCount }} | Barcode: {{ entry.barcode }}
                </p>
                <div class="flex items-center gap-1.5 mt-1">
                  <UIcon
                    name="i-lucide-map-pin"
                    class="w-3.5 h-3.5 text-gray-400 shrink-0"
                  />
                  <USelectMenu
                    :model-value="entry.confirmedLocation ?? undefined"
                    :items="locationItems"
                    value-key="value"
                    placeholder="No location"
                    :search-input="true"
                    size="xs"
                    class="w-44"
                    @update:model-value="(val: number | undefined) => handleLocationUpdate(entry.id, val ?? null)"
                  />
                  <UBadge
                    v-if="entry.confirmedLocation !== entry.systemLocation"
                    color="warning"
                    variant="subtle"
                    size="sm"
                  >
                    was {{ getLocationName(entry.systemLocation) }}
                  </UBadge>
                </div>
              </div>
            </template>

            <!-- Error State -->
            <template v-else-if="entry.status === 'error'">
              <UIcon
                name="i-lucide-alert-circle"
                class="w-6 h-6 text-red-500"
              />
              <div>
                <p class="font-mono font-semibold text-red-700 dark:text-red-400">
                  {{ entry.barcode }}
                </p>
                <p class="text-sm text-red-600 dark:text-red-400">
                  {{ entry.errorMessage }}
                </p>
              </div>
            </template>
          </div>

          <!-- Count and Actions -->
          <div class="flex items-center gap-3">
            <!-- Count Input (loaded entries only) -->
            <template v-if="entry.status === 'loaded'">
              <div class="text-right">
                <span class="text-xs text-gray-500 block">System: {{ entry.systemCount }}</span>
                <UInput
                  :key="`count-${entry.id}-${entry.status}-${entry.systemCount}`"
                  :model-value="entry.confirmedCount"
                  type="number"
                  min="0"
                  size="sm"
                  class="w-20"
                  @update:model-value="(val: string | number) => handleCountUpdate(entry.id, Number(val))"
                  @focus="($event.target as HTMLInputElement)?.select()"
                  @keyup.enter="focusInput"
                  @keydown.tab.prevent="focusInput"
                />
              </div>
            </template>
            <!-- Loading status -->
            <span
              v-else-if="entry.status === 'loading'"
              class="text-sm text-gray-400 w-20 text-center"
            >
              ...
            </span>
            <!-- Error status text -->
            <span
              v-else
              class="text-sm text-red-500 w-20 text-center"
            >
              Error
            </span>

            <!-- Remove Button -->
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              icon="i-lucide-trash-2"
              @click="handleRemoveEntry(entry.id)"
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
            @click="handleUndoLast"
          >
            Undo <UKbd
              value="Esc"
              size="sm"
            />
          </UButton>

          <UButton
            color="neutral"
            variant="outline"
            size="lg"
            icon="i-lucide-trash"
            @click="handleClearLog"
          >
            Clear Log
          </UButton>

          <UButton
            color="primary"
            size="lg"
            icon="i-lucide-check"
            :loading="isSubmitting"
            :disabled="hasErrors || isEmpty || isSubmitting"
            @click="handleApplyStockTake"
          >
            Apply Stock Take
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>

<style scoped>
@keyframes highlight-pulse {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5);
  }
  50% {
    opacity: 0.85;
    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
  }
}

.animate-highlight-pulse {
  animation: highlight-pulse 0.75s ease-in-out 2;
}
</style>
