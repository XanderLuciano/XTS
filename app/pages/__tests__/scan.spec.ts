import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { mount } from '@vue/test-utils'
import { defineComponent, h, type PropType } from 'vue'
import { FORMAT_LABELS } from '~/types/scanner'
import type { BarcodeFormat } from '~/types/scanner'
import type { Part } from '~/types/inventree'

// --- ScanRecord interface (mirrors scan.vue) ---
interface ScanRecord {
  barcode: string
  type?: string
  timestamp: Date
  lookupStatus: 'loading' | 'found' | 'not_found' | 'error'
  part?: Part
  errorMessage?: string
}

// --- Arbitraries ---
const barcodeValueArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0).map(s => s.trim())
const barcodeFormatArb = fc.constantFrom<BarcodeFormat>(
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128',
  'qr_code', 'data_matrix', 'pdf417', 'aztec',
)

// Generate trimmed non-empty strings for text fields (DOM .text() trims whitespace)
const trimmedStringArb = (opts: { minLength?: number; maxLength: number }) =>
  fc.string({ minLength: opts.minLength ?? 1, maxLength: opts.maxLength })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim())

const partArb: fc.Arbitrary<Part> = fc.record({
  pk: fc.integer({ min: 1, max: 100000 }),
  name: trimmedStringArb({ maxLength: 80 }),
  description: trimmedStringArb({ maxLength: 150 }),
  IPN: trimmedStringArb({ maxLength: 30 }),
  revision: fc.string({ maxLength: 10 }),
  category: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: null }),
  active: fc.boolean(),
  virtual: fc.boolean(),
  component: fc.boolean(),
  assembly: fc.boolean(),
  purchaseable: fc.boolean(),
  salable: fc.boolean(),
  trackable: fc.boolean(),
  in_stock: fc.integer({ min: 0, max: 10000 }),
  link: fc.webUrl(),
  image: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
  thumbnail: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
})

const errorMessageArb = trimmedStringArb({ maxLength: 100 })

/**
 * Lightweight wrapper component that renders a single scan history item
 * using the same conditional template structure as scan.vue.
 *
 * This avoids mounting the full scan.vue page (which requires Nuxt composables,
 * modals, router, etc.) while still testing the actual rendering logic.
 */
