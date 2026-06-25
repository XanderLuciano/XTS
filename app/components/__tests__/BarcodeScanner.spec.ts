import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import * as fc from 'fast-check'
import BarcodeScanner from '../BarcodeScanner.vue'

// Feature: barcode-scanner, Property 6: Component emits error event for any composable error
describe('BarcodeScanner - Property Tests', () => {
  let originalMediaDevices: MediaDevices
  let originalBarcodeDetector: unknown
  let originalRAF: typeof globalThis.requestAnimationFrame
  let originalCAF: typeof globalThis.cancelAnimationFrame

  beforeEach(() => {
    originalMediaDevices = navigator.mediaDevices
    originalBarcodeDetector = (globalThis as Record<string, unknown>).BarcodeDetector
    originalRAF = globalThis.requestAnimationFrame
    originalCAF = globalThis.cancelAnimationFrame

    // Stub rAF/cAF to prevent detection loop from running
    globalThis.requestAnimationFrame = vi.fn().mockReturnValue(1)
    globalThis.cancelAnimationFrame = vi.fn()

    // Remove BarcodeDetector so the composable doesn't try to use it
    delete (globalThis as Record<string, unknown>).BarcodeDetector
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      writable: true,
      configurable: true
    })
    if (originalBarcodeDetector) {
      (globalThis as Record<string, unknown>).BarcodeDetector = originalBarcodeDetector
    }
    globalThis.requestAnimationFrame = originalRAF
    globalThis.cancelAnimationFrame = originalCAF
    vi.restoreAllMocks()
  })

  // **Validates: Requirements 3.6**
  it('Property 6: Component emits error event for any composable error', async () => {
    const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)

    await fc.assert(
      fc.asyncProperty(errorMessageArb, async (errorMessage) => {
        // Mock getUserMedia to reject with a DOMException containing the generated message.
        // Use a generic name (not NotAllowedError/NotFoundError) so the composable
        // falls through to the else branch and uses domError.message directly.
        const getUserMediaMock = vi.fn().mockRejectedValue(
          new DOMException(errorMessage, 'AbortError')
        )

        Object.defineProperty(navigator, 'mediaDevices', {
          value: {
            getUserMedia: getUserMediaMock,
            enumerateDevices: vi.fn().mockResolvedValue([])
          },
          writable: true,
          configurable: true
        })

        const wrapper = mount(BarcodeScanner, {
          global: {
            stubs: { UIcon: true }
          }
        })

        // Call startCamera via the exposed method — this triggers getUserMedia rejection
        const vm = wrapper.vm as unknown as { startCamera: () => Promise<void> }
        await vm.startCamera()

        // Allow Vue watchers to flush (the component watches composable error and emits)
        await flushPromises()

        // Assert: the component emitted an 'error' event
        const emitted = wrapper.emitted('error')
        expect(emitted).toBeTruthy()
        expect(emitted!.length).toBeGreaterThanOrEqual(1)

        // The emitted error message should be the exact message from the DOMException
        const emittedMessage = emitted![emitted!.length - 1]![0]
        expect(emittedMessage).toBe(errorMessage)

        wrapper.unmount()
      }),
      { numRuns: 100 }
    )
  })

  // Feature: barcode-scanner, Property 7: Camera swap cycles through available devices
  // **Validates: Requirements 5.6, 5.7**
  it('Property 7: Camera swap cycles through available devices', async () => {
    const deviceIdArb = fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0)
    const cameraListArb = fc.array(deviceIdArb, { minLength: 2, maxLength: 8 })
      .filter(ids => new Set(ids).size === ids.length) // unique deviceIds

    await fc.assert(
      fc.asyncProperty(cameraListArb, async (deviceIds) => {
        const cameraDevices = deviceIds.map((id, index) => ({
          deviceId: id,
          kind: 'videoinput' as MediaDeviceKind,
          label: `Camera ${index + 1}`,
          groupId: `group-${index}`,
          toJSON: () => ({})
        }))

        // Each call to getUserMedia/switchCamera needs a fresh mock stream
        const createMockStream = () => {
          const track = { stop: vi.fn(), onended: null as (() => void) | null, kind: 'video' }
          return { getTracks: vi.fn().mockReturnValue([track]) } as unknown as MediaStream
        }

        const getUserMediaMock = vi.fn().mockImplementation(() => Promise.resolve(createMockStream()))
        const enumerateDevicesMock = vi.fn().mockResolvedValue(cameraDevices)

        Object.defineProperty(navigator, 'mediaDevices', {
          value: {
            getUserMedia: getUserMediaMock,
            enumerateDevices: enumerateDevicesMock
          },
          writable: true,
          configurable: true
        })

        const playMock = vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue()

        // Mock srcObject to accept our fake MediaStream (happy-dom rejects non-MediaStream values)
        const srcObjectDescriptor = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'srcObject')
        Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', {
          set: vi.fn(),
          get: vi.fn().mockReturnValue(null),
          configurable: true
        })

        const wrapper = mount(BarcodeScanner, {
          global: {
            stubs: { UIcon: true }
          }
        })

        // Start camera to populate availableCameras
        const vm = wrapper.vm as unknown as { startCamera: () => Promise<void> }
        await vm.startCamera()
        await flushPromises()
        await wrapper.vm.$nextTick()

        const N = deviceIds.length

        // Find the swap button (it's in the DOM via v-if, CSS hiding doesn't affect happy-dom)
        const swapButton = wrapper.find('button[aria-label="Switch camera"]')
        expect(swapButton.exists()).toBe(true)

        // Cycle through all cameras and verify each swap emits the correct deviceId
        for (let i = 0; i < N; i++) {
          const expectedIndex = (i + 1) % N
          const expectedDeviceId = deviceIds[expectedIndex]

          await swapButton.trigger('click')
          await flushPromises()
          await wrapper.vm.$nextTick()

          const emitted = wrapper.emitted('camera-switched')
          expect(emitted).toBeTruthy()
          expect(emitted!.length).toBe(i + 1)
          expect(emitted![i]![0]).toBe(expectedDeviceId)
        }

        // After N swaps we're back at index 0, next swap goes to index 1
        await swapButton.trigger('click')
        await flushPromises()

        const emitted = wrapper.emitted('camera-switched')
        expect(emitted!.length).toBe(N + 1)
        expect(emitted![N]![0]).toBe(deviceIds[1])

        wrapper.unmount()
        playMock.mockRestore()
        if (srcObjectDescriptor) {
          Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', srcObjectDescriptor)
        }
      }),
      { numRuns: 100 }
    )
  })
})

