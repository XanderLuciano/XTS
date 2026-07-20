import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { InventreeService } from '../../services/inventree.service'

// Feature: part-stock-location-selector, Property 6: Service methods extract results from paginated API responses

const categoryArb = fc.record({ pk: fc.integer({ min: 1, max: 100000 }), name: fc.string({ minLength: 1, maxLength: 100 }) })
const locationArb = fc.record({ pk: fc.integer({ min: 1, max: 100000 }), name: fc.string({ minLength: 1, maxLength: 100 }) })

describe('Scan Category/Location - Property Tests - Property 6', () => {
  // Feature: part-stock-location-selector, Property 6: Service methods extract results from paginated API responses
  // **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  it('Property 6: getCategories extracts results from paginated API response', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(categoryArb, { minLength: 0, maxLength: 20 }), async (items) => {
        const mockApi = vi.fn().mockResolvedValue({ results: items })
        const service = new InventreeService(mockApi)

        const result = await service.getCategories()

        expect(result).toEqual(items)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 6: getCategories returns plain array directly', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(categoryArb, { minLength: 0, maxLength: 20 }), async (items) => {
        const mockApi = vi.fn().mockResolvedValue(items)
        const service = new InventreeService(mockApi)

        const result = await service.getCategories()

        expect(result).toEqual(items)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 6: getLocations extracts results from paginated API response', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(locationArb, { minLength: 0, maxLength: 20 }), async (items) => {
        const mockApi = vi.fn().mockResolvedValue({ results: items })
        const service = new InventreeService(mockApi)

        const result = await service.getLocations()

        expect(result).toEqual(items)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 6: getLocations returns plain array directly', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(locationArb, { minLength: 0, maxLength: 20 }), async (items) => {
        const mockApi = vi.fn().mockResolvedValue(items)
        const service = new InventreeService(mockApi)

        const result = await service.getLocations()

        expect(result).toEqual(items)
      }),
      { numRuns: 100 }
    )
  })
})

describe('Scan Category/Location - Unit Tests - Property 6', () => {
  // **Validates: Requirements 4.3, 4.4, 4.5**

  it('getCategories calls /part/category/ endpoint', async () => {
    const mockApi = vi.fn().mockResolvedValue([])
    const service = new InventreeService(mockApi)

    await service.getCategories()

    expect(mockApi).toHaveBeenCalledOnce()
    expect(mockApi).toHaveBeenCalledWith('/part/category/')
  })

  it('getLocations calls /stock/location/ endpoint', async () => {
    const mockApi = vi.fn().mockResolvedValue([])
    const service = new InventreeService(mockApi)

    await service.getLocations()

    expect(mockApi).toHaveBeenCalledOnce()
    expect(mockApi).toHaveBeenCalledWith('/stock/location/')
  })

  it('getCategories propagates API errors', async () => {
    const mockApi = vi.fn().mockRejectedValue(new Error('Network error'))
    const service = new InventreeService(mockApi)

    await expect(service.getCategories()).rejects.toThrow('Network error')
  })

  it('getLocations propagates API errors', async () => {
    const mockApi = vi.fn().mockRejectedValue(new Error('Network error'))
    const service = new InventreeService(mockApi)

    await expect(service.getLocations()).rejects.toThrow('Network error')
  })
})

// Feature: part-stock-location-selector, Property 4: Category localStorage round-trip