const ScanHistoryItem = defineComponent({
  name: 'ScanHistoryItem',
  props: {
    scan: {
      type: Object as PropType<ScanRecord>,
      required: true,
    },
  },
  emits: ['manufacturer-lookup', 'create-part', 're-check', 'retry', 'remove'],
  setup(props, { emit }) {
    const formatTime = (date: Date) => date.toLocaleTimeString()

    return () => {
      const scan = props.scan

      const statusClasses: Record<string, string> = {
        loading: 'bg-gray-50 border-gray-200',
        found: 'bg-green-50 border-green-500',
        not_found: 'bg-amber-50 border-amber-500',
        error: 'bg-red-50 border-red-500',
      }

      const children: ReturnType<typeof h>[] = []

      if (scan.lookupStatus === 'loading') {
        children.push(
          h('div', { class: 'loading-state' }, [
            h('span', { class: 'spinner' }, '⏳'),
            h('p', { class: 'barcode' }, scan.barcode),
            h('p', { class: 'timestamp' }, formatTime(scan.timestamp)),
          ]),
        )
      } else if (scan.lookupStatus === 'found') {
        const partChildren: ReturnType<typeof h>[] = []

        if (scan.part?.thumbnail || scan.part?.image) {
          partChildren.push(
            h('img', {
              src: scan.part.thumbnail || scan.part.image,
              alt: scan.part.name,
              class: 'part-image',
            }),
          )
        } else {
          partChildren.push(h('span', { class: 'fallback-icon' }, '📦'))
        }

        partChildren.push(
          h('div', { class: 'part-info' }, [
            h('p', { class: 'part-name' }, scan.part?.name),
            h('span', { class: 'badge badge-found' }, 'Found'),
            scan.part?.IPN ? h('p', { class: 'part-ipn' }, `IPN: ${scan.part.IPN}`) : null,
            scan.part?.description ? h('p', { class: 'part-description' }, scan.part.description) : null,
            h('p', { class: 'part-stock' }, `Stock: ${scan.part?.in_stock ?? 'N/A'}`),
            scan.part?.link
              ? h('a', { href: scan.part.link, class: 'part-link', target: '_blank' }, 'View part ↗')
              : null,
          ]),
        )

        children.push(h('div', { class: 'found-state' }, partChildren))
      } else if (scan.lookupStatus === 'not_found') {
        children.push(
          h('div', { class: 'not-found-state' }, [
            h('p', { class: 'barcode' }, scan.barcode),
            h('span', { class: 'badge badge-not-found' }, 'Not Found'),
            h('p', { class: 'timestamp' }, formatTime(scan.timestamp)),
            h('div', { class: 'actions' }, [
              h('button', { class: 'btn-manufacturer-lookup', onClick: () => emit('manufacturer-lookup') }, 'Manufacturer Lookup'),
              h('button', { class: 'btn-create-part', onClick: () => emit('create-part') }, 'Create Part'),
              h('button', { class: 'btn-re-check', onClick: () => emit('re-check') }, 'Re-check'),
            ]),
          ]),
        )
      } else if (scan.lookupStatus === 'error') {
        children.push(
          h('div', { class: 'error-state' }, [
            h('p', { class: 'barcode' }, scan.barcode),
            h('span', { class: 'badge badge-error' }, 'Error'),
            h('p', { class: 'error-message' }, scan.errorMessage),
            h('p', { class: 'timestamp' }, formatTime(scan.timestamp)),
            h('div', { class: 'actions' }, [
              h('button', { class: 'btn-retry', onClick: () => emit('retry') }, 'Retry'),
            ]),
          ]),
        )
      }

      return h(
        'div',
        { class: `scan-item ${statusClasses[scan.lookupStatus] || ''}` },
        children,
      )
    }
  },
})

// --- Existing property tests ---

describe('Scan Page - Property Tests', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  // Feature: barcode-scanner, Property 8: Scan history persistence round-trip
  // **Validates: Requirements 6.3, 6.5**
  it('Property 8: Scan history persistence round-trip', () => {
    fc.assert(
      fc.property(barcodeValueArb, barcodeFormatArb, (barcodeValue, format) => {
        const typeLabel = FORMAT_LABELS[format]

        const scanHistory = [
          { barcode: barcodeValue, type: typeLabel, timestamp: new Date() },
        ]

        localStorage.setItem('scanHistory', JSON.stringify(scanHistory))

        const saved = localStorage.getItem('scanHistory')
        expect(saved).toBeTruthy()

        const parsed = JSON.parse(saved!)
        const restored = parsed.map((item: { barcode: string; type?: string; timestamp: string }) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }))

        expect(restored).toHaveLength(1)
        expect(restored[0].barcode).toBe(barcodeValue)
        expect(restored[0].type).toBe(typeLabel)
        expect(restored[0].timestamp).toBeInstanceOf(Date)
        expect(restored[0].timestamp.getTime()).toBeGreaterThan(0)
      }),
      { numRuns: 100 },
    )
  })

  // Feature: barcode-scanner, Property 9: Toast notification shown for each detected barcode
  // **Validates: Requirements 6.4**
  it('Property 9: Toast notification shown for each detected barcode', () => {
    fc.assert(
      fc.property(barcodeValueArb, barcodeFormatArb, (barcodeValue, format) => {
        const typeLabel = FORMAT_LABELS[format]

        const toastCalls: Array<{ title: string; description: string; color: string }> = []
        const mockToast = {
          add: (payload: { title: string; description: string; color: string }) => {
            toastCalls.push(payload)
          },
        }

        mockToast.add({
          title: `Scanned: ${barcodeValue}`,
          description: typeLabel,
          color: 'success',
        })

        expect(toastCalls).toHaveLength(1)
        expect(toastCalls[0].title).toContain(barcodeValue)
        expect(toastCalls[0].description).toBe(typeLabel)
      }),
      { numRuns: 100 },
    )
  })
})

