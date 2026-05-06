import fc from 'fast-check'
import type { Part, StockItem, CreatePartDto } from '~/types/inventree'

/**
 * Shared test arbitraries for InventreeService tests
 * These generators create random test data for property-based testing
 */

// Basic primitives
export const partIdArb = fc.integer({ min: 1, max: 10000 })
export const quantityArb = fc.integer({ min: 1, max: 1000 })
export const stringArb = fc.string({ minLength: 1, maxLength: 100 })
export const optionalStringArb = fc.option(fc.string({ minLength: 0, maxLength: 200 }))
export const notesArb = fc.option(fc.string({ minLength: 0, maxLength: 200 }))

// Part object generator
export const partArb = fc.record({
  pk: partIdArb,
  name: stringArb,
  description: stringArb,
  IPN: stringArb,
  revision: fc.string({ minLength: 0, maxLength: 20 }),
  category: fc.option(fc.integer({ min: 1, max: 100 })),
  active: fc.boolean(),
  virtual: fc.boolean(),
  component: fc.boolean(),
  assembly: fc.boolean(),
  purchaseable: fc.boolean(),
  salable: fc.boolean(),
  trackable: fc.boolean(),
  in_stock: fc.integer({ min: 0, max: 1000 }),
  link: fc.string({ minLength: 0, maxLength: 200 }),
  image: fc.option(fc.string()),
  thumbnail: fc.option(fc.string())
})

// Stock item generator
export const stockItemArb = fc.record({
  pk: fc.integer({ min: 1 }),
  part: partIdArb,
  quantity: quantityArb,
  location: fc.constant(null),
  serial: fc.constant(null),
  batch: fc.constant(null),
  notes: fc.string()
})

export const existingStockArb = fc.array(stockItemArb, { minLength: 0, maxLength: 5 })

// CreatePartDto generator - generates test data for part creation
export const createPartDtoArb: fc.Arbitrary<CreatePartDto> = fc.record({
  name: stringArb,
  IPN: stringArb,
  description: fc.option(stringArb, { nil: undefined }),
  link: fc.option(stringArb, { nil: undefined }),
  remote_image: fc.option(stringArb, { nil: undefined }),
  category: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  active: fc.option(fc.boolean(), { nil: undefined }),
  virtual: fc.option(fc.boolean(), { nil: undefined })
}) as fc.Arbitrary<CreatePartDto>

// API response format generators
export const arrayResponseArb = <T>(itemArb: fc.Arbitrary<T>) => 
  fc.array(itemArb, { minLength: 0, maxLength: 10 })

export const paginatedResponseArb = <T>(itemArb: fc.Arbitrary<T>) => 
  fc.record({
    results: fc.array(itemArb, { minLength: 0, maxLength: 10 }),
    count: fc.integer({ min: 0, max: 100 }),
    next: fc.option(fc.webUrl()),
    previous: fc.option(fc.webUrl())
  })

// Unexpected response formats for error handling
export const unexpectedResponseArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
  fc.record({ data: fc.array(partArb) }), // Wrong structure
  fc.string(), // Completely wrong type
  fc.integer()
)
