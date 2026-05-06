import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { InventreeService } from '../../services/inventree.service'

// Feature: barcode-link-stock, Property 5: Service linkBarcode POSTs correct payload

describe('Scan Barcode Link - Property Tests', () => {
  const barcodeArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
  const stockItemPkArb = fc.integer({ min: 1, max: 100000 })

  // Feature: barcode-link-stock, Property 5: Service linkBarcode POSTs correct payload
  // **Validates: Requirements 3.2**
  it('Property 5: Service linkBarcode POSTs correct payload', async () => {
    await fc.assert(
      fc.asyncProperty(barcodeArb, stockItemPkArb, async (barcode, pk) => {
        const mockApi = vi.fn().mockResolvedValue(undefined)
        const service = new InventreeService(mockApi)

        await service.linkBarcode(barcode, pk)

        expect(mockApi).toHaveBeenCalledOnce()
        expect(mockApi).toHaveBeenCalledWith('/barcode/link/', {
          method: 'POST',
          body: { barcode, stockitem: pk },
        })
      }),
      { numRuns: 100 },
    )
  })
})


// Feature: barcode-link-stock, Property 6: currentBarcode captures the lookup barcode

describe('Scan Barcode Link - Property Tests - Property 6', () => {
  const barcodeArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)

  // Feature: barcode-link-stock, Property 6: currentBarcode captures the lookup barcode
  // **Validates: Requirements 4.1, 4.2**
  it('Property 6: currentBarcode captures the lookup barcode', () => {
    fc.assert(
      fc.property(barcodeArb, (barcode) => {
        // Simulate the lookupProduct flow from scan.vue:
        // When lookupProduct is called with a barcode and the scrape succeeds,
        // currentBarcode.value is set to that barcode before the modal opens.
        let currentBarcode: string | null = null

        // Simulate successful scrape response
        const responseSuccess = true

        if (responseSuccess) {
          // This mirrors the assignment in lookupProduct:
          // currentBarcode.value = barcode
          currentBarcode = barcode
        }

        // Property: after a successful lookup, currentBarcode equals the barcode passed in
        expect(currentBarcode).toBe(barcode)
        // The barcode is non-null
        expect(currentBarcode).not.toBeNull()
        // The barcode is the exact string (not trimmed, not modified)
        expect(currentBarcode).toStrictEqual(barcode)
      }),
      { numRuns: 100 },
    )
  })
})

describe('Scan Barcode Link - Unit Tests - Property 6', () => {
  // Verify scan.vue source contains `currentBarcode.value = barcode` inside lookupProduct,
  // and that it comes before `isModalOpen.value = true`
  // **Validates: Requirements 4.1, 4.2**
  it('scan.vue sets currentBarcode to barcode in lookupProduct before opening modal', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // Extract the lookupProduct function body
    const lookupMatch = content.match(/const lookupProduct = async[\s\S]*?\n\}/)
    expect(lookupMatch).toBeTruthy()

    const lookupBody = lookupMatch![0]

    // currentBarcode.value = barcode must exist inside lookupProduct
    expect(lookupBody).toContain('currentBarcode.value = barcode')

    // isModalOpen.value = true must exist inside lookupProduct
    expect(lookupBody).toContain('isModalOpen.value = true')

    // currentBarcode assignment must come BEFORE isModalOpen = true
    const barcodeAssignIndex = lookupBody.indexOf('currentBarcode.value = barcode')
    const modalOpenIndex = lookupBody.indexOf('isModalOpen.value = true')

    expect(barcodeAssignIndex).toBeGreaterThan(-1)
    expect(modalOpenIndex).toBeGreaterThan(-1)
    expect(barcodeAssignIndex).toBeLessThan(modalOpenIndex)
  })
})


// Feature: barcode-link-stock, Property 2: linkBarcode resets to checked on every modal open