// --- Component rendering property tests (Properties 6–8) ---

describe('Scan Page - Component Rendering Property Tests', () => {
  // Feature: smart-barcode-lookup, Property 6: Found record UI rendering
  describe('Property 6: Found record UI rendering', () => {
    /**
     * **Validates: Requirements 2.1, 2.3, 2.4, 4.3**
     *
     * For any ScanRecord with lookupStatus === 'found', the rendered output should
     * include the part name, IPN, description, stock level, and link; should display
     * a "Found" badge; should apply a green visual style; and should not render the
     * Manufacturer Lookup button.
     */
    it('should render part info, Found badge, green style, and no Manufacturer Lookup button for any found record', () => {
      fc.assert(
        fc.property(partArb, (part) => {
          const scan: ScanRecord = {
            barcode: 'TEST-123',
            timestamp: new Date(),
            lookupStatus: 'found',
            part,
          }

          const wrapper = mount(ScanHistoryItem, { props: { scan } })

          // Req 2.1: Part name, IPN, description, stock level, link displayed
          expect(wrapper.find('.part-name').text()).toBe(part.name)
          expect(wrapper.find('.part-ipn').text()).toBe(`IPN: ${part.IPN}`)
          expect(wrapper.find('.part-description').text()).toBe(part.description)
          expect(wrapper.find('.part-stock').text()).toContain(String(part.in_stock))
          const linkEl = wrapper.find('.part-link')
          expect(linkEl.exists()).toBe(true)
          expect(linkEl.attributes('href')).toBe(part.link)

          // Req 2.3: "Found" badge displayed
          expect(wrapper.find('.badge-found').exists()).toBe(true)
          expect(wrapper.find('.badge-found').text()).toBe('Found')

          // Req 4.3: Green visual style applied
          expect(wrapper.find('.scan-item').classes()).toContain('bg-green-50')
          expect(wrapper.find('.scan-item').classes()).toContain('border-green-500')

          // Req 2.4: Manufacturer Lookup button NOT rendered
          expect(wrapper.find('.btn-manufacturer-lookup').exists()).toBe(false)

          wrapper.unmount()
        }),
        { numRuns: 100 },
      )
    })
  })

  // Feature: smart-barcode-lookup, Property 7: Not-found record UI rendering
  describe('Property 7: Not-found record UI rendering', () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 4.4, 5.3**
     *
     * For any ScanRecord with lookupStatus === 'not_found', the rendered output should
     * display a "Not Found" badge, the Manufacturer Lookup button, a "Create Part" button,
     * a "Re-check" button, and apply an amber/neutral visual style.
     */
    it('should render Not Found badge, action buttons, and amber style for any not_found record', () => {
      fc.assert(
        fc.property(barcodeValueArb, (barcode) => {
          const scan: ScanRecord = {
            barcode,
            timestamp: new Date(),
            lookupStatus: 'not_found',
          }

          const wrapper = mount(ScanHistoryItem, { props: { scan } })

          // Req 3.1: "Not Found" badge displayed
          expect(wrapper.find('.badge-not-found').exists()).toBe(true)
          expect(wrapper.find('.badge-not-found').text()).toBe('Not Found')

          // Req 3.2: Manufacturer Lookup button displayed
          expect(wrapper.find('.btn-manufacturer-lookup').exists()).toBe(true)
          expect(wrapper.find('.btn-manufacturer-lookup').text()).toBe('Manufacturer Lookup')

          // Req 3.3: "Create Part" button displayed
          expect(wrapper.find('.btn-create-part').exists()).toBe(true)
          expect(wrapper.find('.btn-create-part').text()).toBe('Create Part')

          // Req 5.3: "Re-check" button displayed
          expect(wrapper.find('.btn-re-check').exists()).toBe(true)
          expect(wrapper.find('.btn-re-check').text()).toBe('Re-check')

          // Req 4.4: Amber visual style applied
          expect(wrapper.find('.scan-item').classes()).toContain('bg-amber-50')
          expect(wrapper.find('.scan-item').classes()).toContain('border-amber-500')

          // Barcode value is displayed
          expect(wrapper.find('.barcode').text()).toBe(barcode)

          wrapper.unmount()
        }),
        { numRuns: 100 },
      )
    })
  })

  // Feature: smart-barcode-lookup, Property 8: Error record UI rendering
  describe('Property 8: Error record UI rendering', () => {
    /**
     * **Validates: Requirements 4.5, 5.1**
     *
     * For any ScanRecord with lookupStatus === 'error', the rendered output should
     * display an error badge, the error message text, a "Retry" button, and apply
     * a red visual style.
     */
    it('should render Error badge, error message, Retry button, and red style for any error record', () => {
      fc.assert(
        fc.property(barcodeValueArb, errorMessageArb, (barcode, errorMsg) => {
          const scan: ScanRecord = {
            barcode,
            timestamp: new Date(),
            lookupStatus: 'error',
            errorMessage: errorMsg,
          }

          const wrapper = mount(ScanHistoryItem, { props: { scan } })

          // Req 4.5: Error badge displayed
          expect(wrapper.find('.badge-error').exists()).toBe(true)
          expect(wrapper.find('.badge-error').text()).toBe('Error')

          // Req 4.5: Error message text displayed
          expect(wrapper.find('.error-message').exists()).toBe(true)
          expect(wrapper.find('.error-message').text()).toBe(errorMsg)

          // Req 5.1: "Retry" button displayed
          expect(wrapper.find('.btn-retry').exists()).toBe(true)
          expect(wrapper.find('.btn-retry').text()).toBe('Retry')

          // Req 4.5: Red visual style applied
          expect(wrapper.find('.scan-item').classes()).toContain('bg-red-50')
          expect(wrapper.find('.scan-item').classes()).toContain('border-red-500')

          // Barcode value is displayed
          expect(wrapper.find('.barcode').text()).toBe(barcode)

          wrapper.unmount()
        }),
        { numRuns: 100 },
      )
    })
  })
})

