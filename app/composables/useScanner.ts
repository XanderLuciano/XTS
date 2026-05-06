import { ref, readonly, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { UseScannerOptions, UseScanner, ScanResult, BarcodeFormat } from '~/types/scanner'
import { FORMAT_LABELS } from '~/types/scanner'

/** All supported formats as default when none specified */
const ALL_FORMATS: BarcodeFormat[] = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128',
  'qr_code', 'data_matrix', 'pdf417', 'aztec',
]

/** Map our internal format names to zxing-wasm format names */
const ZXING_FORMAT_MAP: Record<BarcodeFormat, string> = {
  ean_13: 'EAN13',
  ean_8: 'EAN8',
  upc_a: 'UPCA',
  upc_e: 'UPCE',
  code_128: 'Code128',
  qr_code: 'QRCode',
  data_matrix: 'DataMatrix',
  pdf417: 'PDF417',
  aztec: 'Aztec',
}

/** Reverse map from zxing-wasm format names back to our internal format */
const ZXING_FORMAT_REVERSE: Record<string, BarcodeFormat> = Object.fromEntries(
  Object.entries(ZXING_FORMAT_MAP).map(([k, v]) => [v, k as BarcodeFormat]),
) as Record<string, BarcodeFormat>

/** Reverse map from native BarcodeDetector format names to our internal format.
 *  Native API uses the same names as our internal format. */
const NATIVE_FORMAT_REVERSE: Record<string, BarcodeFormat> = Object.fromEntries(
  ALL_FORMATS.map(f => [f, f]),
) as Record<string, BarcodeFormat>

