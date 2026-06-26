import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Part, StockLocation } from '~/types/inventree'
import type {
  KitItem,
  KitScanRecord,
  UnmatchedScan,
  KitItemLocation,
  KitCompletionResult,
  PersistedKitDraft
} from '~/types/kit'
import type { InventreeService } from '~/services/inventree.service'
import { extractApiError } from '~/utils/apiError'
import { buildCheckoutReason } from '~/utils/kitSummary'

const STORAGE_KEY = 'kit-list-draft'
const SEQ_KEY = 'kit-list-seq'
const DRAFT_VERSION = 1

/** Generates a UUID v4 string (matches the pattern used elsewhere in the app). */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export interface UseKitList {
  // State
  assemblyPk: Ref<number | null>
  assemblyName: Ref<string>
  assemblyIPN: Ref<string>
  kitName: Ref<string>
  buildQty: Ref<number>
  items: Ref<KitItem[]>
  unmatchedScans: Ref<UnmatchedScan[]>
  isLoading: Ref<boolean>
  isCompleting: Ref<boolean>
  completed: Ref<boolean>
  highlightedItemId: Ref<string | null>

  // Actions
  loadKit: (assembly: Part) => Promise<void>
  setBuildQty: (qty: number) => void
  scan: (barcode: string) => Promise<void>
  updateNote: (itemId: string, note: string) => void
  updateKitQty: (itemId: string, qty: number) => void
  overrideRevision: (itemId: string, revision: string) => Promise<boolean>
  skipItem: (itemId: string, reason: string) => void
  unskipItem: (itemId: string) => void
  removeScan: (itemId: string, scanIndex: number) => void
  removeUnmatched: (index: number) => void
  completeKit: () => Promise<KitCompletionResult>
  clearKit: () => void
  loadFromStorage: () => boolean

  // Computed
  isEmpty: ComputedRef<boolean>
  totalRequired: ComputedRef<number>
  totalScanned: ComputedRef<number>
  blockingItems: ComputedRef<KitItem[]>
  canComplete: ComputedRef<boolean>
  hasRevMismatch: ComputedRef<boolean>
}

