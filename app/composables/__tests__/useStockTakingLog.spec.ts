import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStockTakingLog } from '../useStockTakingLog'
import { InventreeService } from '~/services/inventree.service'
import type { Part, StockItem } from '~/types/inventree'

import fc from 'fast-check'

/** Flush all pending microtasks so fire-and-forget resolveEntry() completes */
const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0))

/**
 * Helper to create a mock InventreeService with controllable responses
 */
function createMockInventreeService() {
  const mockApi = vi.fn()
  const service = new InventreeService(mockApi)

  // Spy on the methods we care about
  const scanBarcode = vi.spyOn(service, 'scanBarcode')
  const searchParts = vi.spyOn(service, 'searchParts')
  const getStockItems = vi.spyOn(service, 'getStockItems')

  return { service, scanBarcode, searchParts, getStockItems }
}

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    pk: 1,
    name: 'Test Part',
    description: 'A test part',
    IPN: 'IPN-001',
    revision: '',
    category: null,
    active: true,
    virtual: false,
    component: false,
    assembly: false,
    purchaseable: false,
    salable: false,
    trackable: false,
    in_stock: 10,
    link: '',
    image: null,
    thumbnail: null,
    ...overrides
  }
}

function makeStockItem(overrides: Partial<StockItem> = {}): StockItem {
  return {
    pk: 100,
    part: 1,
    quantity: 10,
    location: null,
    serial: null,
    batch: null,
    barcode_hash: '',
    notes: '',
    ...overrides
  }
}

describe('useStockTakingLog — addItem', () => {
  let mockService: ReturnType<typeof createMockInventreeService>

  beforeEach(() => {
    mockService = createMockInventreeService()
  })

  it('returns null for empty or whitespace-only barcode', async () => {
    const log = useStockTakingLog(mockService.service)
    expect(await log.addItem('')).toBeNull()
    expect(await log.addItem('   ')).toBeNull()
    expect(log.logEntries.value).toHaveLength(0)
  })

  it('trims barcode before processing', async () => {
    const part = makePart()
    const stockItem = makeStockItem()
    mockService.scanBarcode.mockResolvedValue(part)
    mockService.getStockItems.mockResolvedValue([stockItem])

    const log = useStockTakingLog(mockService.service)
    const entry = log.addItem('  ABC123  ')
    await flushPromises()

    expect(entry).not.toBeNull()
    expect(entry!.barcode).toBe('ABC123')
  })

  it('creates a loaded entry in barcode mode with correct data', async () => {
    const part = makePart({ pk: 5, name: 'Widget' })
    const stockItem = makeStockItem({ pk: 200, quantity: 42 })
    mockService.scanBarcode.mockResolvedValue(part)
    mockService.getStockItems.mockResolvedValue([stockItem])

    const log = useStockTakingLog(mockService.service)
    const entry = log.addItem('BARCODE-1')
    await flushPromises()

    expect(entry).not.toBeNull()
    expect(entry!.status).toBe('loaded')
    expect(entry!.part).toEqual(part)
    expect(entry!.stockItemPk).toBe(200)
    expect(entry!.systemCount).toBe(42)
    expect(entry!.confirmedCount).toBe(42)
    expect(entry!.barcode).toBe('BARCODE-1')
    expect(entry!.id).toBeTruthy()
    expect(entry!.addedAt).toBeGreaterThan(0)

    expect(log.logEntries.value).toHaveLength(1)
    expect(log.getBarcodeIndex().get('BARCODE-1')).toBe(entry!.id)
    expect(log.getEntryOrder()).toContain(entry!.id)
  })

  it('creates a loaded entry in part search mode using first result', async () => {
    const part1 = makePart({ pk: 10, name: 'First Part' })
    const part2 = makePart({ pk: 11, name: 'Second Part' })
    const stockItem = makeStockItem({ pk: 300, quantity: 7 })
    mockService.searchParts.mockResolvedValue([part1, part2])
    mockService.getStockItems.mockResolvedValue([stockItem])

    const log = useStockTakingLog(mockService.service)
    log.setSearchMode('part')
    const entry = log.addItem('widget')
    await flushPromises()

    expect(mockService.searchParts).toHaveBeenCalledWith('widget')
    expect(entry!.part).toEqual(part1)
    expect(entry!.stockItemPk).toBe(300)
    expect(entry!.systemCount).toBe(7)
    expect(entry!.status).toBe('loaded')
  })

  it('detects duplicate barcode and sets highlightedEntryId instead of adding', async () => {
    const part = makePart()
    const stockItem = makeStockItem()
    mockService.scanBarcode.mockResolvedValue(part)
    mockService.getStockItems.mockResolvedValue([stockItem])

    const log = useStockTakingLog(mockService.service)
    const first = log.addItem('DUP-CODE')
    await flushPromises()
    expect(first).not.toBeNull()
    expect(log.logEntries.value).toHaveLength(1)

    // Scan same barcode again
    const second = log.addItem('DUP-CODE')
    expect(second).toBeNull()
    expect(log.logEntries.value).toHaveLength(1)
    expect(log.highlightedEntryId.value).toBe(first!.id)
  })

  it('creates error entry when barcode not found', async () => {
    mockService.scanBarcode.mockResolvedValue(null)

    const log = useStockTakingLog(mockService.service)
    const entry = log.addItem('UNKNOWN')
    await flushPromises()

    expect(entry).not.toBeNull()
    expect(entry!.status).toBe('error')
    expect(entry!.errorMessage).toBe('Barcode not found: UNKNOWN')
    expect(log.logEntries.value).toHaveLength(1)
    expect(log.getBarcodeIndex().has('UNKNOWN')).toBe(true)
  })

  it('creates error entry when part search returns no results', async () => {
    mockService.searchParts.mockResolvedValue([])

    const log = useStockTakingLog(mockService.service)
    log.setSearchMode('part')
    const entry = log.addItem('nonexistent')
    await flushPromises()

    expect(entry!.status).toBe('error')
    expect(entry!.errorMessage).toBe('Part not found for: nonexistent')
  })

  it('creates error entry when part has no stock items', async () => {
    const part = makePart({ pk: 99, name: 'Empty Part' })
    mockService.scanBarcode.mockResolvedValue(part)
    mockService.getStockItems.mockResolvedValue([])

    const log = useStockTakingLog(mockService.service)
    const entry = log.addItem('NO-STOCK')
    await flushPromises()

    expect(entry!.status).toBe('error')
    expect(entry!.errorMessage).toBe('No stock items found for part: Empty Part')
    expect(entry!.part).toEqual(part)
  })

  it('creates error entry on network failure', async () => {
    mockService.scanBarcode.mockRejectedValue(new Error('Network timeout'))

    const log = useStockTakingLog(mockService.service)
    const entry = log.addItem('NET-FAIL')
    await flushPromises()

    expect(entry!.status).toBe('error')
    expect(entry!.errorMessage).toBe('Network timeout')
    expect(log.logEntries.value).toHaveLength(1)
    expect(log.getBarcodeIndex().has('NET-FAIL')).toBe(true)
  })

  it('error entries are added to barcodeIndex and entryOrder', async () => {
    mockService.scanBarcode.mockResolvedValue(null)

    const log = useStockTakingLog(mockService.service)
    const entry = log.addItem('ERR-CODE')
    await flushPromises()

    expect(log.getBarcodeIndex().get('ERR-CODE')).toBe(entry!.id)
    expect(log.getEntryOrder()).toContain(entry!.id)
  })

  it('uses first stock item when multiple stock items exist', async () => {
    const part = makePart()
    const stockItem1 = makeStockItem({ pk: 501, quantity: 15 })
    const stockItem2 = makeStockItem({ pk: 502, quantity: 25 })
    mockService.scanBarcode.mockResolvedValue(part)
    mockService.getStockItems.mockResolvedValue([stockItem1, stockItem2])

    const log = useStockTakingLog(mockService.service)
    const entry = log.addItem('MULTI-STOCK')
    await flushPromises()

    expect(entry!.stockItemPk).toBe(501)
    expect(entry!.systemCount).toBe(15)
    expect(entry!.confirmedCount).toBe(15)
  })
})

