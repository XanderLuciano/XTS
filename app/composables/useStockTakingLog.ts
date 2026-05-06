import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { StockTakeEntry, StockTakeResult, Part, PersistedStockTakeLog } from '~/types/inventree'
import { InventreeService } from '~/services/inventree.service'

/**
 * Interface for the stock taking log composable
 */
export interface UseStockTakingLog {
  // State
  logEntries: Ref<StockTakeEntry[]>
  isSubmitting: Ref<boolean>
  searchMode: Ref<'barcode' | 'part'>

  // Actions
  addItem: (barcode: string) => StockTakeEntry | null
  updateCount: (entryId: string, newCount: number) => boolean
  removeEntry: (entryId: string) => StockTakeEntry | null
  removeLastEntry: () => StockTakeEntry | null
  clearLog: () => void
  applyStockTake: () => Promise<StockTakeResult>
  setSearchMode: (mode: 'barcode' | 'part') => void
  highlightEntry: (entryId: string) => void
  loadFromStorage: () => void

  // Computed
  isEmpty: ComputedRef<boolean>
  hasErrors: ComputedRef<boolean>
  entryCount: ComputedRef<number>
  highlightedEntryId: Ref<string | null>

  // Internal state accessors (for testing)
  getBarcodeIndex: () => Map<string, string>
  getEntryOrder: () => string[]
}

/**
 * Generates a UUID v4 string
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Composable for managing stock taking log state
 * Handles log entries, barcode indexing, localStorage persistence, and bulk stock adjustment
 *
 * @param inventreeService - Optional InventreeService instance for barcode/part lookups and stock adjustments
 * @returns UseStockTakingLog interface with state and actions
 * @see Requirements 2.2, 3.1, 5.1
 */