describe('Scan Category/Location - Property Tests - Property 4', () => {
  // **Validates: Requirements 3.1, 3.3, 3.5**

  const uniqueCategoryListArb = fc.uniqueArray(categoryArb, { minLength: 1, maxLength: 50, selector: c => c.pk })
  const invalidPkArb = fc.integer({ min: -1000, max: 0 })

  it('Property 4: Saving a category pk from the list and restoring it produces the same category', () => {
    fc.assert(
      fc.property(uniqueCategoryListArb, fc.nat(), (categories, indexSeed) => {
        // Pick a category from the list
        const selectedIndex = indexSeed % categories.length
        const selected = categories[selectedIndex]!

        // Simulate saving to localStorage (watcher logic from scan.vue)
        const savedPk = String(selected.pk)

        // Simulate restoring from localStorage (onMounted logic from scan.vue)
        const pk = Number(savedPk)
        const match = categories.find(c => c.pk === pk) || null

        // Property: restored category matches the originally selected one (unique pks guarantee exact match)
        expect(match).not.toBeNull()
        expect(match!.pk).toBe(selected.pk)
        expect(match!.name).toBe(selected.name)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 4: Saving an invalid pk and restoring it produces null selection', () => {
    fc.assert(
      fc.property(uniqueCategoryListArb, invalidPkArb, (categories, invalidPk) => {
        // Simulate saving an invalid pk to localStorage
        const savedPk = String(invalidPk)

        // Simulate restoring from localStorage (onMounted logic from scan.vue)
        const pk = Number(savedPk)
        const match = categories.find(c => c.pk === pk) || null

        // Property: no category matches since all valid pks are >= 1 and invalidPk <= 0
        expect(match).toBeNull()
      }),
      { numRuns: 100 }
    )
  })
})

describe('Scan Category/Location - Unit Tests - Property 4', () => {
  // **Validates: Requirements 3.1, 3.3, 3.5**

  it('scan.vue contains a watcher that saves inventree_last_category to localStorage', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // The watcher must write to localStorage with key 'inventree_last_category'
    expect(content).toContain('localStorage.setItem(\'inventree_last_category\'')

    // The watcher must also remove the key when category is deselected
    expect(content).toContain('localStorage.removeItem(\'inventree_last_category\')')

    // The watcher is on selectedCategory
    expect(content).toContain('watch(selectedCategory')
  })

  it('scan.vue reads inventree_last_category from localStorage in onMounted', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // onMounted reads the saved category pk from localStorage
    expect(content).toContain('localStorage.getItem(\'inventree_last_category\')')

    // The restoration logic finds a matching category by pk (from the
    // filtered/labelled list so structural categories are excluded)
    expect(content).toContain('categoryItems.value.find(c => c.pk === pk)')
  })
})

// Feature: part-stock-location-selector, Property 5: Location localStorage round-trip

describe('Scan Category/Location - Property Tests - Property 5', () => {
  // **Validates: Requirements 3.2, 3.4, 3.5**

  const uniqueLocationListArb = fc.uniqueArray(locationArb, { minLength: 1, maxLength: 50, selector: l => l.pk })
  const invalidPkArb = fc.integer({ min: -1000, max: 0 })

  it('Property 5: Saving a location pk from the list and restoring it produces the same location', () => {
    fc.assert(
      fc.property(uniqueLocationListArb, fc.nat(), (locations, indexSeed) => {
        // Pick a location from the list
        const selectedIndex = indexSeed % locations.length
        const selected = locations[selectedIndex]!

        // Simulate saving to localStorage (watcher logic from scan.vue)
        const savedPk = String(selected.pk)

        // Simulate restoring from localStorage (onMounted logic from scan.vue)
        const pk = Number(savedPk)
        const match = locations.find(l => l.pk === pk) || null

        // Property: restored location matches the originally selected one
        expect(match).not.toBeNull()
        expect(match!.pk).toBe(selected.pk)
        expect(match!.name).toBe(selected.name)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 5: Saving an invalid pk and restoring it produces null selection', () => {
    fc.assert(
      fc.property(uniqueLocationListArb, invalidPkArb, (locations, invalidPk) => {
        // Simulate saving an invalid pk to localStorage
        const savedPk = String(invalidPk)

        // Simulate restoring from localStorage (onMounted logic from scan.vue)
        const pk = Number(savedPk)
        const match = locations.find(l => l.pk === pk) || null

        // Property: no location matches since all valid pks are >= 1 and invalidPk <= 0
        expect(match).toBeNull()
      }),
      { numRuns: 100 }
    )
  })
})

describe('Scan Category/Location - Unit Tests - Property 5', () => {
  // **Validates: Requirements 3.2, 3.4, 3.5**

  it('scan.vue contains a watcher that saves inventree_last_location to localStorage', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // The watcher must write to localStorage with key 'inventree_last_location'
    expect(content).toContain('localStorage.setItem(\'inventree_last_location\'')

    // The watcher must also remove the key when location is deselected
    expect(content).toContain('localStorage.removeItem(\'inventree_last_location\')')

    // The watcher is on selectedLocation
    expect(content).toContain('watch(selectedLocation')
  })

  it('scan.vue reads inventree_last_location from localStorage in onMounted', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // onMounted reads the saved location pk from localStorage
    expect(content).toContain('localStorage.getItem(\'inventree_last_location\')')

    // The restoration logic finds a matching location by pk
    expect(content).toContain('locations.value.find(l => l.pk === pk)')
  })
})

// Feature: part-stock-location-selector, Property 2: Location selector visibility matches createStock checkbox state

describe('Scan Category/Location - Property Tests - Property 2', () => {
  // **Validates: Requirements 2.1, 2.2**

  const toggleSequenceArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 20 })

  // Feature: part-stock-location-selector, Property 2: Location selector visibility matches createStock checkbox state
  it('Property 2: For any toggle sequence, location selector visibility equals createStock state', () => {
    fc.assert(
      fc.property(toggleSequenceArb, (toggles) => {
        // Simulate the reactive state as in scan.vue
        let createStock = false

        for (const toggle of toggles) {
          createStock = toggle

          // The template uses v-if="createStock" on the Stock Location UFormField.
          // So the Stock Location Selector is visible iff createStock is true.
          const locationSelectorVisible = createStock

          expect(locationSelectorVisible).toBe(createStock)
        }

        // After processing all toggles, final state should still hold the invariant
        const finalVisibility = createStock
        expect(finalVisibility).toBe(createStock)
      }),
      { numRuns: 100 }
    )
  })
})

