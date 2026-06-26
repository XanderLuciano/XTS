/**
 * Types for the Kit List feature.
 *
 * A "kit" is the act of pulling every component of a BOM (assembly) out of
 * stock so it can be physically assembled. The kit list page sits between the
 * BOM view (what's required) and checkout (removing stock). It tracks scanning
 * progress, per-part notes, revision overrides, and finally checks each part
 * out of InvenTree recording the kit name + notes as the removal reason.
 */

/**
 * A single barcode scan recorded against a kit item.
 * Captures everything we want to retain about what physically went in the kit.
 */
export interface KitScanRecord {
  /** Raw scanned barcode string. */
  barcode: string
  /** Internal part number of the scanned part. */
  ipn: string
  /** Revision of the scanned part. */
  revision: string
  /** Batch / vendor of the scanned stock item, if known. */
  batch: string | null
  /** Stock item pk the barcode resolved to, if any. */
  stockItemPk: number | null
  /** Whether the scan matched the target revision exactly or was a rev mismatch. */
  matchKind: 'exact' | 'rev-mismatch'
  /** Timestamp the scan was recorded. */
  scannedAt: number
}

/**
 * A scan that did not match any part in the BOM (red error).
 */
export interface UnmatchedScan {
  barcode: string
  ipn: string
  revision: string
  /** Why it didn't match — e.g. not in BOM, or barcode not found. */
  reason: string
  scannedAt: number
}

/**
 * A stock location holding some quantity of a kit item's part.
 */
export interface KitItemLocation {
  stockItemPk: number
  locationPk: number | null
  locationName: string
  quantity: number
  batch: string | null
}

/**
 * Lifecycle status of a kit item used for the green / yellow / red indicators.
 * - pending: nothing scanned yet
 * - partial: some but not all required units scanned
 * - complete: required units scanned, all correct revision (green)
 * - rev-mismatch: scanned a same-IPN, different-rev part (yellow, allowed)
 * - skipped: user chose to skip this part (records a reason)
 * - error: a checkout / resolution error occurred (red)
 */
export type KitItemStatus = 'pending' | 'partial' | 'complete' | 'rev-mismatch' | 'skipped' | 'error'

/**
 * One line of the kit, derived from a BOM item.
 */
export interface KitItem {
  /** Stable client id. */
  id: string
  /** Originating BOM item pk. */
  bomItemPk: number
  /** Target part pk (changes when the revision is overridden). */
  partPk: number
  /** Internal part number (shared across revisions). */
  ipn: string
  /** Part display name. */
  name: string
  /** The revision we intend to kit (may be overridden by the user). */
  targetRevision: string
  /** Quantity required per single build (from the BOM). */
  perBuildQty: number
  /** Total required quantity = perBuildQty * buildQty. */
  requiredQty: number
  /** Quantity to actually pull/checkout — editable, defaults to requiredQty. */
  kitQty: number
  /** Aggregate stock on hand for the target part. */
  inStock: number
  /** Stock locations holding this part. */
  locations: KitItemLocation[]
  /** Whether stock/location data is still loading. */
  resolving: boolean
  /** Barcode scans recorded against this item. */
  scans: KitScanRecord[]
  /** Free-text note about this part (becomes part of the checkout reason). */
  note: string
  /** Current status. */
  status: KitItemStatus
  /** Reason captured when the item is skipped. */
  skipReason?: string
  /** Detailed error message if checkout failed for this item. */
  errorMessage?: string
  /** Part thumbnail/image url for display. */
  thumbnail: string | null
}

/**
 * Result of completing (checking out) a kit.
 */
export interface KitCompletionResult {
  success: boolean
  /** Items successfully checked out. */
  processedItems: number
  /** Items skipped (not checked out). */
  skippedItems: number
  /** Items that failed checkout, retained for retry. */
  failedItems: KitItem[]
  message: string
}

/**
 * Shape persisted to localStorage so an in-progress kit survives reloads.
 */
export interface PersistedKitDraft {
  version: number
  assemblyPk: number | null
  assemblyName: string
  assemblyIPN: string
  kitName: string
  buildQty: number
  items: KitItem[]
  unmatchedScans: UnmatchedScan[]
  completed: boolean
  savedAt: number
}