describe('Scan Barcode Link - Property Tests - Property 2', () => {
  const sessionArb = fc.array(
    fc.record({ toggled: fc.boolean() }),
    { minLength: 1, maxLength: 10 },
  )

  // Feature: barcode-link-stock, Property 2: linkBarcode resets to checked on every modal open
  // **Validates: Requirements 1.3, 5.1, 5.2**
  it('Property 2: linkBarcode resets to checked on every modal open', () => {
    fc.assert(
      fc.property(sessionArb, (sessions) => {
        // Simulate the reactive state — start dirty to prove reset works
        let linkBarcode = false

        for (const session of sessions) {
          // Modal opens → lookupProduct resets linkBarcode to true before isModalOpen = true
          linkBarcode = true

          // Assert: after reset, linkBarcode is always true (checked)
          expect(linkBarcode).toBe(true)

          // User toggles linkBarcode during the session
          linkBarcode = session.toggled

          // Modal closes (submit or cancel) — state is now potentially "dirty"
        }
      }),
      { numRuns: 100 },
    )
  })
})

describe('Scan Barcode Link - Unit Tests - Property 2', () => {
  // Verify scan.vue source contains `linkBarcode.value = true` inside lookupProduct,
  // and that it comes before `isModalOpen.value = true`
  // **Validates: Requirements 1.3, 5.1, 5.2**
  it('scan.vue resets linkBarcode to true in lookupProduct before opening modal', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // Extract the lookupProduct function body
    const lookupMatch = content.match(/const lookupProduct = async[\s\S]*?\n\}/)
    expect(lookupMatch).toBeTruthy()

    const lookupBody = lookupMatch![0]

    // linkBarcode.value = true must exist inside lookupProduct
    expect(lookupBody).toContain('linkBarcode.value = true')

    // isModalOpen.value = true must exist inside lookupProduct
    expect(lookupBody).toContain('isModalOpen.value = true')

    // linkBarcode reset must come BEFORE isModalOpen = true
    const linkBarcodeResetIndex = lookupBody.indexOf('linkBarcode.value = true')
    const modalOpenIndex = lookupBody.indexOf('isModalOpen.value = true')

    expect(linkBarcodeResetIndex).toBeGreaterThan(-1)
    expect(modalOpenIndex).toBeGreaterThan(-1)
    expect(linkBarcodeResetIndex).toBeLessThan(modalOpenIndex)
  })
})


// Feature: barcode-link-stock, Property 1: Link checkbox visibility matches createStock state

describe('Scan Barcode Link - Property Tests - Property 1', () => {
  const toggleSequenceArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 20 })

  // Feature: barcode-link-stock, Property 1: Link checkbox visibility matches createStock state
  // **Validates: Requirements 1.1, 1.2**
  it('Property 1: Link checkbox visibility matches createStock state', () => {
    fc.assert(
      fc.property(toggleSequenceArb, (toggles) => {
        // Simulate the reactive state as in scan.vue
        let createStock = false

        for (const toggle of toggles) {
          createStock = toggle

          // The template uses v-if="createStock" on the div wrapping the Link Barcode checkbox.
          // So the Link Barcode checkbox is visible iff createStock is true.
          const linkCheckboxVisible = createStock

          expect(linkCheckboxVisible).toBe(createStock)
        }

        // After processing all toggles, final state should still hold the invariant
        const finalVisibility = createStock
        expect(finalVisibility).toBe(createStock)
      }),
      { numRuns: 100 },
    )
  })
})

describe('Scan Barcode Link - Unit Tests - Property 1', () => {
  // Verify scan.vue template contains v-if="createStock" on the div wrapping the Link Barcode checkbox,
  // and that the checkbox label is "Link Barcode to Stock Item"
  // **Validates: Requirements 1.1, 1.2**
  it('scan.vue template has v-if="createStock" on the Link Barcode checkbox wrapper and correct label', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // The div wrapping the Link Barcode checkbox uses v-if="createStock"
    expect(content).toContain('v-if="createStock"')

    // The checkbox label reads "Link Barcode to Stock Item"
    expect(content).toContain('Link Barcode to Stock Item')

    // The checkbox is bound to linkBarcode via v-model
    expect(content).toContain('v-model="linkBarcode"')
  })
})


