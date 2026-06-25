/**
 * Ambient type declarations for experimental browser APIs that are not yet
 * part of the standard TypeScript DOM lib but are used by this app behind
 * feature-detection guards:
 *
 *  - WebUSB        (navigator.usb) — used by useLocalPrinter for USB Zebra printers
 *  - BarcodeDetector              — used by useScanner for native barcode detection
 *
 * These mirror the relevant parts of the W3C specs. They are intentionally
 * scoped to the members the app actually uses.
 */

export {}

declare global {
  // --- WebUSB ---------------------------------------------------------------

  interface USBEndpoint {
    readonly endpointNumber: number
    readonly direction: 'in' | 'out'
    readonly type: 'bulk' | 'interrupt' | 'isochronous'
  }

  interface USBAlternateInterface {
    readonly endpoints: USBEndpoint[]
  }

  interface USBInterface {
    readonly interfaceNumber: number
    readonly alternate: USBAlternateInterface
  }

  interface USBConfiguration {
    readonly interfaces: USBInterface[]
  }

  interface USBOutTransferResult {
    readonly bytesWritten: number
    readonly status: 'ok' | 'stall' | 'babble'
  }

  interface USBDevice {
    readonly opened: boolean
    readonly configuration: USBConfiguration | null
    readonly vendorId: number
    readonly productId: number
    readonly productName?: string
    readonly manufacturerName?: string
    readonly serialNumber?: string
    open(): Promise<void>
    close(): Promise<void>
    selectConfiguration(configurationValue: number): Promise<void>
    claimInterface(interfaceNumber: number): Promise<void>
    releaseInterface(interfaceNumber: number): Promise<void>
    transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>
  }

  interface USBConnectionEvent extends Event {
    readonly device: USBDevice
  }

  interface USBDeviceFilter {
    vendorId?: number
    productId?: number
  }

  interface USBDeviceRequestOptions {
    filters: USBDeviceFilter[]
  }

  interface USB extends EventTarget {
    getDevices(): Promise<USBDevice[]>
    requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>
    addEventListener(
      type: 'connect' | 'disconnect',
      listener: (event: USBConnectionEvent) => void
    ): void
    removeEventListener(
      type: 'connect' | 'disconnect',
      listener: (event: USBConnectionEvent) => void
    ): void
  }

  interface Navigator {
    readonly usb: USB
  }

  // --- BarcodeDetector ------------------------------------------------------

  interface DetectedBarcode {
    readonly rawValue: string
    readonly format: string
    readonly boundingBox: DOMRectReadOnly
  }

  interface BarcodeDetectorOptions {
    formats?: string[]
  }

  interface BarcodeDetector {
    detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>
  }

  // Declared as a var so it's accessible via `globalThis.BarcodeDetector`,
  // supports `new BarcodeDetector()`, `BarcodeDetector.getSupportedFormats()`,
  // and `InstanceType<typeof BarcodeDetector>`.
  var BarcodeDetector: {
    new (options?: BarcodeDetectorOptions): BarcodeDetector
    getSupportedFormats(): Promise<string[]>
  }
}