describe('useStockTakingLog — updateCount', () => {
  let mockService: ReturnType<typeof createMockInventreeService>

  beforeEach(() => {
    mockService = createMockInventreeService()
  })

  async function addLoadedEntry(log: ReturnType<typeof useStockTakingLog>, barcode = 'BC-1') {
    const part = makePart()
    const stockItem = makeStockItem({ pk: 100, quantity: 10 })
    mockService.scanBarcode.mockResolvedValue(part)
    mockService.getStockItems.mockResolvedValue([stockItem])
    const entry = log.addItem(barcode)
    await flushPromises()
    return entry!
  }

  it('updates confirmedCount and returns true for valid entry and count', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log)

    expect(log.updateCount(entry.id, 5)).toBe(true)
    expect(log.logEntries.value[0]!.confirmedCount).toBe(5)
  })

  it('returns false for non-existent entry ID', () => {
    const log = useStockTakingLog(mockService.service)
    expect(log.updateCount('non-existent-id', 5)).toBe(false)
  })

  it('rejects negative count', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log)

    expect(log.updateCount(entry.id, -1)).toBe(false)
    expect(log.logEntries.value[0]!.confirmedCount).toBe(10)
  })

  it('rejects NaN', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log)

    expect(log.updateCount(entry.id, NaN)).toBe(false)
    expect(log.logEntries.value[0]!.confirmedCount).toBe(10)
  })

  it('rejects Infinity', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log)

    expect(log.updateCount(entry.id, Infinity)).toBe(false)
    expect(log.logEntries.value[0]!.confirmedCount).toBe(10)
  })

  it('accepts zero as a valid count', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log)

    expect(log.updateCount(entry.id, 0)).toBe(true)
    expect(log.logEntries.value[0]!.confirmedCount).toBe(0)
  })
})