describe('BarcodeScanner - Unit Tests', () => {
  let originalMediaDevices: MediaDevices
  let originalBarcodeDetector: unknown
  let originalRAF: typeof globalThis.requestAnimationFrame
  let originalCAF: typeof globalThis.cancelAnimationFrame
  let srcObjectDescriptor: PropertyDescriptor | undefined
  let playMock: ReturnType<typeof vi.spyOn>

  function createMockStream() {
    const track = { stop: vi.fn(), onended: null as (() => void) | null, kind: 'video' }
    return { getTracks: vi.fn().mockReturnValue([track]) } as unknown as MediaStream
  }

  function setupMediaDevices(cameras: Array<{ deviceId: string, label: string }> = [{ deviceId: 'cam-1', label: 'Camera 1' }]) {
    const devices = cameras.map(c => ({
      deviceId: c.deviceId,
      kind: 'videoinput' as MediaDeviceKind,
      label: c.label,
      groupId: 'g1',
      toJSON: () => ({})
    }))

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockImplementation(() => Promise.resolve(createMockStream())),
        enumerateDevices: vi.fn().mockResolvedValue(devices)
      },
      writable: true,
      configurable: true
    })
  }

  beforeEach(() => {
    originalMediaDevices = navigator.mediaDevices
    originalBarcodeDetector = (globalThis as Record<string, unknown>).BarcodeDetector
    originalRAF = globalThis.requestAnimationFrame
    originalCAF = globalThis.cancelAnimationFrame

    globalThis.requestAnimationFrame = vi.fn().mockReturnValue(1)
    globalThis.cancelAnimationFrame = vi.fn()
    delete (globalThis as Record<string, unknown>).BarcodeDetector

    playMock = vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue()
    srcObjectDescriptor = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'srcObject')
    Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', {
      set: vi.fn(),
      get: vi.fn().mockReturnValue(null),
      configurable: true
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      writable: true,
      configurable: true
    })
    if (originalBarcodeDetector) {
      (globalThis as Record<string, unknown>).BarcodeDetector = originalBarcodeDetector
    }
    globalThis.requestAnimationFrame = originalRAF
    globalThis.cancelAnimationFrame = originalCAF
    playMock.mockRestore()
    if (srcObjectDescriptor) {
      Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', srcObjectDescriptor)
    }
    vi.restoreAllMocks()
  })

  // Req 3.2: props forwarded to composable
  it('accepts formats, cooldownMs, cameraDeviceId, showGuide, autoStart props', () => {
    setupMediaDevices()
    const wrapper = mount(BarcodeScanner, {
      props: { formats: ['qr_code'], cooldownMs: 5000, showGuide: false, autoStart: false },
      global: { stubs: { UIcon: true } }
    })
    expect(wrapper.props('formats')).toEqual(['qr_code'])
    expect(wrapper.props('cooldownMs')).toBe(5000)
    expect(wrapper.props('showGuide')).toBe(false)
    wrapper.unmount()
  })

  // Req 3.4, 3.5: camera-started / camera-stopped events
  it('emits camera-started when camera activates and camera-stopped when stopped', async () => {
    setupMediaDevices()
    const wrapper = mount(BarcodeScanner, {
      global: { stubs: { UIcon: true } }
    })
    const vm = wrapper.vm as unknown as { startCamera: () => Promise<void>, stopCamera: () => void }
    await vm.startCamera()
    await flushPromises()

    expect(wrapper.emitted('camera-started')).toBeTruthy()

    vm.stopCamera()
    await flushPromises()

    expect(wrapper.emitted('camera-stopped')).toBeTruthy()
    wrapper.unmount()
  })

  // Req 3.7, 3.8, 3.9: slots render custom content
  it('guide slot renders custom content', async () => {
    setupMediaDevices()
    const wrapper = mount(BarcodeScanner, {
      global: { stubs: { UIcon: true } },
      slots: { guide: '<div class="custom-guide">Custom Guide</div>' }
    })
    const vm = wrapper.vm as unknown as { startCamera: () => Promise<void> }
    await vm.startCamera()
    await flushPromises()

    expect(wrapper.find('.custom-guide').exists()).toBe(true)
    expect(wrapper.find('.custom-guide').text()).toBe('Custom Guide')
    wrapper.unmount()
  })

  it('feedback slot renders custom content', () => {
    setupMediaDevices()
    const wrapper = mount(BarcodeScanner, {
      global: { stubs: { UIcon: true } },
      slots: { feedback: '<div class="custom-feedback">Done</div>' }
    })
    expect(wrapper.find('.custom-feedback').exists()).toBe(true)
    wrapper.unmount()
  })

  // Req 4.1: video element present when active
  it('video element is present', async () => {
    setupMediaDevices()
    const wrapper = mount(BarcodeScanner, {
      global: { stubs: { UIcon: true } }
    })
    expect(wrapper.find('video').exists()).toBe(true)
    wrapper.unmount()
  })

  // Req 4.2: guide overlay visible when active and no detection
  it('guide overlay visible when active and no detection', async () => {
    setupMediaDevices()
    const wrapper = mount(BarcodeScanner, {
      global: { stubs: { UIcon: true } }
    })
    const vm = wrapper.vm as unknown as { startCamera: () => Promise<void> }
    await vm.startCamera()
    await flushPromises()

    expect(wrapper.find('.scanner-guide').exists()).toBe(true)
    wrapper.unmount()
  })

  // Req 4.6: startCamera/stopCamera exposed via template ref
  it('exposes startCamera and stopCamera via template ref', () => {
    setupMediaDevices()
    const wrapper = mount(BarcodeScanner, {
      global: { stubs: { UIcon: true } }
    })
    const vm = wrapper.vm as unknown as Record<string, unknown>
    expect(typeof vm.startCamera).toBe('function')
    expect(typeof vm.stopCamera).toBe('function')
    wrapper.unmount()
  })

  // Req 5.1: dropdown on desktop with multiple cameras
  it('shows select dropdown when multiple cameras available', async () => {
    setupMediaDevices([
      { deviceId: 'a', label: 'Front' },
      { deviceId: 'b', label: 'Rear' }
    ])
    const wrapper = mount(BarcodeScanner, {
      global: { stubs: { UIcon: true } }
    })
    const vm = wrapper.vm as unknown as { startCamera: () => Promise<void> }
    await vm.startCamera()
    await flushPromises()

    expect(wrapper.find('select').exists()).toBe(true)
    expect(wrapper.findAll('option')).toHaveLength(2)
    wrapper.unmount()
  })

  // Req 5.5: swap button on mobile with multiple cameras
  it('shows swap button when multiple cameras available', async () => {
    setupMediaDevices([
      { deviceId: 'a', label: 'Front' },
      { deviceId: 'b', label: 'Rear' }
    ])
    const wrapper = mount(BarcodeScanner, {
      global: { stubs: { UIcon: true } }
    })
    const vm = wrapper.vm as unknown as { startCamera: () => Promise<void> }
    await vm.startCamera()
    await flushPromises()

    expect(wrapper.find('button[aria-label="Switch camera"]').exists()).toBe(true)
    wrapper.unmount()
  })

  // Req 5.3: no selector with single camera
  it('hides camera selector when only one camera', async () => {
    setupMediaDevices([{ deviceId: 'only', label: 'Only Camera' }])
    const wrapper = mount(BarcodeScanner, {
      global: { stubs: { UIcon: true } }
    })
    const vm = wrapper.vm as unknown as { startCamera: () => Promise<void> }
    await vm.startCamera()
    await flushPromises()

    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Switch camera"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
