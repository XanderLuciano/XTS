import type { Ref } from 'vue'

/** Supported 1D barcode formats */
export type Barcode1DFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e' | 'code_128'

/** Supported 2D barcode formats */
export type Barcode2DFormat = 'qr_code' | 'data_matrix' | 'pdf417' | 'aztec'

/** All supported barcode formats */
export type BarcodeFormat = Barcode1DFormat | Barcode2DFormat

/** Map from raw detection format to human-readable Barcode_Type label */
export const FORMAT_LABELS: Record<BarcodeFormat, string> = {
  ean_13: '1D - EAN-13',
  ean_8: '1D - EAN-8',
  upc_a: '1D - UPC-A',
  upc_e: '1D - UPC-E',
  code_128: '1D - Code 128',
  qr_code: '2D - QR Code',
  data_matrix: '2D - Data Matrix',
  pdf417: '2D - PDF417',
  aztec: '2D - Aztec',
}

export interface ScanResult {
  /** The decoded barcode string */
  value: string
  /** Human-readable type label, e.g. "1D - EAN-13" */
  type: string
  /** Raw format identifier from the detection library */
  rawFormat: string
  /** Bounding box of the detected barcode region (if available) */
  boundingBox?: { x: number; y: number; width: number; height: number }
}

export interface UseScannerOptions {
  /** Restrict detection to specific barcode formats */
  formats?: BarcodeFormat[]
  /** Cooldown in ms before reporting the same barcode value again. Default: 3000 */
  cooldownMs?: number
  /** Preferred camera device ID */
  cameraDeviceId?: string
  /** Callback invoked when a barcode is detected (after cooldown check) */
  onDetected?: (result: ScanResult) => void
}

export interface UseScanner {
  isActive: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  availableCameras: Readonly<Ref<MediaDeviceInfo[]>>
  lastResult: Readonly<Ref<ScanResult | null>>
  startCamera: (deviceId?: string) => Promise<void>
  stopCamera: () => void
  switchCamera: (deviceId: string) => Promise<void>
  videoRef: Ref<HTMLVideoElement | null>
}