export const useKitList = (inventreeService?: InventreeService): UseKitList => {
  const assemblyPk = ref<number | null>(null)
  const assemblyName = ref('')
  const assemblyIPN = ref('')
  const kitName = ref('')
  const buildQty = ref(1)
  const items = ref<KitItem[]>([])
  const unmatchedScans = ref<UnmatchedScan[]>([])
  const isLoading = ref(false)
  const isCompleting = ref(false)
  const completed = ref(false)
  const highlightedItemId = ref<string | null>(null)

  // Cache of stock locations (pk -> name) so we can label stock without
  // re-fetching on every item.
  const locationCache = ref<Map<number, string>>(new Map())

  // --- Persistence ---------------------------------------------------------

  const saveToStorage = (): void => {
    if (typeof localStorage === 'undefined') return
    try {
      if (assemblyPk.value === null && items.value.length === 0) {
        localStorage.removeItem(STORAGE_KEY)
        return
      }
      const draft: PersistedKitDraft = {
        version: DRAFT_VERSION,
        assemblyPk: assemblyPk.value,
        assemblyName: assemblyName.value,
        assemblyIPN: assemblyIPN.value,
        kitName: kitName.value,
        buildQty: buildQty.value,
        items: items.value,
        unmatchedScans: unmatchedScans.value,
        completed: completed.value,
        savedAt: Date.now()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    } catch (e) {
      console.warn('Failed to save kit draft to localStorage:', e)
    }
  }

  const loadFromStorage = (): boolean => {
    if (typeof localStorage === 'undefined') return false
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const draft = JSON.parse(raw) as PersistedKitDraft
      if (!draft || draft.version !== DRAFT_VERSION || !Array.isArray(draft.items)) {
        return false
      }
      assemblyPk.value = draft.assemblyPk
      assemblyName.value = draft.assemblyName
      assemblyIPN.value = draft.assemblyIPN
      kitName.value = draft.kitName
      buildQty.value = draft.buildQty
      items.value = draft.items
      unmatchedScans.value = draft.unmatchedScans ?? []
      completed.value = draft.completed ?? false
      return items.value.length > 0
    } catch (e) {
      console.warn('Failed to load kit draft from localStorage:', e)
      return false
    }
  }

  // --- Kit name suggestion -------------------------------------------------

  /**
   * Suggest a kit name of the form BASE-### where BASE is the assembly IPN
   * (or name) and ### is a zero-padded incrementing counter persisted locally.
   */
  const suggestKitName = (base: string): string => {
    const clean = (base || 'KIT').trim().replace(/\s+/g, '-').toUpperCase()
    let seq = 1
    if (typeof localStorage !== 'undefined') {
      try {
        seq = Number(localStorage.getItem(SEQ_KEY) || '0') + 1
      } catch { /* ignore */ }
    }
    return `${clean}-${String(seq).padStart(3, '0')}`
  }

  /** Consume (increment) the kit sequence counter once a kit is committed. */
  const bumpSeqCounter = (): void => {
    if (typeof localStorage === 'undefined') return
    try {
      const seq = Number(localStorage.getItem(SEQ_KEY) || '0') + 1
      localStorage.setItem(SEQ_KEY, String(seq))
    } catch { /* ignore */ }
  }

  // --- Stock / location resolution -----------------------------------------

  const ensureLocations = async (): Promise<void> => {
    if (!inventreeService) return
    if (locationCache.value.size > 0) return
    try {
      const locs: StockLocation[] = await inventreeService.getLocations()
      const map = new Map<number, string>()
      for (const l of locs) map.set(l.pk, l.name)
      locationCache.value = map
    } catch (e) {
      console.warn('Failed to load locations for kit list:', e)
    }
  }

  const locationName = (pk: number | null): string => {
    if (pk == null) return 'No location'
    return locationCache.value.get(pk) ?? `Location #${pk}`
  }

  /**
   * Resolve current stock quantity and locations for a kit item's target part.
   */
  const resolveItemStock = async (item: KitItem): Promise<void> => {
    if (!inventreeService) {
      item.resolving = false
      return
    }
    item.resolving = true
    items.value = [...items.value]
    try {
      await ensureLocations()
      const stockItems = await inventreeService.getStockItems(item.partPk)
      const locations: KitItemLocation[] = stockItems.map(si => ({
        stockItemPk: si.pk,
        locationPk: si.location,
        locationName: locationName(si.location),
        quantity: si.quantity,
        batch: si.batch
      }))
      const current = items.value.find(i => i.id === item.id)
      if (!current) return
      current.locations = locations
      current.inStock = stockItems.reduce((sum, si) => sum + si.quantity, 0)
      current.resolving = false
      items.value = [...items.value]
      saveToStorage()
    } catch (e) {
      const current = items.value.find(i => i.id === item.id)
      if (current) {
        current.resolving = false
        current.errorMessage = extractApiError(e, 'Failed to load stock')
        items.value = [...items.value]
      }
    }
  }

  // --- Status recomputation ------------------------------------------------

  /**
   * Recompute an item's status from its scans and quantities.
   * Skipped items are left untouched (status is managed by skip/unskip).
   */
  const recomputeStatus = (item: KitItem): void => {
    if (item.status === 'skipped') return
    const scannedCount = item.scans.length
    const hasMismatch = item.scans.some(s => s.matchKind === 'rev-mismatch')
    if (scannedCount === 0) {
      item.status = 'pending'
    } else if (scannedCount >= item.kitQty) {
      item.status = hasMismatch ? 'rev-mismatch' : 'complete'
    } else {
      item.status = 'partial'
    }
  }

  // --- Loading a kit -------------------------------------------------------

  const loadKit = async (assembly: Part): Promise<void> => {
    if (!inventreeService) return
    isLoading.value = true
    completed.value = false
    unmatchedScans.value = []
    try {
      const bomItems = await inventreeService.getBomItems(assembly.pk)
      assemblyPk.value = assembly.pk
      assemblyName.value = assembly.name
      assemblyIPN.value = assembly.IPN || ''
      kitName.value = suggestKitName(assembly.IPN || assembly.name)
      buildQty.value = 1

      items.value = bomItems.map((bi) => {
        const perBuildQty = bi.quantity
        const requiredQty = perBuildQty * buildQty.value
        return {
          id: generateUUID(),
          bomItemPk: bi.pk,
          partPk: bi.sub_part,
          ipn: bi.sub_part_detail?.IPN || '',
          name: bi.sub_part_detail?.name || `Part #${bi.sub_part}`,
          targetRevision: '',
          perBuildQty,
          requiredQty,
          kitQty: requiredQty,
          inStock: bi.sub_part_detail?.in_stock ?? 0,
          locations: [],
          resolving: true,
          scans: [],
          note: '',
          status: 'pending',
          thumbnail: bi.sub_part_detail?.thumbnail ?? null
        } satisfies KitItem
      })
      saveToStorage()

      // Resolve target revision + stock/locations for each item in the
      // background so the table renders immediately.
      for (const item of items.value) {
        void resolvePartMeta(item)
      }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Fill in the target revision (from the part record) then resolve stock.
   */
  const resolvePartMeta = async (item: KitItem): Promise<void> => {
    if (!inventreeService) return
    try {
      const part = await inventreeService.getPartById(item.partPk)
      const current = items.value.find(i => i.id === item.id)
      if (current) {
        current.targetRevision = part.revision || ''
        if (!current.ipn) current.ipn = part.IPN || ''
        items.value = [...items.value]
      }
    } catch {
      // Non-fatal — revision just stays blank.
    }
    const current = items.value.find(i => i.id === item.id)
    if (current) await resolveItemStock(current)
  }

  const setBuildQty = (qty: number): void => {
    if (!Number.isFinite(qty) || qty < 1) return
    buildQty.value = Math.floor(qty)
    for (const item of items.value) {
      item.requiredQty = item.perBuildQty * buildQty.value
      // Only auto-update kitQty if the user hasn't scanned anything yet,
      // to avoid clobbering an intentional override mid-kit.
      if (item.scans.length === 0 && item.status !== 'skipped') {
        item.kitQty = item.requiredQty
      }
      recomputeStatus(item)
    }
    items.value = [...items.value]
    saveToStorage()
  }

  // --- Scanning ------------------------------------------------------------

  const scan = async (barcode: string): Promise<void> => {
    const trimmed = barcode.trim()
    if (!trimmed || !inventreeService) return

    let part: Part | null = null
    let stockItemPk: number | null = null
    let batch: string | null = null
    try {
      const result = await inventreeService.scanBarcodeWithStock(trimmed)
      part = result.part
      if (result.stockItem) {
        stockItemPk = result.stockItem.pk
        batch = result.stockItem.batch
      }
    } catch (e) {
      unmatchedScans.value.unshift({
        barcode: trimmed,
        ipn: '',
        revision: '',
        reason: extractApiError(e, 'Lookup failed'),
        scannedAt: Date.now()
      })
      saveToStorage()
      return
    }

    if (!part) {
      unmatchedScans.value.unshift({
        barcode: trimmed,
        ipn: '',
        revision: '',
        reason: 'Barcode not found in InvenTree',
        scannedAt: Date.now()
      })
      saveToStorage()
      return
    }

    // Match against the kit by IPN.
    const item = items.value.find(i => i.ipn && i.ipn === part!.IPN)
    if (!item) {
      unmatchedScans.value.unshift({
        barcode: trimmed,
        ipn: part.IPN || '',
        revision: part.revision || '',
        reason: `Part "${part.name}" (${part.IPN || 'no IPN'}) is not in this BOM`,
        scannedAt: Date.now()
      })
      saveToStorage()
      return
    }

    // Duplicate barcode on the same item — highlight, don't double-count.
    if (item.scans.some(s => s.barcode === trimmed)) {
      highlightedItemId.value = item.id
      return
    }

    const matchKind: KitScanRecord['matchKind']
      = (part.revision || '') === item.targetRevision ? 'exact' : 'rev-mismatch'

    item.scans.push({
      barcode: trimmed,
      ipn: part.IPN || '',
      revision: part.revision || '',
      batch,
      stockItemPk,
      matchKind,
      scannedAt: Date.now()
    })
    recomputeStatus(item)
    highlightedItemId.value = item.id
    items.value = [...items.value]
    saveToStorage()
  }

  // --- Item mutations ------------------------------------------------------

  const updateNote = (itemId: string, note: string): void => {
    const item = items.value.find(i => i.id === itemId)
    if (!item) return
    item.note = note
    saveToStorage()
  }

  const updateKitQty = (itemId: string, qty: number): void => {
    const item = items.value.find(i => i.id === itemId)
    if (!item) return
    if (!Number.isFinite(qty) || qty < 0) return
    item.kitQty = Math.floor(qty)
    recomputeStatus(item)
    items.value = [...items.value]
    saveToStorage()
  }

  const overrideRevision = async (itemId: string, revision: string): Promise<boolean> => {
    const item = items.value.find(i => i.id === itemId)
    if (!item || !inventreeService) return false
    const sanitized = sanitizeRevision(revision)
    try {
      const part = await inventreeService.findPartByIPNAndRevision(item.ipn, sanitized)
      if (!part) {
        item.errorMessage = `No part found for ${item.ipn} rev ${sanitized}`
        items.value = [...items.value]
        return false
      }
      item.partPk = part.pk
      item.targetRevision = part.revision || sanitized
      item.name = part.name
      item.errorMessage = undefined
      // Re-evaluate existing scans against the new target revision.
      for (const s of item.scans) {
        s.matchKind = s.revision === item.targetRevision ? 'exact' : 'rev-mismatch'
      }
      recomputeStatus(item)
      items.value = [...items.value]
      await resolveItemStock(item)
      return true
    } catch (e) {
      item.errorMessage = extractApiError(e, 'Failed to override revision')
      items.value = [...items.value]
      return false
    }
  }

  const skipItem = (itemId: string, reason: string): void => {
    const item = items.value.find(i => i.id === itemId)
    if (!item) return
    item.status = 'skipped'
    item.skipReason = reason.trim() || 'No reason given'
    items.value = [...items.value]
    saveToStorage()
  }

  const unskipItem = (itemId: string): void => {
    const item = items.value.find(i => i.id === itemId)
    if (!item) return
    item.skipReason = undefined
    item.status = 'pending'
    recomputeStatus(item)
    items.value = [...items.value]
    saveToStorage()
  }

  const removeScan = (itemId: string, scanIndex: number): void => {
    const item = items.value.find(i => i.id === itemId)
    if (!item) return
    if (scanIndex < 0 || scanIndex >= item.scans.length) return
    item.scans.splice(scanIndex, 1)
    recomputeStatus(item)
    items.value = [...items.value]
    saveToStorage()
  }

  const removeUnmatched = (index: number): void => {
    if (index < 0 || index >= unmatchedScans.value.length) return
    unmatchedScans.value.splice(index, 1)
    saveToStorage()
  }

  // --- Completion ----------------------------------------------------------

  /**
   * Check out (remove stock for) each non-skipped kit item, distributing the
   * removal across the part's stock items. Records the per-part note plus the
   * kit name as the removal reason. Successful items are marked complete and
   * failed items retain a detailed error message for retry.
   */
  const completeKit = async (): Promise<KitCompletionResult> => {
    if (items.value.length === 0) {
      return { success: false, processedItems: 0, skippedItems: 0, failedItems: [], message: 'Kit is empty' }
    }
    if (!inventreeService) {
      return { success: false, processedItems: 0, skippedItems: 0, failedItems: [], message: 'No InvenTree connection' }
    }
    if (blockingItems.value.length > 0) {
      return {
        success: false,
        processedItems: 0,
        skippedItems: 0,
        failedItems: [...blockingItems.value],
        message: `${blockingItems.value.length} item(s) are not complete or skipped`
      }
    }

    isCompleting.value = true
    let processedItems = 0
    let skippedItems = 0
    const failedItems: KitItem[] = []

    try {
      for (const item of items.value) {
        if (item.status === 'skipped') {
          skippedItems++
          continue
        }

        const reason = buildCheckoutReason(item.note, kitName.value)

        try {
          const stockItems = await inventreeService.getStockItems(item.partPk)
          if (stockItems.length === 0) {
            item.status = 'error'
            item.errorMessage = 'No stock items found to check out'
            failedItems.push(item)
            continue
          }

          // Verify we have enough stock before mutating anything.
          const available = stockItems.reduce((sum, si) => sum + si.quantity, 0)
          if (available < item.kitQty) {
            item.status = 'error'
            item.errorMessage = `Insufficient stock: need ${item.kitQty}, only ${available} available`
            failedItems.push(item)
            continue
          }

          let remaining = item.kitQty
          let removed = 0
          const sorted = [...stockItems].sort((a, b) => b.quantity - a.quantity)
          for (const si of sorted) {
            if (remaining <= 0) break
            if (si.quantity <= 0) continue
            const take = Math.min(remaining, si.quantity)
            await inventreeService.removeStock(si.pk, { quantity: take, notes: reason })
            removed += take
            remaining -= take
          }

          if (remaining > 0) {
            item.status = 'error'
            item.errorMessage = `Only removed ${removed} of ${item.kitQty} units before running out of stock`
            failedItems.push(item)
            continue
          }

          item.status = 'complete'
          item.errorMessage = undefined
          processedItems++
        } catch (e) {
          item.status = 'error'
          item.errorMessage = extractApiError(e, 'Failed to check out item')
          failedItems.push(item)
        }
      }

      items.value = [...items.value]

      if (failedItems.length === 0) {
        completed.value = true
        bumpSeqCounter()
        saveToStorage()
        return {
          success: true,
          processedItems,
          skippedItems,
          failedItems: [],
          message: `Kit complete: checked out ${processedItems} item(s), skipped ${skippedItems}`
        }
      }

      saveToStorage()
      return {
        success: false,
        processedItems,
        skippedItems,
        failedItems: [...failedItems],
        message: `Partial completion: ${processedItems} checked out, ${failedItems.length} failed. Fix the errors and retry.`
      }
    } finally {
      isCompleting.value = false
    }
  }

  const clearKit = (): void => {
    assemblyPk.value = null
    assemblyName.value = ''
    assemblyIPN.value = ''
    kitName.value = ''
    buildQty.value = 1
    items.value = []
    unmatchedScans.value = []
    completed.value = false
    highlightedItemId.value = null
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  // --- Computed ------------------------------------------------------------

  const isEmpty = computed(() => items.value.length === 0)
  const totalRequired = computed(() =>
    items.value.filter(i => i.status !== 'skipped').reduce((sum, i) => sum + i.kitQty, 0)
  )
  const totalScanned = computed(() =>
    items.value.reduce((sum, i) => sum + i.scans.length, 0)
  )

  /** Items that block completion: not skipped and not yet complete/rev-mismatch. */
  const blockingItems = computed(() =>
    items.value.filter(i =>
      i.status !== 'skipped' && i.status !== 'complete' && i.status !== 'rev-mismatch'
    )
  )

  const canComplete = computed(() =>
    items.value.length > 0 && blockingItems.value.length === 0 && !completed.value
  )

  const hasRevMismatch = computed(() =>
    items.value.some(i => i.status === 'rev-mismatch')
  )

  return {
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
    skipItem,
    unskipItem,
    removeScan,
    removeUnmatched,
    completeKit,
    clearKit,
    loadFromStorage,

    isEmpty,
    totalRequired,
    totalScanned,
    blockingItems,
    canComplete,
    hasRevMismatch
  }
}