export const useStockTakingLog = (inventreeService?: InventreeService): UseStockTakingLog => {
  // Reactive state for log entries
  const logEntries = ref<StockTakeEntry[]>([])

  // Submission in progress flag
  const isSubmitting = ref(false)

  // Search mode: 'barcode' uses InvenTree barcode API, 'part' uses part search
  const searchMode = ref<'barcode' | 'part'>('barcode')

  // Highlighted entry ID for duplicate scan scroll-to
  const highlightedEntryId = ref<string | null>(null)

  // Barcode index for duplicate detection (barcode -> entryId)
  // Requirement 3.1: Detect duplicate scans
  const barcodeIndex = new Map<string, string>()

  // Entry order stack for undo (remove-last) functionality
  // Requirement 5.1: Track order of entries for Escape key removal
  const entryOrder: string[] = []

  /**
   * Sets the search mode for part lookups
   * @param mode - 'barcode' for InvenTree barcode API, 'part' for part search
   */
  const setSearchMode = (mode: 'barcode' | 'part'): void => {
    searchMode.value = mode
  }

  const STORAGE_KEY = 'stock-taking-log'

  /**
   * Persist current log entries to localStorage.
   * Removes the key if the log is empty.
   * @see Requirements 6.1, 6.3
   */
  const saveToStorage = (): void => {
    if (typeof localStorage === 'undefined') return
    try {
      if (logEntries.value.length === 0) {
        localStorage.removeItem(STORAGE_KEY)
        return
      }
      const data: PersistedStockTakeLog = {
        entries: logEntries.value,
        savedAt: Date.now()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.warn('Failed to save stock taking log to localStorage:', e)
    }
  }

  // --- Implementations ---

  /**
   * Add an item to the stock taking log by barcode or part search.
   * Adds a loading entry immediately and resolves part/stock data in the background.
   * @see Requirements 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 4.1, 6.1
   */
  const addItem = (barcode: string): StockTakeEntry | null => {
    const trimmed = barcode.trim()
    if (!trimmed) return null

    // Check for duplicates
    const existingId = barcodeIndex.get(trimmed)
    if (existingId) {
      highlightedEntryId.value = existingId
      return null
    }

    // Create loading entry immediately
    const entry: StockTakeEntry = {
      id: generateUUID(),
      barcode: trimmed,
      part: {} as Part,
      stockItemPk: 0,
      systemCount: 0,
      confirmedCount: 0,
      status: 'loading',
      addedAt: Date.now()
    }
    logEntries.value.unshift(entry)
    barcodeIndex.set(trimmed, entry.id)
    entryOrder.push(entry.id)
    saveToStorage()

    // Resolve part and stock items in the background (fire-and-forget)
    resolveEntry(entry)

    return entry
  }

  /**
   * Background resolution of part and stock item data for a loading entry.
   */
  const resolveEntry = async (entry: StockTakeEntry): Promise<void> => {
    if (!inventreeService) return

    try {
      let part: Part | null = null

      if (searchMode.value === 'barcode') {
        part = await inventreeService.scanBarcode(entry.barcode)
      } else {
        const parts = await inventreeService.searchParts(entry.barcode)
        part = parts.length > 0 ? parts[0] : null
      }

      // Find the entry in the log (may have been removed while resolving)
      const current = logEntries.value.find(e => e.id === entry.id)
      if (!current) return

      if (!part) {
        current.status = 'error'
        current.errorMessage = searchMode.value === 'barcode'
          ? `Barcode not found: ${entry.barcode}`
          : `Part not found for: ${entry.barcode}`
        logEntries.value = [...logEntries.value]
        saveToStorage()
        return
      }

      const stockItems = await inventreeService.getStockItems(part.pk)

      // Re-check entry still exists
      const stillExists = logEntries.value.find(e => e.id === entry.id)
      if (!stillExists) return

      if (stockItems.length === 0) {
        stillExists.part = part
        stillExists.status = 'error'
        stillExists.errorMessage = `No stock items found for part: ${part.name}`
        logEntries.value = [...logEntries.value]
        saveToStorage()
        return
      }

      const firstStockItem = stockItems[0]
      stillExists.part = part
      stillExists.stockItemPk = firstStockItem.pk
      stillExists.systemCount = firstStockItem.quantity
      stillExists.confirmedCount = firstStockItem.quantity
      stillExists.status = 'loaded'
      logEntries.value = [...logEntries.value]
      saveToStorage()
    } catch (error: any) {
      const current = logEntries.value.find(e => e.id === entry.id)
      if (!current) return
      current.status = 'error'
      current.errorMessage = error?.message || String(error)
      logEntries.value = [...logEntries.value]
      saveToStorage()
    }
  }

  const updateCount = (entryId: string, newCount: number): boolean => {
    const entry = logEntries.value.find(e => e.id === entryId)
    if (!entry) return false
    if (newCount < 0 || !Number.isFinite(newCount)) return false
    entry.confirmedCount = newCount
    saveToStorage()
    return true
  }

  const removeEntry = (entryId: string): StockTakeEntry | null => {
    const index = logEntries.value.findIndex(e => e.id === entryId)
    if (index === -1) return null
    const [removed] = logEntries.value.splice(index, 1)
    barcodeIndex.delete(removed.barcode)
    const orderIndex = entryOrder.indexOf(entryId)
    if (orderIndex !== -1) entryOrder.splice(orderIndex, 1)
    saveToStorage()
    return removed
  }

  const removeLastEntry = (): StockTakeEntry | null => {
    if (entryOrder.length === 0) return null
    const lastId = entryOrder[entryOrder.length - 1]
    return removeEntry(lastId)
  }

  const clearLog = (): void => {
    logEntries.value = []
    barcodeIndex.clear()
    entryOrder.length = 0
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  const applyStockTake = async (): Promise<StockTakeResult> => {
      // Early return if log is empty
      if (logEntries.value.length === 0) {
        return {
          success: false,
          processedItems: 0,
          skippedItems: 0,
          failedItems: [],
          message: 'Log is empty'
        }
      }

      // Early return if log has error or loading entries
      const errorEntries = logEntries.value.filter(e => e.status === 'error')
      const loadingEntries = logEntries.value.filter(e => e.status === 'loading')
      if (errorEntries.length > 0) {
        return {
          success: false,
          processedItems: 0,
          skippedItems: 0,
          failedItems: [...errorEntries],
          message: 'Cannot apply with error entries'
        }
      }
      if (loadingEntries.length > 0) {
        return {
          success: false,
          processedItems: 0,
          skippedItems: 0,
          failedItems: [],
          message: 'Wait for all items to finish loading'
        }
      }

      isSubmitting.value = true
      let processedItems = 0
      let skippedItems = 0
      const failedItems: StockTakeEntry[] = []
      const succeededIds: string[] = []

      try {
        for (const entry of logEntries.value) {
          const delta = entry.confirmedCount - entry.systemCount

          if (delta === 0) {
            skippedItems++
            succeededIds.push(entry.id)
            continue
          }

          try {
            await inventreeService!.adjustStock({
              stockItemPk: entry.stockItemPk,
              currentQuantity: entry.systemCount,
              newQuantity: entry.confirmedCount,
              notes: 'Stock take adjustment via webapp'
            })
            processedItems++
            succeededIds.push(entry.id)
          } catch (error: any) {
            entry.status = 'error'
            entry.errorMessage = error?.message || String(error)
            failedItems.push(entry)
          }
        }

        if (failedItems.length === 0) {
          clearLog()
          return {
            success: true,
            processedItems,
            skippedItems,
            failedItems: [],
            message: `Successfully processed ${processedItems} item(s), skipped ${skippedItems}`
          }
        }

        // Partial failure: remove successful entries, keep failed ones
        for (const id of succeededIds) {
          removeEntry(id)
        }

        return {
          success: false,
          processedItems,
          skippedItems,
          failedItems: [...failedItems],
          message: `Partial failure: ${processedItems} succeeded, ${failedItems.length} failed`
        }
      } finally {
        isSubmitting.value = false
      }
    }


  const highlightEntry = (entryId: string): void => {
    highlightedEntryId.value = entryId
  }

  /**
   * Restore log entries from localStorage.
   * Rebuilds barcodeIndex and entryOrder from the loaded entries.
   * Handles corrupted/missing data gracefully.
   * @see Requirements 6.2
   */
  const loadFromStorage = (): void => {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const data: PersistedStockTakeLog = JSON.parse(raw)
      if (!data || !Array.isArray(data.entries)) {
        console.warn('Invalid stock taking log data in localStorage, starting fresh')
        return
      }

      logEntries.value = data.entries

      // Rebuild barcodeIndex
      barcodeIndex.clear()
      for (const entry of data.entries) {
        barcodeIndex.set(entry.barcode, entry.id)
      }

      // Rebuild entryOrder (sorted by addedAt)
      entryOrder.length = 0
      const sorted = [...data.entries].sort((a, b) => a.addedAt - b.addedAt)
      for (const entry of sorted) {
        entryOrder.push(entry.id)
      }
    } catch (e) {
      console.warn('Failed to load stock taking log from localStorage:', e)
    }
  }

  // Computed properties

  /**
   * Whether the log is empty
   */
  const isEmpty = computed(() => logEntries.value.length === 0)

  /**
   * Whether any log entry has an error or loading status
   * @see Requirement 8.4
   */
  const hasErrors = computed(() =>
    logEntries.value.some(entry => entry.status === 'error' || entry.status === 'loading')
  )

  /**
   * Total number of entries in the log
   */
  const entryCount = computed(() => logEntries.value.length)

  // Internal state accessors for testing
  const getBarcodeIndex = () => barcodeIndex
  const getEntryOrder = () => [...entryOrder]

  return {
    // State
    logEntries,
    isSubmitting,
    searchMode,

    // Actions
    addItem,
    updateCount,
    removeEntry,
    removeLastEntry,
    clearLog,
    applyStockTake,
    setSearchMode,
    highlightEntry,
    loadFromStorage,

    // Computed
    isEmpty,
    hasErrors,
    entryCount,
    highlightedEntryId,

    // Internal state accessors (for testing)
    getBarcodeIndex,
    getEntryOrder
  }
}