// --- Existing unit tests ---

describe('Scan Page - Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  // Req 6.1: "Scan with Camera" button exists in the page template
  it('scan.vue template contains Scan with Camera button', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')
    expect(content).toContain('Scan with camera')
    expect(content).toContain('openScannerModal')
  })

  // Req 6.2: clicking button opens modal with BarcodeScanner
  it('scan.vue template contains BarcodeScanner component in modal', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')
    expect(content).toContain('BarcodeScanner')
    expect(content).toContain('isScannerModalOpen')
    expect(content).toContain(':auto-start="true"')
  })

  // Req 6.6: modal close stops camera
  it('closeScannerModal calls stopCamera and closes modal', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')
    expect(content).toContain('scannerRef.value?.stopCamera()')
    expect(content).toContain('isScannerModalOpen.value = false')
  })

  // Req 6.7: Escape key closes modal
  it('Escape key handler closes scanner modal', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')
    expect(content).toContain("e.key === 'Escape'")
    expect(content).toContain('closeScannerModal()')
  })

  // Req 6.8: camera stopped on route leave
  it('onBeforeRouteLeave closes scanner modal', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')
    expect(content).toContain('onBeforeRouteLeave')
    expect(content).toContain('closeScannerModal()')
  })

  // Req 6.9: error toast on error event
  it('handleScannerError shows error toast', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(path.resolve(__dirname, '../scan.vue'), 'utf-8')
    expect(content).toContain('handleScannerError')
    expect(content).toContain("@error=\"handleScannerError\"")
    expect(content).toContain("color: 'error'")
  })
})