export const useScanner = (options: UseScannerOptions = {}): UseScanner => {
  const isActive = ref(false)
  const error = ref<string | null>(null)
  const availableCameras = ref<MediaDeviceInfo[]>([])
  const lastResult = ref<ScanResult | null>(null)
  const videoRef = ref<HTMLVideoElement | null>(null) as Ref<HTMLVideoElement | null>

  const cooldownMs = options.cooldownMs ?? 3000
  const formats = options.formats ?? ALL_FORMATS
  const cooldownMap = new Map<string, number>()

  let currentStream: MediaStream | null = null
  let detectionFrameId: number | null = null
  let lastResultTimeout: ReturnType<typeof setTimeout> | null = null

  const stopDetectionLoop = () => {
    if (detectionFrameId !== null) {
      cancelAnimationFrame(detectionFrameId)
      detectionFrameId = null
    }
  }

  const handleDetection = (value: string, rawFormat: string, internalFormat: BarcodeFormat, boundingBox?: ScanResult['boundingBox']) => {
    const now = Date.now()
    const lastSeen = cooldownMap.get(value)
    if (lastSeen !== undefined && now - lastSeen < cooldownMs) {
      return // Still in cooldown
    }
    cooldownMap.set(value, now)

    const result: ScanResult = {
      value,
      type: FORMAT_LABELS[internalFormat],
      rawFormat,
      boundingBox,
    }
    lastResult.value = result
    options.onDetected?.(result)

    // Clear lastResult after cooldown so the guide overlay reappears
    if (lastResultTimeout) clearTimeout(lastResultTimeout)
    lastResultTimeout = setTimeout(() => {
      lastResult.value = null
    }, cooldownMs)
  }

  /** Attempt detection using the native BarcodeDetector API */
  const detectWithNative = async (detector: InstanceType<typeof BarcodeDetector>, video: HTMLVideoElement) => {
    try {
      const barcodes = await detector.detect(video)
      for (const barcode of barcodes) {
        const internalFormat = NATIVE_FORMAT_REVERSE[barcode.format]
        if (!internalFormat) continue
        const bb = barcode.boundingBox
        handleDetection(
          barcode.rawValue,
          barcode.format,
          internalFormat,
          bb ? { x: bb.x, y: bb.y, width: bb.width, height: bb.height } : undefined,
        )
      }
    }
    catch {
      // Silently skip frame on transient detection errors
    }
  }

  /** Attempt detection using zxing-wasm fallback */
  const detectWithZxing = async (video: HTMLVideoElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, readerOptions: Record<string, unknown>) => {
    try {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      const { readBarcodes } = await import('zxing-wasm/reader')
      const results = await readBarcodes(imageData, readerOptions)
      for (const result of results) {
        if (!result.isValid) continue
        const internalFormat = ZXING_FORMAT_REVERSE[result.format]
        if (!internalFormat) continue
        const pos = result.position
        const xs = [pos.topLeft.x, pos.topRight.x, pos.bottomLeft.x, pos.bottomRight.x]
        const ys = [pos.topLeft.y, pos.topRight.y, pos.bottomLeft.y, pos.bottomRight.y]
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        handleDetection(
          result.text,
          result.format,
          internalFormat,
          { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY },
        )
      }
    }
    catch {
      // Silently skip frame on transient detection errors
    }
  }

  const startDetectionLoop = async () => {
    const video = videoRef.value
    if (!video) return

    // Determine whether to use native BarcodeDetector or zxing-wasm
    let useNative = false
    let nativeDetector: InstanceType<typeof BarcodeDetector> | null = null

    if (typeof globalThis.BarcodeDetector !== 'undefined') {
      try {
        const supported = await BarcodeDetector.getSupportedFormats()
        const allSupported = formats.every(f => supported.includes(f))
        if (allSupported) {
          nativeDetector = new BarcodeDetector({ formats })
          useNative = true
        }
      }
      catch {
        // Fall through to zxing-wasm
      }
    }

    // Prepare zxing-wasm fallback resources if needed
    let canvas: HTMLCanvasElement | null = null
    let ctx: CanvasRenderingContext2D | null = null
    let zxingReaderOptions: Record<string, unknown> = {}

    if (!useNative) {
      canvas = document.createElement('canvas')
      ctx = canvas.getContext('2d')
      zxingReaderOptions = {
        formats: formats.map(f => ZXING_FORMAT_MAP[f]),
        tryHarder: true,
        maxNumberOfSymbols: 1,
      }
    }

    const detect = async () => {
      if (!isActive.value || !videoRef.value) return

      if (useNative && nativeDetector) {
        await detectWithNative(nativeDetector, videoRef.value)
      }
      else if (canvas && ctx) {
        await detectWithZxing(videoRef.value, canvas, ctx, zxingReaderOptions)
      }

      if (isActive.value) {
        detectionFrameId = requestAnimationFrame(detect)
      }
    }

    detectionFrameId = requestAnimationFrame(detect)
  }

  const stopCamera = () => {
    stopDetectionLoop()
    if (lastResultTimeout) {
      clearTimeout(lastResultTimeout)
      lastResultTimeout = null
    }
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop())
      currentStream = null
    }
    if (videoRef.value) {
      videoRef.value.srcObject = null
    }
    isActive.value = false
  }

  const startCamera = async (deviceId?: string): Promise<void> => {
    error.value = null

    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'Your browser does not support camera access.'
      return
    }

    // Stop any existing stream before starting a new one
    stopCamera()

    const resolvedDeviceId = deviceId ?? options.cameraDeviceId

    const constraints: MediaStreamConstraints = {
      video: resolvedDeviceId
        ? { deviceId: { exact: resolvedDeviceId } }
        : { facingMode: 'environment' },
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      currentStream = stream

      // Bind stream to video element
      if (videoRef.value) {
        videoRef.value.srcObject = stream
        await videoRef.value.play()
      }

      // Listen for unexpected stream end
      const tracks = stream.getTracks()
      tracks.forEach((track) => {
        track.onended = () => {
          isActive.value = false
          error.value = 'Camera stream ended unexpectedly.'
          currentStream = null
          stopDetectionLoop()
        }
      })

      isActive.value = true

      // Enumerate devices after getting stream (labels are available after permission grant)
      const devices = await navigator.mediaDevices.enumerateDevices()
      availableCameras.value = devices.filter(d => d.kind === 'videoinput')

      if (availableCameras.value.length === 0) {
        stopCamera()
        error.value = 'No camera detected. Please connect a camera device.'
        return
      }

      // Start barcode detection loop
      startDetectionLoop()
    }
    catch (err: unknown) {
      const domError = err as DOMException
      if (domError.name === 'NotAllowedError') {
        error.value = 'Camera permission denied. Please allow camera access to scan barcodes.'
      }
      else if (domError.name === 'NotFoundError') {
        error.value = 'No camera detected. Please connect a camera device.'
      }
      else {
        error.value = domError.message || 'An unknown camera error occurred.'
      }
    }
  }

  const switchCamera = async (deviceId: string): Promise<void> => {
    await startCamera(deviceId)
  }

  onUnmounted(() => {
    stopCamera()
  })

  return {
    isActive: readonly(isActive),
    error: readonly(error),
    availableCameras: readonly(availableCameras),
    lastResult: readonly(lastResult),
    startCamera,
    stopCamera,
    switchCamera,
    videoRef,
  }
}