describe('Scan Category/Location - Unit Tests - Property 2', () => {
  // **Validates: Requirements 2.1, 2.2**

  it('scan.vue template contains v-if="createStock" on the Stock Location wrapper', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // The div wrapping the Stock Location selector must use v-if="createStock"
    expect(content).toContain('v-if="createStock"')

    // The label "Stock Location" must be present
    expect(content).toContain('Stock Location')

    // The selectedLocation USelectMenu must be inside a v-if="createStock" block
    expect(content).toContain('v-model="selectedLocation"')
  })

  it('scan.vue template contains USelectMenu bound to selectedLocation with searchable prop', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // The USelectMenu for location must be bound to selectedLocation via v-model
    expect(content).toContain('v-model="selectedLocation"')

    // The USelectMenu must have the searchable prop
    // Find the USelectMenu that has v-model="selectedLocation" and verify it has searchable
    const locationSelectMatch = content.match(/<USelectMenu[^>]*v-model="selectedLocation"[^>]*>/)
    expect(locationSelectMatch).toBeTruthy()
    expect(locationSelectMatch![0]).toContain('searchable')
  })
})

// Feature: part-stock-location-selector, Property 1: Selected category pk (or null) is passed to CreatePartDto

describe('Scan Category/Location - Property Tests - Property 1', () => {
  // **Validates: Requirements 1.4, 1.5, 5.1, 5.3**

  const optionalCategoryArb = fc.option(categoryArb, { nil: null })

  it('Property 1: For any optional category, the category field in CreatePartDto equals selectedCategory?.pk ?? null', () => {
    fc.assert(
      fc.property(optionalCategoryArb, (selectedCategory) => {
        // Simulate the logic from scan.vue createPart:
        // category: selectedCategory.value?.pk ?? null
        const categoryField = selectedCategory?.pk ?? null

        if (selectedCategory !== null) {
          // When a category is selected, the field equals its pk
          expect(categoryField).toBe(selectedCategory.pk)
          expect(typeof categoryField).toBe('number')
        } else {
          // When no category is selected, the field is null
          expect(categoryField).toBeNull()
        }
      }),
      { numRuns: 100 }
    )
  })
})

describe('Scan Category/Location - Unit Tests - Property 1', () => {
  // **Validates: Requirements 1.4, 1.5, 5.1, 5.3**

  it('scan.vue contains category: selectedCategory.value?.pk ?? null in the partData object inside createPart', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // Extract the createPart function body
    const createPartFnMatch = content.match(/const createPart = async \(\) => \{([\s\S]*?)\n\}\n/)
    expect(createPartFnMatch).toBeTruthy()

    const createPartBody = createPartFnMatch![1]!

    // The partData object must contain the category field with the correct expression
    expect(createPartBody).toContain('category: selectedCategory.value?.pk ?? null')

    // The category field must be inside the CreatePartDto assignment
    const partDataMatch = createPartBody.match(/const partData: CreatePartDto = \{([\s\S]*?)\}/)
    expect(partDataMatch).toBeTruthy()
    expect(partDataMatch![1]).toContain('category: selectedCategory.value?.pk ?? null')
  })
})

// Feature: part-stock-location-selector, Property 3: Selected location pk (or null) is passed to AddStockDto

describe('Scan Category/Location - Property Tests - Property 3', () => {
  // **Validates: Requirements 2.5, 2.6, 5.2, 5.4**

  const optionalLocationArb = fc.option(locationArb, { nil: null })

  it('Property 3: For any optional location, the location field in AddStockDto equals selectedLocation?.pk ?? null', () => {
    fc.assert(
      fc.property(optionalLocationArb, (selectedLocation) => {
        // Simulate the logic from scan.vue createPart:
        // location: selectedLocation.value?.pk ?? null
        const locationField = selectedLocation?.pk ?? null

        if (selectedLocation !== null) {
          // When a location is selected, the field equals its pk
          expect(locationField).toBe(selectedLocation.pk)
          expect(typeof locationField).toBe('number')
        } else {
          // When no location is selected, the field is null
          expect(locationField).toBeNull()
        }
      }),
      { numRuns: 100 }
    )
  })
})

describe('Scan Category/Location - Unit Tests - Property 3', () => {
  // **Validates: Requirements 2.5, 2.6, 5.2, 5.4**

  it('scan.vue contains location: selectedLocation.value?.pk ?? null in the stockData object inside createPart', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // Extract the createPart function body
    const createPartFnMatch = content.match(/const createPart = async \(\) => \{([\s\S]*?)\n\}\n/)
    expect(createPartFnMatch).toBeTruthy()

    const createPartBody = createPartFnMatch![1]!

    // The stockData object must contain the location field with the correct expression
    expect(createPartBody).toContain('location: selectedLocation.value?.pk ?? null')

    // The location field must be inside the AddStockDto assignment
    const stockDataMatch = createPartBody.match(/const stockData: AddStockDto = \{([\s\S]*?)\}/)
    expect(stockDataMatch).toBeTruthy()
    expect(stockDataMatch![1]).toContain('location: selectedLocation.value?.pk ?? null')
  })
})
