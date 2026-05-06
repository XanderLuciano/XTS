import type { Ref } from 'vue'
import type { Part } from '~/types/inventree'

interface ScanRecord {
  barcode: string
  type?: string
  timestamp: Date
  lookupStatus: 'loading' | 'found' | 'not_found' | 'error'
  part?: Part
  errorMessage?: string
}

interface UseScanLookup {
  lookupBarcode(record: ScanRecord, scanHistory: Ref<ScanRecord[]>): Promise<void>
  reLookupBarcode(record: ScanRecord, scanHistory: Ref<ScanRecord[]>): Promise<void>
}

async function coreLookup(record: ScanRecord, scanHistory: Ref<ScanRecord[]>): Promise<void> {
  const inventree = useInventreeApi()

  record.lookupStatus = 'loading'
  triggerRef(scanHistory)

  try {
    const part: Part | null = await inventree.scanBarcode(record.barcode)

    if (part) {
      record.lookupStatus = 'found'
      record.part = part
    } else {
      record.lookupStatus = 'not_found'
    }
  } catch (error: unknown) {
    record.lookupStatus = 'error'
    record.errorMessage = error instanceof Error
      ? error.message
      : 'Failed to look up barcode'
  }

  triggerRef(scanHistory)
}

export const useScanLookup = (): UseScanLookup => {
  const lookupBarcode = async (record: ScanRecord, scanHistory: Ref<ScanRecord[]>): Promise<void> => {
    await coreLookup(record, scanHistory)
  }

  const reLookupBarcode = async (record: ScanRecord, scanHistory: Ref<ScanRecord[]>): Promise<void> => {
    record.errorMessage = undefined
    record.part = undefined
    await coreLookup(record, scanHistory)
  }

  return { lookupBarcode, reLookupBarcode }
}
