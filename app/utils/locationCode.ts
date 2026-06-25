/**
 * Bin location code utilities.
 *
 * A bin location is identified by four numeric components:
 *   Room . Shelf . Row . Bin
 * Each component is zero-padded to 3 digits and joined with dots, e.g.
 *   Room 1, Shelf 2, Row 3, Bin 4  ->  "001.002.003.004"
 *
 * This encoded string is used as the InvenTree stock location name and as the
 * content of the QR code printed on the location label.
 */

export interface LocationCodeParts {
  room: number
  shelf: number
  row: number
  bin: number
}

/** Matches a fully-formed location code: four 3-digit groups separated by dots. */
export const LOCATION_CODE_REGEX = /^\d{3}\.\d{3}\.\d{3}\.\d{3}$/

/** Zero-pad a non-negative integer to 3 digits. */
function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

/**
 * Validate that a value is a non-negative integer that fits in 3 digits (0–999).
 */
export function isValidComponent(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 999
}

/**
 * Build an encoded location code from its component parts.
 * Throws if any component is out of the valid 0–999 range.
 */
export function buildLocationCode(parts: LocationCodeParts): string {
  const { room, shelf, row, bin } = parts
  for (const value of [room, shelf, row, bin]) {
    if (!isValidComponent(value)) {
      throw new Error(`Location component out of range (0–999): ${value}`)
    }
  }
  return `${pad3(room)}.${pad3(shelf)}.${pad3(row)}.${pad3(bin)}`
}

/**
 * Returns true if the given string is a valid encoded location code.
 */
export function isLocationCode(value: string | null | undefined): boolean {
  if (!value) return false
  return LOCATION_CODE_REGEX.test(value.trim())
}

/**
 * Parse an encoded location code back into its component parts.
 * Returns null if the string is not a valid location code.
 */
export function parseLocationCode(value: string | null | undefined): LocationCodeParts | null {
  if (!isLocationCode(value)) return null
  const [room, shelf, row, bin] = value!.trim().split('.').map(Number)
  return { room: room!, shelf: shelf!, row: row!, bin: bin! }
}

/**
 * Format a location code for human-friendly display, e.g.
 * "001.002.003.004" -> "Room 1 · Shelf 2 · Row 3 · Bin 4".
 * Falls back to the raw code if it cannot be parsed.
 */
export function describeLocationCode(value: string): string {
  const parts = parseLocationCode(value)
  if (!parts) return value
  return `Room ${parts.room} · Shelf ${parts.shelf} · Row ${parts.row} · Bin ${parts.bin}`
}