describe('useStockTakingLog — updateLocation', () => {
  let mockService: ReturnType<typeof createMockInventreeService>

  beforeEach(() => {
    mockService = createMockInventreeService()
  })

  async function addLoadedEntry(log: ReturnType<typeof useStockTakingLog>, barcode = 'BC-1', location: number | null = 7) {
    const part = makePart()
    const stockItem = makeStockItem({ pk: 100, quantity: 10, location })
    mockService.scanBarcode.mockResolvedValue(part)
    mockService.getStockItems.mockResolvedValue([stockItem])
    const entry = log.addItem(barcode)
    await flushPromises()
    return entry!
  }

  it('populates systemLocation and confirmedLocation from the stock item', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log, 'BC-1', 7)

    expect(entry.systemLocation).toBe(7)
    expect(entry.confirmedLocation).toBe(7)
  })

  it('updates confirmedLocation and returns true for a valid entry', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log, 'BC-1', 7)

    expect(log.updateLocation(entry.id, 12)).toBe(true)
    expect(log.logEntries.value[0]!.confirmedLocation).toBe(12)
    expect(log.logEntries.value[0]!.systemLocation).toBe(7)
  })

  it('accepts null (no location) as a valid value', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log, 'BC-1', 7)

    expect(log.updateLocation(entry.id, null)).toBe(true)
    expect(log.logEntries.value[0]!.confirmedLocation).toBeNull()
  })

  it('returns false for a non-existent entry ID', () => {
    const log = useStockTakingLog(mockService.service)
    expect(log.updateLocation('non-existent-id', 5)).toBe(false)
  })
})

describe('useStockTakingLog — removeEntry', () => {
  let mockService: ReturnType<typeof createMockInventreeService>

  beforeEach(() => {
    mockService = createMockInventreeService()
  })

  async function addLoadedEntry(log: ReturnType<typeof useStockTakingLog>, barcode: string) {
    const part = makePart({ pk: Math.random() * 1000 | 0 })
    const stockItem = makeStockItem({ pk: Math.random() * 1000 | 0, quantity: 10 })
    mockService.scanBarcode.mockResolvedValue(part)
    mockService.getStockItems.mockResolvedValue([stockItem])
    const entry = log.addItem(barcode)
    await flushPromises()
    return entry!
  }

  it('removes entry and returns it', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log, 'BC-1')

    const removed = log.removeEntry(entry.id)
    expect(removed).toEqual(entry)
    expect(log.logEntries.value).toHaveLength(0)
  })

  it('removes entry from barcodeIndex', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log, 'BC-1')

    log.removeEntry(entry.id)
    expect(log.getBarcodeIndex().has('BC-1')).toBe(false)
  })

  it('removes entry from entryOrder', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log, 'BC-1')

    log.removeEntry(entry.id)
    expect(log.getEntryOrder()).not.toContain(entry.id)
  })

  it('returns null for non-existent entry ID', () => {
    const log = useStockTakingLog(mockService.service)
    expect(log.removeEntry('non-existent')).toBeNull()
  })

  it('removes correct entry when multiple exist', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry1 = await addLoadedEntry(log, 'BC-1')
    const entry2 = await addLoadedEntry(log, 'BC-2')

    log.removeEntry(entry1.id)
    expect(log.logEntries.value).toHaveLength(1)
    expect(log.logEntries.value[0]!.id).toBe(entry2.id)
  })
})

describe('useStockTakingLog — removeLastEntry', () => {
  let mockService: ReturnType<typeof createMockInventreeService>

  beforeEach(() => {
    mockService = createMockInventreeService()
  })

  async function addLoadedEntry(log: ReturnType<typeof useStockTakingLog>, barcode: string) {
    const part = makePart({ pk: Math.random() * 1000 | 0 })
    const stockItem = makeStockItem({ pk: Math.random() * 1000 | 0, quantity: 10 })
    mockService.scanBarcode.mockResolvedValue(part)
    mockService.getStockItems.mockResolvedValue([stockItem])
    const entry = log.addItem(barcode)
    await flushPromises()
    return entry!
  }

  it('returns null when log is empty', () => {
    const log = useStockTakingLog(mockService.service)
    expect(log.removeLastEntry()).toBeNull()
  })

  it('removes the most recently added entry', async () => {
    const log = useStockTakingLog(mockService.service)
    await addLoadedEntry(log, 'BC-1')
    const entry2 = await addLoadedEntry(log, 'BC-2')

    const removed = log.removeLastEntry()
    expect(removed!.id).toBe(entry2.id)
    expect(log.logEntries.value).toHaveLength(1)
    expect(log.logEntries.value[0]!.barcode).toBe('BC-1')
  })

  it('decreases log length by exactly one', async () => {
    const log = useStockTakingLog(mockService.service)
    await addLoadedEntry(log, 'BC-1')
    await addLoadedEntry(log, 'BC-2')
    await addLoadedEntry(log, 'BC-3')

    log.removeLastEntry()
    expect(log.logEntries.value).toHaveLength(2)
  })
})

