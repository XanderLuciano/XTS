import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  buildLocationCode,
  parseLocationCode,
  isLocationCode,
  isValidComponent,
  describeLocationCode,
  LOCATION_CODE_REGEX
} from '../locationCode'

/**
 * Tests for the bin location code utilities.
 *
 * Feature: bin-locations
 */
describe('buildLocationCode', () => {
  it('zero-pads each component to 3 digits and joins with dots', () => {
    expect(buildLocationCode({ room: 1, shelf: 2, row: 3, bin: 4 })).toBe('001.002.003.004')
  })

  it('handles three-digit components without truncation', () => {
    expect(buildLocationCode({ room: 999, shelf: 100, row: 12, bin: 0 })).toBe('999.100.012.000')
  })

  it('throws when a component is out of range', () => {
    expect(() => buildLocationCode({ room: 1000, shelf: 1, row: 1, bin: 1 })).toThrow()
    expect(() => buildLocationCode({ room: -1, shelf: 1, row: 1, bin: 1 })).toThrow()
  })

  it('throws when a component is not an integer', () => {
    expect(() => buildLocationCode({ room: 1.5, shelf: 1, row: 1, bin: 1 })).toThrow()
  })

  // Property: output always matches the canonical regex
  it('Property: output always matches LOCATION_CODE_REGEX', () => {
    const compArb = fc.integer({ min: 0, max: 999 })
    fc.assert(
      fc.property(compArb, compArb, compArb, compArb, (room, shelf, row, bin) => {
        const code = buildLocationCode({ room, shelf, row, bin })
        expect(LOCATION_CODE_REGEX.test(code)).toBe(true)
      }),
      { numRuns: 200 }
    )
  })
})

describe('isValidComponent', () => {
  it('accepts integers in the 0–999 range', () => {
    expect(isValidComponent(0)).toBe(true)
    expect(isValidComponent(999)).toBe(true)
  })

  it('rejects out-of-range and non-integer values', () => {
    expect(isValidComponent(-1)).toBe(false)
    expect(isValidComponent(1000)).toBe(false)
    expect(isValidComponent(1.5)).toBe(false)
    expect(isValidComponent(Number.NaN)).toBe(false)
  })
})

describe('isLocationCode', () => {
  it('recognises a valid encoded code', () => {
    expect(isLocationCode('001.002.003.004')).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    expect(isLocationCode('  001.002.003.004  ')).toBe(true)
  })

  it('rejects malformed strings', () => {
    expect(isLocationCode('1.2.3.4')).toBe(false)
    expect(isLocationCode('001.002.003')).toBe(false)
    expect(isLocationCode('001-002-003-004')).toBe(false)
    expect(isLocationCode('ABC-123-A-VENDOR-0001')).toBe(false)
    expect(isLocationCode('')).toBe(false)
    expect(isLocationCode(null)).toBe(false)
    expect(isLocationCode(undefined)).toBe(false)
  })
})

describe('parseLocationCode', () => {
  it('round-trips with buildLocationCode', () => {
    const compArb = fc.integer({ min: 0, max: 999 })
    fc.assert(
      fc.property(compArb, compArb, compArb, compArb, (room, shelf, row, bin) => {
        const code = buildLocationCode({ room, shelf, row, bin })
        expect(parseLocationCode(code)).toEqual({ room, shelf, row, bin })
      }),
      { numRuns: 200 }
    )
  })

  it('returns null for invalid input', () => {
    expect(parseLocationCode('not-a-code')).toBeNull()
    expect(parseLocationCode(null)).toBeNull()
  })
})

describe('describeLocationCode', () => {
  it('produces a human-readable description', () => {
    expect(describeLocationCode('001.002.003.004')).toBe('Room 1 · Shelf 2 · Row 3 · Bin 4')
  })

  it('falls back to the raw code when not parseable', () => {
    expect(describeLocationCode('whatever')).toBe('whatever')
  })
})