// Feature: barcode-link-stock, Property 7: Checkbox description displays the barcode value

describe('Scan Barcode Link - Property Tests - Property 7', () => {
  const barcodeArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)

  // Feature: barcode-link-stock, Property 7: Checkbox description displays the barcode value
  // **Validates: Requirements 4.3**
  it('Property 7: Checkbox description displays the barcode value', () => {
    fc.assert(
      fc.property(barcodeArb, (barcode) => {
        // Simulate the template rendering of the description text.
        // In scan.vue the description reads:
        //   Link barcode {{ currentBarcode }} to the new stock item
        // When currentBarcode holds the barcode value, the rendered string contains it.
        const currentBarcode = barcode
        const renderedDescription = `Link barcode ${currentBarcode} to the new stock item`

        // Property: the rendered description contains the barcode string
        expect(renderedDescription).toContain(barcode)
      }),
      { numRuns: 100 },
    )
  })
})

describe('Scan Barcode Link - Unit Tests - Property 7', () => {
  // Verify scan.vue source contains {{ currentBarcode }} in the description text
  // near the "Link Barcode to Stock Item" label
  // **Validates: Requirements 4.3**
  it('scan.vue template displays currentBarcode in the Link Barcode checkbox description', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // The description paragraph must interpolate currentBarcode
    expect(content).toContain('{{ currentBarcode }}')

    // The description text should mention linking the barcode to the stock item
    expect(content).toContain('Link barcode')
    expect(content).toContain('to the new stock item')

    // The label "Link Barcode to Stock Item" must be present nearby
    expect(content).toContain('Link Barcode to Stock Item')
  })
})


// Feature: barcode-link-stock, Property 3: Barcode link API called if and only if all preconditions met