describe('useStockTakingLog — clearLog', () => {
  let mockService: ReturnType<typeof createMockInventreeService>

  beforeEach(() => {
    mockService = createMockInventreeService()
  })

  async function addLoadedEntry(log: ReturnType<typeof useStockTakingLog>, barcode: string) {
    const part = makePart({ pk: Math.random() * 1000 | 0 })
    const stockItem = makeStockItem({ pk: Math.random() * 1000 | 0, quantity: 10 })
    mockService.scanBarcode.mockResolvedValue(part)
    mockService.getStockItems.mockResolvedValue([stockItem])
    const entry = log.addItem(barcode)
    await flushPromises()
    return entry!
  }

  it('removes all entries from logEntries', async () => {
    const log = useStockTakingLog(mockService.service)
    await addLoadedEntry(log, 'BC-1')
    await addLoadedEntry(log, 'BC-2')

    log.clearLog()
    expect(log.logEntries.value).toHaveLength(0)
  })

  it('clears barcodeIndex', async () => {
    const log = useStockTakingLog(mockService.service)
    await addLoadedEntry(log, 'BC-1')

    log.clearLog()
    expect(log.getBarcodeIndex().size).toBe(0)
  })

  it('clears entryOrder', async () => {
    const log = useStockTakingLog(mockService.service)
    await addLoadedEntry(log, 'BC-1')

    log.clearLog()
    expect(log.getEntryOrder()).toHaveLength(0)
  })

  it('works on already empty log', () => {
    const log = useStockTakingLog(mockService.service)
    log.clearLog()
    expect(log.logEntries.value).toHaveLength(0)
    expect(log.getBarcodeIndex().size).toBe(0)
    expect(log.getEntryOrder()).toHaveLength(0)
  })
})

describe('useStockTakingLog — localStorage persistence', () => {
  const STORAGE_KEY = 'stock-taking-log'
  let mockService: ReturnType<typeof createMockInventreeService>

  beforeEach(() => {
    mockService = createMockInventreeService()
    localStorage.clear()
  })

  async function addLoadedEntry(log: ReturnType<typeof useStockTakingLog>, barcode: string) {
    const part = makePart({ pk: Math.random() * 1000 | 0 })
    const stockItem = makeStockItem({ pk: Math.random() * 1000 | 0, quantity: 10 })
    mockService.scanBarcode.mockResolvedValue(part)
    mockService.getStockItems.mockResolvedValue([stockItem])
    const entry = log.addItem(barcode)
    await flushPromises()
    return entry!
  }

  it('saves entries to localStorage after addItem', async () => {
    const log = useStockTakingLog(mockService.service)
    await addLoadedEntry(log, 'BC-1')

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.entries).toHaveLength(1)
    expect(stored.entries[0].barcode).toBe('BC-1')
    expect(stored.savedAt).toBeGreaterThan(0)
  })

  it('saves entries to localStorage after updateCount', async () => {
    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log, 'BC-1')

    log.updateCount(entry.id, 99)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.entries[0].confirmedCount).toBe(99)
  })

  it('saves entries to localStorage after removeEntry', async () => {
    const log = useStockTakingLog(mockService.service)
    await addLoadedEntry(log, 'BC-1')
    const entry2 = await addLoadedEntry(log, 'BC-2')

    log.removeEntry(entry2.id)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.entries).toHaveLength(1)
    expect(stored.entries[0].barcode).toBe('BC-1')
  })

  it('removes localStorage key on clearLog', async () => {
    const log = useStockTakingLog(mockService.service)
    await addLoadedEntry(log, 'BC-1')
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    log.clearLog()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('removes localStorage key when last entry is removed (saveToStorage with empty log)', async () => {
    const log = useStockTakingLog(mockService.service)
    await addLoadedEntry(log, 'BC-1')
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    log.removeLastEntry()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('loadFromStorage restores entries from localStorage', async () => {
    const log1 = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log1, 'BC-1')

    // Create a new composable instance and load from storage
    const log2 = useStockTakingLog(mockService.service)
    expect(log2.logEntries.value).toHaveLength(0)

    log2.loadFromStorage()
    expect(log2.logEntries.value).toHaveLength(1)
    expect(log2.logEntries.value[0]!.barcode).toBe('BC-1')
    expect(log2.logEntries.value[0]!.id).toBe(entry.id)
    expect(log2.logEntries.value[0]!.confirmedCount).toBe(entry.confirmedCount)
    expect(log2.logEntries.value[0]!.systemCount).toBe(entry.systemCount)
    expect(log2.logEntries.value[0]!.stockItemPk).toBe(entry.stockItemPk)
  })

  it('loadFromStorage rebuilds barcodeIndex', async () => {
    const log1 = useStockTakingLog(mockService.service)
    await addLoadedEntry(log1, 'BC-1')

    const log2 = useStockTakingLog(mockService.service)
    log2.loadFromStorage()

    // barcodeIndex should be rebuilt — duplicate detection should work
    expect(log2.getBarcodeIndex().has('BC-1')).toBe(true)
  })

  it('loadFromStorage rebuilds entryOrder sorted by addedAt', async () => {
    const log1 = useStockTakingLog(mockService.service)
    const entry1 = await addLoadedEntry(log1, 'BC-1')
    const entry2 = await addLoadedEntry(log1, 'BC-2')

    const log2 = useStockTakingLog(mockService.service)
    log2.loadFromStorage()

    const order = log2.getEntryOrder()
    expect(order).toHaveLength(2)
    // entryOrder is rebuilt sorted by addedAt (chronological)
    // Both entries should be present
    expect(order).toContain(entry1.id)
    expect(order).toContain(entry2.id)
    // entry1 was added first so should come before entry2
    expect(order.indexOf(entry1.id)).toBeLessThan(order.indexOf(entry2.id))
  })

  it('loadFromStorage handles missing localStorage key gracefully', () => {
    const log = useStockTakingLog(mockService.service)
    log.loadFromStorage()
    expect(log.logEntries.value).toHaveLength(0)
  })

  it('loadFromStorage handles corrupted JSON gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not valid json{{{')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const log = useStockTakingLog(mockService.service)
    log.loadFromStorage()

    expect(log.logEntries.value).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('loadFromStorage handles invalid structure (missing entries array) gracefully', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: 123 }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const log = useStockTakingLog(mockService.service)
    log.loadFromStorage()

    expect(log.logEntries.value).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledWith('Invalid stock taking log data in localStorage, starting fresh')
    warnSpy.mockRestore()
  })

  it('loadFromStorage handles null stored value gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'null')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const log = useStockTakingLog(mockService.service)
    log.loadFromStorage()

    expect(log.logEntries.value).toHaveLength(0)
    warnSpy.mockRestore()
  })

  it('round-trip: save then load preserves all entry fields', async () => {
    const log1 = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log1, 'ROUND-TRIP')
    log1.updateCount(entry.id, 42)

    const log2 = useStockTakingLog(mockService.service)
    log2.loadFromStorage()

    const restored = log2.logEntries.value[0]!
    expect(restored.id).toBe(entry.id)
    expect(restored.barcode).toBe('ROUND-TRIP')
    expect(restored.part).toEqual(entry.part)
    expect(restored.stockItemPk).toBe(entry.stockItemPk)
    expect(restored.systemCount).toBe(entry.systemCount)
    expect(restored.confirmedCount).toBe(42)
    expect(restored.status).toBe(entry.status)
    expect(restored.addedAt).toBe(entry.addedAt)
  })
})

