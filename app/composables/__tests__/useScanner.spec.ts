import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { useScanner } from '../useScanner'
import { FORMAT_LABELS } from '~/types/scanner'
import type { BarcodeFormat } from '~/types/scanner'
import { createApp, defineComponent, h } from 'vue'

// Helper to run a composable inside a real Vue component context (provides onUnmounted etc.)
function withSetup<T>(composableFn: () => T): { result: T, unmount: () => void } {
  let result!: T
  const app = createApp(defineComponent({
    setup() {
      result = composableFn()
      return () => h('div')
    }
  }))
  const root = document.createElement('div')
  app.mount(root)
  return { result, unmount: () => app.unmount() }
}

// Arbitrary: generate a list of camera device objects (1-8 devices, each with a random deviceId)
const cameraListArb = fc.array(
  fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0),
  { minLength: 1, maxLength: 8 }
)

describe('useScanner - Property Tests', () => {
  let originalMediaDevices: MediaDevices
  let originalBarcodeDetector: unknown
  let originalRAF: typeof globalThis.requestAnimationFrame
  let originalCAF: typeof globalThis.cancelAnimationFrame

  beforeEach(() => {
    // Save originals
    originalMediaDevices = navigator.mediaDevices
    originalBarcodeDetector = (globalThis as Record<string, unknown>).BarcodeDetector
    originalRAF = globalThis.requestAnimationFrame
    originalCAF = globalThis.cancelAnimationFrame

    // Stub requestAnimationFrame / cancelAnimationFrame to prevent detection loop from running
    globalThis.requestAnimationFrame = vi.fn().mockReturnValue(1)
    globalThis.cancelAnimationFrame = vi.fn()

    // Remove BarcodeDetector so the composable doesn't try to use it
    delete (globalThis as Record<string, unknown>).BarcodeDetector
  })

  afterEach(() => {
    // Restore originals
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

  // Feature: barcode-scanner, Property 1: startCamera activates stream and populates available cameras
  // **Validates: Requirements 1.1, 1.4**
  it('Property 1: startCamera activates stream and populates available cameras', async () => {
    await fc.assert(
      fc.asyncProperty(cameraListArb, async (deviceIds) => {
        // Build mock MediaDeviceInfo list from generated device IDs
        const mockDevices: MediaDeviceInfo[] = deviceIds.map(id => ({
          deviceId: id,
          groupId: 'group-1',
          kind: 'videoinput' as MediaDeviceKind,
          label: `Camera ${id}`,
          toJSON: () => ({})
        }))

        // Also add a non-video device to ensure filtering works
        const allDevices: MediaDeviceInfo[] = [
          ...mockDevices,
          {
            deviceId: 'mic-1',
            groupId: 'group-2',
            kind: 'audioinput' as MediaDeviceKind,
            label: 'Microphone',
            toJSON: () => ({})
          }
        ]

        // Mock MediaStream with tracks
        const mockTrack = {
          stop: vi.fn(),
          onended: null as (() => void) | null,
          kind: 'video'
        }
        const mockStream = {
          getTracks: vi.fn().mockReturnValue([mockTrack])
        } as unknown as MediaStream

        const getUserMediaMock = vi.fn().mockResolvedValue(mockStream)
        const enumerateDevicesMock = vi.fn().mockResolvedValue(allDevices)

        Object.defineProperty(navigator, 'mediaDevices', {
          value: {
            getUserMedia: getUserMediaMock,
            enumerateDevices: enumerateDevicesMock
          },
          writable: true,
          configurable: true
        })

        const { result, unmount } = withSetup(() => useScanner())

        // videoRef is null so play() won't be called — composable handles this gracefully
        await result.startCamera()

        // Assert: isActive should be true after successful startCamera
        expect(result.isActive.value).toBe(true)

        // Assert: availableCameras should contain exactly the videoinput devices
        expect(result.availableCameras.value).toHaveLength(mockDevices.length)

        // Each available camera should match a videoinput device from our generated list
        const returnedIds = result.availableCameras.value.map(c => c.deviceId)
        const expectedIds = mockDevices.map(d => d.deviceId)
        expect(returnedIds).toEqual(expectedIds)

        // All returned cameras should be videoinput kind
        for (const cam of result.availableCameras.value) {
          expect(cam.kind).toBe('videoinput')
        }

        // Cleanup
        result.stopCamera()
        unmount()
      }),
      { numRuns: 100 }
    )
  })

  // Feature: barcode-scanner, Property 2: stopCamera stops all MediaStream tracks
  // **Validates: Requirements 1.2**
  it('Property 2: stopCamera stops all MediaStream tracks', async () => {
    const trackCountArb = fc.integer({ min: 1, max: 5 })

    await fc.assert(
      fc.asyncProperty(trackCountArb, async (numTracks) => {
        // Build N mock tracks, each with a stop spy
        const mockTracks = Array.from({ length: numTracks }, (_, i) => ({
          stop: vi.fn(),
          onended: null as (() => void) | null,
          kind: 'video',
          label: `track-${i}`
        }))

        const mockStream = {
          getTracks: vi.fn().mockReturnValue(mockTracks)
        } as unknown as MediaStream

        const getUserMediaMock = vi.fn().mockResolvedValue(mockStream)
        const enumerateDevicesMock = vi.fn().mockResolvedValue([
          {
            deviceId: 'cam-1',
            groupId: 'group-1',
            kind: 'videoinput' as MediaDeviceKind,
            label: 'Camera 1',
            toJSON: () => ({})
          }
        ])

        Object.defineProperty(navigator, 'mediaDevices', {
          value: {
            getUserMedia: getUserMediaMock,
            enumerateDevices: enumerateDevicesMock
          },
          writable: true,
          configurable: true
        })

        const { result, unmount } = withSetup(() => useScanner())

        // Start the camera to activate the stream
        await result.startCamera()
        expect(result.isActive.value).toBe(true)

        // Now stop the camera
        result.stopCamera()

        // Assert: stop() was called on every track
        for (const track of mockTracks) {
          expect(track.stop).toHaveBeenCalledOnce()
        }

        // Assert: isActive is false after stopCamera
        expect(result.isActive.value).toBe(false)

        // Assert: no active tracks remain (getTracks was called by stopCamera,
        // and every track's stop was invoked — the stream is fully released)
        const allStopped = mockTracks.every(t => t.stop.mock.calls.length === 1)
        expect(allStopped).toBe(true)

        unmount()
      }),
      { numRuns: 100 }
    )
  })

  // Feature: barcode-scanner, Property 3: cameraDeviceId is forwarded to getUserMedia constraints
  // **Validates: Requirements 1.7**
  it('Property 3: cameraDeviceId is forwarded to getUserMedia constraints', async () => {
    const deviceIdArb = fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0)

    await fc.assert(
      fc.asyncProperty(deviceIdArb, async (deviceId) => {
        // Mock MediaStream with a single track
        const mockTrack = {
          stop: vi.fn(),
          onended: null as (() => void) | null,
          kind: 'video'
        }
        const mockStream = {
          getTracks: vi.fn().mockReturnValue([mockTrack])
        } as unknown as MediaStream

        const getUserMediaMock = vi.fn().mockResolvedValue(mockStream)
        const enumerateDevicesMock = vi.fn().mockResolvedValue([
          {
            deviceId,
            groupId: 'group-1',
            kind: 'videoinput' as MediaDeviceKind,
            label: `Camera ${deviceId}`,
            toJSON: () => ({})
          }
        ])

        Object.defineProperty(navigator, 'mediaDevices', {
          value: {
            getUserMedia: getUserMediaMock,
            enumerateDevices: enumerateDevicesMock
          },
          writable: true,
          configurable: true
        })

        const { result, unmount } = withSetup(() => useScanner({ cameraDeviceId: deviceId }))

        await result.startCamera()

        // Assert: getUserMedia was called with the exact deviceId constraint
        expect(getUserMediaMock).toHaveBeenCalledWith({
          video: { deviceId: { exact: deviceId } }
        })

        // Cleanup
        result.stopCamera()
        unmount()
      }),
      { numRuns: 100 }
    )
  })

  // Feature: barcode-scanner, Property 4: Detection result contains correct value and format label
  // **Validates: Requirements 2.2, 2.5**
  it('Property 4: Detection result contains correct value and format label', async () => {
    const barcodeValueArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)
    const barcodeFormatArb = fc.constantFrom<BarcodeFormat>(
      'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128',
      'qr_code', 'data_matrix', 'pdf417', 'aztec'
    )

    await fc.assert(
      fc.asyncProperty(barcodeValueArb, barcodeFormatArb, async (value, format) => {
        // Track what onDetected receives
        const detectedResults: { value: string, type: string }[] = []
        const onDetected = vi.fn((result: { value: string, type: string }) => {
          detectedResults.push({ value: result.value, type: result.type })
        })

        // Mock MediaStream
        const mockTrack = { stop: vi.fn(), onended: null as (() => void) | null, kind: 'video' }
        const mockStream = { getTracks: vi.fn().mockReturnValue([mockTrack]) } as unknown as MediaStream

        const getUserMediaMock = vi.fn().mockResolvedValue(mockStream)
        const enumerateDevicesMock = vi.fn().mockResolvedValue([
          { deviceId: 'cam-1', groupId: 'g1', kind: 'videoinput' as MediaDeviceKind, label: 'Camera', toJSON: () => ({}) }
        ])

        Object.defineProperty(navigator, 'mediaDevices', {
          value: { getUserMedia: getUserMediaMock, enumerateDevices: enumerateDevicesMock },
          writable: true,
          configurable: true
        })

        // Mock native BarcodeDetector that returns our generated value and format
        const mockDetect = vi.fn().mockResolvedValue([
          {
            rawValue: value,
            format,
            boundingBox: { x: 0, y: 0, width: 100, height: 50 }
          }
        ])

        const allFormats: BarcodeFormat[] = [
          'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128',
          'qr_code', 'data_matrix', 'pdf417', 'aztec'
        ]

        ;(globalThis as Record<string, unknown>).BarcodeDetector = class MockBarcodeDetector {
          static getSupportedFormats = vi.fn().mockResolvedValue(allFormats)
          detect = mockDetect
        }

        // Capture the rAF callback so we can invoke the detection loop manually
        let rafCallback: FrameRequestCallback | null = null
        globalThis.requestAnimationFrame = vi.fn().mockImplementation((cb: FrameRequestCallback) => {
          rafCallback = cb
          return 1
        })

        const { result, unmount } = withSetup(() => useScanner({ onDetected }))

        // Create a mock video element with play() and srcObject stubbed
        const mockVideo = document.createElement('video')
        Object.defineProperty(mockVideo, 'videoWidth', { value: 640 })
        Object.defineProperty(mockVideo, 'videoHeight', { value: 480 })
        Object.defineProperty(mockVideo, 'srcObject', { value: null, writable: true, configurable: true })
        mockVideo.play = vi.fn().mockResolvedValue(undefined)
        result.videoRef.value = mockVideo

        // Start camera to activate the stream and kick off the detection loop
        await result.startCamera()
        expect(result.isActive.value).toBe(true)

        // The detection loop calls rAF — startDetectionLoop was invoked.
        // Now invoke the captured rAF callback to trigger one detection cycle.
        if (rafCallback) {
          await (rafCallback as FrameRequestCallback)(0)
        }

        // Allow microtasks (detect is async) to settle
        await new Promise(resolve => setTimeout(resolve, 0))

        // Assert: onDetected was called with the correct value and FORMAT_LABELS mapping
        expect(onDetected).toHaveBeenCalled()
        const received = onDetected.mock.calls[0]![0] as { value: string, type: string }
        expect(received.value).toBe(value)
        expect(received.type).toBe(FORMAT_LABELS[format])

        // Cleanup
        result.stopCamera()
        delete (globalThis as Record<string, unknown>).BarcodeDetector
        unmount()
      }),
      { numRuns: 100 }
    )
  })

  // Feature: barcode-scanner, Property 5: Cooldown prevents duplicate barcode reports within the cooldown window
  // **Validates: Requirements 2.6, 2.7**
  it('Property 5: Cooldown prevents duplicate barcode reports within the cooldown window', async () => {
    const barcodeValueArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)
    const cooldownMsArb = fc.integer({ min: 100, max: 10000 })

    await fc.assert(
      fc.asyncProperty(barcodeValueArb, cooldownMsArb, async (barcodeValue, cooldownMs) => {
        vi.useFakeTimers()

        const onDetected = vi.fn()

        // Mock MediaStream
        const mockTrack = { stop: vi.fn(), onended: null as (() => void) | null, kind: 'video' }
        const mockStream = { getTracks: vi.fn().mockReturnValue([mockTrack]) } as unknown as MediaStream

        const getUserMediaMock = vi.fn().mockResolvedValue(mockStream)
        const enumerateDevicesMock = vi.fn().mockResolvedValue([
          { deviceId: 'cam-1', groupId: 'g1', kind: 'videoinput' as MediaDeviceKind, label: 'Camera', toJSON: () => ({}) }
        ])

        Object.defineProperty(navigator, 'mediaDevices', {
          value: { getUserMedia: getUserMediaMock, enumerateDevices: enumerateDevicesMock },
          writable: true,
          configurable: true
        })

        // Mock native BarcodeDetector that always returns the same barcode
        const mockDetect = vi.fn().mockResolvedValue([
          {
            rawValue: barcodeValue,
            format: 'ean_13',
            boundingBox: { x: 0, y: 0, width: 100, height: 50 }
          }
        ])

        const allFormats: BarcodeFormat[] = [
          'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128',
          'qr_code', 'data_matrix', 'pdf417', 'aztec'
        ]

        ;(globalThis as Record<string, unknown>).BarcodeDetector = class MockBarcodeDetector {
          static getSupportedFormats = vi.fn().mockResolvedValue(allFormats)
          detect = mockDetect
        }

        // Capture rAF callbacks to manually trigger detection cycles
        let rafCallback: FrameRequestCallback | null = null
        globalThis.requestAnimationFrame = vi.fn().mockImplementation((cb: FrameRequestCallback) => {
          rafCallback = cb
          return 1
        })

        const { result, unmount } = withSetup(() => useScanner({ onDetected, cooldownMs }))

        // Create a mock video element
        const mockVideo = document.createElement('video')
        Object.defineProperty(mockVideo, 'videoWidth', { value: 640 })
        Object.defineProperty(mockVideo, 'videoHeight', { value: 480 })
        Object.defineProperty(mockVideo, 'srcObject', { value: null, writable: true, configurable: true })
        mockVideo.play = vi.fn().mockResolvedValue(undefined)
        result.videoRef.value = mockVideo

        // Start camera
        await result.startCamera()
        expect(result.isActive.value).toBe(true)

        // --- First detection at time T ---
        if (rafCallback) {
          await (rafCallback as FrameRequestCallback)(0)
        }
        await vi.advanceTimersByTimeAsync(0) // flush microtasks
        expect(onDetected).toHaveBeenCalledTimes(1)

        // --- Second detection within cooldown (T + cooldownMs - 1) ---
        vi.advanceTimersByTime(cooldownMs - 1)
        // Re-trigger detection loop
        if (rafCallback) {
          await (rafCallback as FrameRequestCallback)(0)
        }
        await vi.advanceTimersByTimeAsync(0)
        // Should still be 1 — cooldown blocks the duplicate
        expect(onDetected).toHaveBeenCalledTimes(1)

        // --- Third detection after cooldown has elapsed (advance remaining 1ms) ---
        vi.advanceTimersByTime(1)
        if (rafCallback) {
          await (rafCallback as FrameRequestCallback)(0)
        }
        await vi.advanceTimersByTimeAsync(0)
        // Should now be 2 — cooldown expired, barcode reported again
        expect(onDetected).toHaveBeenCalledTimes(2)

        // Cleanup
        result.stopCamera()
        delete (globalThis as Record<string, unknown>).BarcodeDetector
        vi.useRealTimers()
        unmount()
      }),
      { numRuns: 100 }
    )
  })
})