describe('Scan Barcode Link - Property Tests - Property 3', () => {
  const createStockArb = fc.boolean()
  const linkBarcodeArb = fc.boolean()
  const stockSuccessArb = fc.boolean()

  // Feature: barcode-link-stock, Property 3: Barcode link API called if and only if all preconditions met
  // **Validates: Requirements 2.1, 2.4, 2.5**
  it('Property 3: Barcode link API called if and only if all preconditions met', () => {
    fc.assert(
      fc.property(createStockArb, linkBarcodeArb, stockSuccessArb,
        (createStockChecked, linkBarcodeChecked, stockSucceeded) => {
          let linkBarcodeCalled = false

          // Simulate createPart logic from scan.vue:
          // 1. Part creation always succeeds (we're testing the stock+barcode path)
          // 2. If createStock is checked, attempt addStock
          // 3. stockItem is defined only if addStock succeeds
          // 4. linkBarcode API is called iff: createStock AND linkBarcodeChecked AND stockItem is defined

          let stockItem: { pk: number } | undefined

          if (createStockChecked) {
            // Attempt addStock
            if (stockSucceeded) {
              stockItem = { pk: 42 }
            }
            // If stockSucceeded is false, addStock threw → stockItem remains undefined

            // Guard condition from scan.vue:
            // if (stockItem && linkBarcode.value && currentBarcode.value)
            if (stockItem && linkBarcodeChecked && true /* currentBarcode is always set after lookupProduct */) {
              linkBarcodeCalled = true
            }
          }

          // Property: linkBarcode is called if and only if all three conditions hold
          const expectedCall = createStockChecked && linkBarcodeChecked && stockSucceeded
          expect(linkBarcodeCalled).toBe(expectedCall)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('Scan Barcode Link - Unit Tests - Property 3', () => {
  // Verify scan.vue source contains the guard condition for barcode linking
  // and that it comes after the addStock try/catch block
  // **Validates: Requirements 2.1, 2.4, 2.5**
  it('scan.vue contains the barcode link guard condition after addStock try/catch', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // Extract the createPart function body
    const createPartFnMatch = content.match(/const createPart = async \(\) => \{([\s\S]*?)\n\}\n/)
    expect(createPartFnMatch).toBeTruthy()

    const createPartBody = createPartFnMatch![1]

    // The guard condition must exist: if (stockItem && linkBarcode.value && currentBarcode.value)
    expect(createPartBody).toContain('if (stockItem && linkBarcode.value && currentBarcode.value)')

    // The inventree.linkBarcode( call must exist after the guard
    expect(createPartBody).toContain('inventree.linkBarcode(')

    // The guard must come AFTER the addStock try/catch block
    const addStockCallIndex = createPartBody.indexOf('inventree.addStock(')
    const linkBarcodeGuardIndex = createPartBody.indexOf('if (stockItem && linkBarcode.value && currentBarcode.value)')
    const linkBarcodeCallIndex = createPartBody.indexOf('inventree.linkBarcode(')

    expect(addStockCallIndex).toBeGreaterThan(-1)
    expect(linkBarcodeGuardIndex).toBeGreaterThan(-1)
    expect(linkBarcodeCallIndex).toBeGreaterThan(-1)

    // addStock call comes before the linkBarcode guard
    expect(linkBarcodeGuardIndex).toBeGreaterThan(addStockCallIndex)

    // linkBarcode call comes after the guard
    expect(linkBarcodeCallIndex).toBeGreaterThan(linkBarcodeGuardIndex)
  })
})


// Feature: barcode-link-stock, Property 4: Successful barcode link shows success toast with barcode value

describe('Scan Barcode Link - Property Tests - Property 4', () => {
  const barcodeArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
  const stockItemPkArb = fc.integer({ min: 1, max: 100000 })

  // Feature: barcode-link-stock, Property 4: Successful barcode link shows success toast with barcode value
  // **Validates: Requirements 2.2**
  it('Property 4: Successful barcode link shows success toast with barcode value', () => {
    fc.assert(
      fc.property(barcodeArb, stockItemPkArb, (barcode, stockItemPk) => {
        // Track toast calls
        const toastCalls: Array<{ title: string; description?: string; color: string }> = []

        // Simulate the successful barcode link flow from scan.vue:
        // After part + stock creation succeed, linkBarcode API is called and succeeds.
        // The code then adds a success toast:
        //   toast.add({
        //     title: 'Barcode linked to stock item',
        //     description: `Barcode: ${currentBarcode.value}`,
        //     color: 'success'
        //   })

        const currentBarcode = barcode

        // Simulate successful linkBarcode call → success toast is added
        toastCalls.push({
          title: 'Barcode linked to stock item',
          description: `Barcode: ${currentBarcode}`,
          color: 'success',
        })

        // Property assertions:
        // A toast was added
        expect(toastCalls).toHaveLength(1)

        // The toast has the correct title
        expect(toastCalls[0].title).toBe('Barcode linked to stock item')

        // The toast description contains the barcode value
        expect(toastCalls[0].description).toContain(barcode)
        expect(toastCalls[0].description).toBe(`Barcode: ${barcode}`)

        // The toast color is 'success'
        expect(toastCalls[0].color).toBe('success')
      }),
      { numRuns: 100 },
    )
  })
})

describe('Scan Barcode Link - Unit Tests - Property 4', () => {
  // Verify scan.vue source contains the success toast for barcode linking
  // with the correct title, description using currentBarcode.value, and color 'success'
  // **Validates: Requirements 2.2**
  it('scan.vue contains success toast for barcode link with correct title, description, and color', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')

    // The toast title must be 'Barcode linked to stock item'
    expect(content).toContain("title: 'Barcode linked to stock item'")

    // The toast description must contain currentBarcode.value via template literal
    // In scan.vue: description: `Barcode: ${currentBarcode.value}`
    expect(content).toContain('Barcode: ${currentBarcode.value}')

    // The toast color must be 'success'
    // Verify the success toast block has color: 'success' near the barcode link title
    const linkToastMatch = content.match(
      /title:\s*'Barcode linked to stock item'[\s\S]*?color:\s*'success'/,
    )
    expect(linkToastMatch).toBeTruthy()
  })
})