describe('useStockTakingLog — applyStockTake', () => {
  let mockService: ReturnType<typeof createMockInventreeService>

  beforeEach(() => {
    mockService = createMockInventreeService()
    localStorage.clear()
  })

  async function addLoadedEntry(
    log: ReturnType<typeof useStockTakingLog>,
    barcode: string,
    quantity = 10,
    partPk = Math.random() * 1000 | 0,
    stockItemPk = Math.random() * 1000 | 0,
    location: number | null = null
  ) {
    const part = makePart({ pk: partPk, name: `Part-${partPk}` })
    const stockItem = makeStockItem({ pk: stockItemPk, quantity, location })
    mockService.scanBarcode.mockResolvedValueOnce(part)
    mockService.getStockItems.mockResolvedValueOnce([stockItem])
    const entry = log.addItem(barcode)
    await flushPromises()
    return entry!
  }

  it('returns early when log is empty', async () => {
    const adjustStock = vi.spyOn(mockService.service, 'adjustStock')
    const log = useStockTakingLog(mockService.service)

    const result = await log.applyStockTake()

    expect(result.success).toBe(false)
    expect(result.message).toBe('Log is empty')
    expect(result.processedItems).toBe(0)
    expect(result.skippedItems).toBe(0)
    expect(adjustStock).not.toHaveBeenCalled()
  })

  it('returns early with error when log has error entries', async () => {
    const adjustStock = vi.spyOn(mockService.service, 'adjustStock')
    mockService.scanBarcode.mockResolvedValueOnce(null)

    const log = useStockTakingLog(mockService.service)
    log.addItem('BAD-CODE')
    await flushPromises()

    const result = await log.applyStockTake()

    expect(result.success).toBe(false)
    expect(result.message).toBe('Cannot apply with error entries')
    expect(result.failedItems).toHaveLength(1)
    expect(adjustStock).not.toHaveBeenCalled()
  })

  it('skips all API calls when all deltas are zero, returns correct skippedItems count', async () => {
    const adjustStock = vi.spyOn(mockService.service, 'adjustStock')
    const log = useStockTakingLog(mockService.service)

    await addLoadedEntry(log, 'BC-1', 10)
    await addLoadedEntry(log, 'BC-2', 20)
    // confirmedCount defaults to systemCount, so delta = 0 for both

    const result = await log.applyStockTake()

    expect(result.success).toBe(true)
    expect(result.skippedItems).toBe(2)
    expect(result.processedItems).toBe(0)
    expect(adjustStock).not.toHaveBeenCalled()
    expect(log.logEntries.value).toHaveLength(0)
  })

  it('calls correct add/remove endpoints for mixed deltas', async () => {
    const adjustStock = vi.spyOn(mockService.service, 'adjustStock').mockResolvedValue(undefined)
    const log = useStockTakingLog(mockService.service)

    const entry1 = await addLoadedEntry(log, 'ADD-ITEM', 10, 1, 101)
    const entry2 = await addLoadedEntry(log, 'REMOVE-ITEM', 20, 2, 102)
    // entry3 (SKIP-ITEM) is added but left unmodified to exercise the delta-0 skip path
    await addLoadedEntry(log, 'SKIP-ITEM', 5, 3, 103)

    // entry1: system=10, set confirmed=15 → delta +5 (add)
    log.updateCount(entry1.id, 15)
    // entry2: system=20, set confirmed=12 → delta -8 (remove)
    log.updateCount(entry2.id, 12)
    // entry3: system=5, confirmed=5 → delta 0 (skip)

    const result = await log.applyStockTake()

    expect(result.success).toBe(true)
    expect(result.processedItems).toBe(2)
    expect(result.skippedItems).toBe(1)
    expect(adjustStock).toHaveBeenCalledTimes(2)
    expect(adjustStock).toHaveBeenCalledWith({
      stockItemPk: 101,
      currentQuantity: 10,
      newQuantity: 15,
      notes: 'Stock take adjustment via webapp'
    })
    expect(adjustStock).toHaveBeenCalledWith({
      stockItemPk: 102,
      currentQuantity: 20,
      newQuantity: 12,
      notes: 'Stock take adjustment via webapp'
    })
  })

  it('clears log on full success', async () => {
    vi.spyOn(mockService.service, 'adjustStock').mockResolvedValue(undefined)
    const log = useStockTakingLog(mockService.service)

    const entry = await addLoadedEntry(log, 'BC-1', 10)
    log.updateCount(entry.id, 15)

    const result = await log.applyStockTake()

    expect(result.success).toBe(true)
    expect(log.logEntries.value).toHaveLength(0)
    expect(log.isEmpty.value).toBe(true)
    expect(localStorage.getItem('stock-taking-log')).toBeNull()
  })

  it('retains only failed entries on partial failure', async () => {
    const adjustStock = vi.spyOn(mockService.service, 'adjustStock')
    // With unshift, logEntries is [FAIL-ITEM, OK-ITEM] so FAIL-ITEM is processed first
    adjustStock.mockRejectedValueOnce(new Error('API error')) // first call (FAIL-ITEM) fails
    adjustStock.mockResolvedValueOnce(undefined) // second call (OK-ITEM) succeeds

    const log = useStockTakingLog(mockService.service)

    const entry1 = await addLoadedEntry(log, 'OK-ITEM', 10, 1, 101)
    const entry2 = await addLoadedEntry(log, 'FAIL-ITEM', 20, 2, 102)

    log.updateCount(entry1.id, 15) // delta +5
    log.updateCount(entry2.id, 25) // delta +5

    const result = await log.applyStockTake()

    expect(result.success).toBe(false)
    expect(result.processedItems).toBe(1)
    expect(result.failedItems).toHaveLength(1)
    expect(result.failedItems[0]!.barcode).toBe('FAIL-ITEM')
    expect(log.logEntries.value).toHaveLength(1)
    expect(log.logEntries.value[0]!.barcode).toBe('FAIL-ITEM')
    expect(log.logEntries.value[0]!.status).toBe('error')
  })

  it('sets isSubmitting during execution', async () => {
    let capturedIsSubmitting = false
    vi.spyOn(mockService.service, 'adjustStock').mockImplementation(async () => {
      capturedIsSubmitting = log.isSubmitting.value
    })

    const log = useStockTakingLog(mockService.service)
    const entry = await addLoadedEntry(log, 'BC-1', 10)
    log.updateCount(entry.id, 15)

    expect(log.isSubmitting.value).toBe(false)
    await log.applyStockTake()

    expect(capturedIsSubmitting).toBe(true)
    expect(log.isSubmitting.value).toBe(false)
  })

  it('transfers stock when only the location changed (count unchanged)', async () => {
    const adjustStock = vi.spyOn(mockService.service, 'adjustStock').mockResolvedValue(undefined)
    const transferStock = vi.spyOn(mockService.service, 'transferStock').mockResolvedValue(undefined)
    const log = useStockTakingLog(mockService.service)

    const entry = await addLoadedEntry(log, 'BC-1', 10, 1, 101, 5)
    log.updateLocation(entry.id, 9)

    const result = await log.applyStockTake()

    expect(result.success).toBe(true)
    expect(result.processedItems).toBe(1)
    expect(result.skippedItems).toBe(0)
    expect(adjustStock).not.toHaveBeenCalled()
    expect(transferStock).toHaveBeenCalledTimes(1)
    expect(transferStock).toHaveBeenCalledWith(101, 9, 'Stock take location adjustment via webapp')
  })

  it('adjusts stock and transfers location when both changed', async () => {
    const adjustStock = vi.spyOn(mockService.service, 'adjustStock').mockResolvedValue(undefined)
    const transferStock = vi.spyOn(mockService.service, 'transferStock').mockResolvedValue(undefined)
    const log = useStockTakingLog(mockService.service)

    const entry = await addLoadedEntry(log, 'BC-1', 10, 1, 101, 5)
    log.updateCount(entry.id, 15)
    log.updateLocation(entry.id, 9)

    const result = await log.applyStockTake()

    expect(result.success).toBe(true)
    expect(result.processedItems).toBe(1)
    expect(adjustStock).toHaveBeenCalledWith({
      stockItemPk: 101,
      currentQuantity: 10,
      newQuantity: 15,
      notes: 'Stock take adjustment via webapp'
    })
    expect(transferStock).toHaveBeenCalledWith(101, 9, 'Stock take location adjustment via webapp')
  })

  it('skips entries where neither count nor location changed', async () => {
    const adjustStock = vi.spyOn(mockService.service, 'adjustStock').mockResolvedValue(undefined)
    const transferStock = vi.spyOn(mockService.service, 'transferStock').mockResolvedValue(undefined)
    const log = useStockTakingLog(mockService.service)

    await addLoadedEntry(log, 'BC-1', 10, 1, 101, 5)

    const result = await log.applyStockTake()

    expect(result.success).toBe(true)
    expect(result.skippedItems).toBe(1)
    expect(result.processedItems).toBe(0)
    expect(adjustStock).not.toHaveBeenCalled()
    expect(transferStock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Property-based tests for useStockTakingLog composable
// ---------------------------------------------------------------------------

describe('useStockTakingLog — property tests', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  /**
   * Helper: create a mock service whose scanBarcode resolves to a Part built
   * from the given pk/quantity, and getStockItems returns a matching stock item.
   */
  function setupMockForLoaded(partPk: number, stockItemPk: number, quantity: number) {
    const mock = createMockInventreeService()
    const part = makePart({ pk: partPk, name: `Part-${partPk}`, in_stock: quantity })
    const stockItem = makeStockItem({ pk: stockItemPk, part: partPk, quantity })
    mock.scanBarcode.mockResolvedValue(part)
    mock.getStockItems.mockResolvedValue([stockItem])
    return { mock, part, stockItem }
  }

  // -----------------------------------------------------------------------
  // Property 1: Log entry creation invariant
  // **Validates: Requirements 2.6, 4.1**
  // -----------------------------------------------------------------------
  it('Property 1 — new entries have confirmedCount === systemCount, valid stockItemPk, correct part', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 10000 }), // partPk
        fc.nat({ max: 10000 }), // stockItemPk
        fc.nat({ max: 100000 }), // quantity
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // barcode (exclude whitespace-only)
        async (partPk, stockItemPk, quantity, barcode) => {
          const { mock, part } = setupMockForLoaded(partPk, stockItemPk, quantity)
          const log = useStockTakingLog(mock.service)

          const entry = log.addItem(barcode)
          await flushPromises()

          expect(entry).not.toBeNull()
          expect(entry!.status).toBe('loaded')
          expect(entry!.confirmedCount).toBe(quantity)
          expect(entry!.systemCount).toBe(quantity)
          expect(entry!.stockItemPk).toBe(stockItemPk)
          expect(entry!.part).toEqual(part)
        }
      ),
      { numRuns: 100 }
    )
  })

  // -----------------------------------------------------------------------
  // Property 2: No duplicate log entries
  // **Validates: Requirements 3.1**
  // -----------------------------------------------------------------------
  it('Property 2 — scanning the same barcode twice does not increase log length', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        async (barcode) => {
          const { mock } = setupMockForLoaded(1, 100, 10)
          const log = useStockTakingLog(mock.service)

          log.addItem(barcode)
          await flushPromises()
          const lengthBefore = log.logEntries.value.length

          log.addItem(barcode)
          await flushPromises()
          const lengthAfter = log.logEntries.value.length

          expect(lengthAfter).toBe(lengthBefore)
        }
      ),
      { numRuns: 100 }
    )
  })

  // -----------------------------------------------------------------------
  // Property 3: Count update stores value
  // **Validates: Requirements 4.4**
  // -----------------------------------------------------------------------
  it('Property 3 — updateCount sets confirmedCount to the provided value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        fc.nat({ max: 100000 }),
        async (barcode, newCount) => {
          const { mock } = setupMockForLoaded(1, 100, 10)
          const log = useStockTakingLog(mock.service)

          const entry = log.addItem(barcode)
          await flushPromises()
          expect(entry).not.toBeNull()

          const result = log.updateCount(entry!.id, newCount)
          expect(result).toBe(true)
          expect(log.logEntries.value[0]!.confirmedCount).toBe(newCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  // -----------------------------------------------------------------------
  // Property 4: Remove last entry
  // **Validates: Requirements 5.1**
  // -----------------------------------------------------------------------
  it('Property 4 — removeLastEntry decreases length by 1 and removes the most recently added entry', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1–5 unique barcodes
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 })
          .map(arr => [...new Set(arr)])
          .filter(arr => arr.length >= 1),
        async (barcodes) => {
          const { mock } = setupMockForLoaded(1, 100, 10)
          const log = useStockTakingLog(mock.service)

          const entries = []
          for (const bc of barcodes) {
            const e = log.addItem(bc)
            await flushPromises()
            if (e) entries.push(e)
          }

          if (entries.length === 0) return // skip if all were empty strings

          const lengthBefore = log.logEntries.value.length
          const lastEntry = entries[entries.length - 1]!

          const removed = log.removeLastEntry()

          expect(removed).not.toBeNull()
          expect(removed!.id).toBe(lastEntry.id)
          expect(log.logEntries.value.length).toBe(lengthBefore - 1)
        }
      ),
      { numRuns: 100 }
    )
  })

  // -----------------------------------------------------------------------
  // Property 5: localStorage round-trip
  // **Validates: Requirements 6.1, 6.2**
  // -----------------------------------------------------------------------
  it('Property 5 — save then load produces equivalent entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1–5 unique barcodes with distinct part pks
        fc.array(
          fc.record({
            barcode: fc.string({ minLength: 1, maxLength: 20 }),
            partPk: fc.nat({ max: 10000 }),
            stockItemPk: fc.nat({ max: 10000 }),
            quantity: fc.nat({ max: 100000 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (items) => {
          localStorage.clear()

          // Deduplicate barcodes
          const seen = new Set<string>()
          const uniqueItems = items.filter((i) => {
            if (seen.has(i.barcode)) return false
            seen.add(i.barcode)
            return true
          })

          if (uniqueItems.length === 0) return

          const mock = createMockInventreeService()
          const log1 = useStockTakingLog(mock.service)

          // Add each item
          for (const item of uniqueItems) {
            const part = makePart({ pk: item.partPk, name: `Part-${item.partPk}`, in_stock: item.quantity })
            const stockItem = makeStockItem({ pk: item.stockItemPk, part: item.partPk, quantity: item.quantity })
            mock.scanBarcode.mockResolvedValueOnce(part)
            mock.getStockItems.mockResolvedValueOnce([stockItem])
            log1.addItem(item.barcode)
            await flushPromises()
          }

          const originalEntries = log1.logEntries.value.map(e => ({
            id: e.id,
            barcode: e.barcode,
            part: e.part,
            stockItemPk: e.stockItemPk,
            systemCount: e.systemCount,
            confirmedCount: e.confirmedCount,
            status: e.status
          }))

          // Restore in a fresh instance
          const log2 = useStockTakingLog(mock.service)
          log2.loadFromStorage()

          expect(log2.logEntries.value.length).toBe(originalEntries.length)

          for (let i = 0; i < originalEntries.length; i++) {
            const orig = originalEntries[i]!
            const restored = log2.logEntries.value[i]!
            expect(restored.id).toBe(orig.id)
            expect(restored.barcode).toBe(orig.barcode)
            expect(restored.part).toEqual(orig.part)
            expect(restored.stockItemPk).toBe(orig.stockItemPk)
            expect(restored.systemCount).toBe(orig.systemCount)
            expect(restored.confirmedCount).toBe(orig.confirmedCount)
            expect(restored.status).toBe(orig.status)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  // -----------------------------------------------------------------------
  // Property 9: Apply button disabled invariant
  // **Validates: Requirements 8.4**
  // -----------------------------------------------------------------------
  it('Property 9 — isEmpty and hasErrors correctly reflect apply-button-disabled state', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a list of barcodes, some of which will resolve and some won't
        fc.array(
          fc.record({
            barcode: fc.string({ minLength: 1, maxLength: 20 }),
            shouldError: fc.boolean()
          }),
          { minLength: 0, maxLength: 5 }
        ),
        async (items) => {
          localStorage.clear()

          // Deduplicate barcodes
          const seen = new Set<string>()
          const uniqueItems = items.filter((i) => {
            if (seen.has(i.barcode)) return false
            seen.add(i.barcode)
            return true
          })

          const mock = createMockInventreeService()
          const log = useStockTakingLog(mock.service)

          for (const item of uniqueItems) {
            if (item.shouldError) {
              mock.scanBarcode.mockResolvedValueOnce(null)
            } else {
              const part = makePart({ pk: 1 })
              const stockItem = makeStockItem({ pk: 100, quantity: 10 })
              mock.scanBarcode.mockResolvedValueOnce(part)
              mock.getStockItems.mockResolvedValueOnce([stockItem])
            }
            log.addItem(item.barcode)
            await flushPromises()
          }

          const isLogEmpty = log.logEntries.value.length === 0
          const hasErrorEntries = log.logEntries.value.some(e => e.status === 'error')

          // Apply button should be disabled iff log is empty OR has error entries
          const shouldBeDisabled = isLogEmpty || hasErrorEntries

          expect(log.isEmpty.value).toBe(isLogEmpty)
          expect(log.hasErrors.value).toBe(hasErrorEntries)

          // The button disabled state is: isEmpty || hasErrors
          expect(log.isEmpty.value || log.hasErrors.value).toBe(shouldBeDisabled)
        }
      ),
      { numRuns: 100 }
    )
  })
})