describe('useScanner - Unit Tests', () => {
  let originalMediaDevices: MediaDevices
  let originalBarcodeDetector: unknown
  let originalRAF: typeof globalThis.requestAnimationFrame
  let originalCAF: typeof globalThis.cancelAnimationFrame

  beforeEach(() => {
    originalMediaDevices = navigator.mediaDevices
    originalBarcodeDetector = (globalThis as Record<string, unknown>).BarcodeDetector
    originalRAF = globalThis.requestAnimationFrame
    originalCAF = globalThis.cancelAnimationFrame

    globalThis.requestAnimationFrame = vi.fn().mockReturnValue(1)
    globalThis.cancelAnimationFrame = vi.fn()

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

  // Helper to set up standard media device mocks
  function setupMediaDevices(overrides?: {
    getUserMedia?: ReturnType<typeof vi.fn>
    enumerateDevices?: ReturnType<typeof vi.fn>
  }) {
    const mockTrack = { stop: vi.fn(), onended: null as (() => void) | null, kind: 'video' }
    const mockStream = { getTracks: vi.fn().mockReturnValue([mockTrack]) } as unknown as MediaStream

    const getUserMedia = overrides?.getUserMedia ?? vi.fn().mockResolvedValue(mockStream)
    const enumerateDevices = overrides?.enumerateDevices ?? vi.fn().mockResolvedValue([
      { deviceId: 'cam-1', groupId: 'g1', kind: 'videoinput' as MediaDeviceKind, label: 'Camera 1', toJSON: () => ({}) }
    ])

    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia, enumerateDevices },
      writable: true,
      configurable: true
    })

    return { mockTrack, mockStream, getUserMedia, enumerateDevices }
  }

  // Req 1.8: default facingMode is 'environment' when no deviceId provided
  it('default facingMode is environment when no deviceId provided', async () => {
    const { getUserMedia } = setupMediaDevices()

    const { result, unmount } = withSetup(() => useScanner())
    await result.startCamera()

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' }
    })

    result.stopCamera()
    unmount()
  })

  // Req 1.5: permission denied sets specific error message
  it('permission denied sets specific error message', async () => {
    const permError = new DOMException('Permission denied', 'NotAllowedError')
    setupMediaDevices({
      getUserMedia: vi.fn().mockRejectedValue(permError)
    })

    const { result, unmount } = withSetup(() => useScanner())
    await result.startCamera()

    expect(result.error.value).toBe('Camera permission denied. Please allow camera access to scan barcodes.')

    unmount()
  })

  // Req 1.6: no camera available sets specific error message
  it('no camera available sets specific error message', async () => {
    const notFoundError = new DOMException('No device found', 'NotFoundError')
    setupMediaDevices({
      getUserMedia: vi.fn().mockRejectedValue(notFoundError)
    })

    const { result, unmount } = withSetup(() => useScanner())
    await result.startCamera()

    expect(result.error.value).toBe('No camera detected. Please connect a camera device.')

    unmount()
  })

  // Req 1.9: cleanup on unmount stops camera
  it('cleanup on unmount stops camera', async () => {
    const { mockTrack } = setupMediaDevices()

    const { result, unmount } = withSetup(() => useScanner())
    await result.startCamera()

    expect(result.isActive.value).toBe(true)

    // Unmount the component — should auto-stop camera
    unmount()

    expect(mockTrack.stop).toHaveBeenCalled()
  })

  // Req 2.3: all 1D formats in default format list
  it('all 1D formats in default format list', () => {
    const expected1DFormats: BarcodeFormat[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']

    for (const format of expected1DFormats) {
      expect(FORMAT_LABELS).toHaveProperty(format)
      expect(FORMAT_LABELS[format]).toMatch(/^1D - /)
    }
  })

  // Req 2.4: all 2D formats in default format list
  it('all 2D formats in default format list', () => {
    const expected2DFormats: BarcodeFormat[] = ['qr_code', 'data_matrix', 'pdf417', 'aztec']

    for (const format of expected2DFormats) {
      expect(FORMAT_LABELS).toHaveProperty(format)
      expect(FORMAT_LABELS[format]).toMatch(/^2D - /)
    }
  })
})
