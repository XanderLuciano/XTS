/**
 * Composable for managing a local USB Zebra printer via WebUSB.
 *
 * Provides connect/disconnect/print functionality and persists
 * the paired device across page reloads (browser handles re-pairing).
 */
import { ref, computed } from 'vue'

export interface LocalPrinterState {
  device: USBDevice | null
  interfaceNumber: number
  endpointNumber: number
}

const state = ref<LocalPrinterState | null>(null)
const isConnecting = ref(false)
const lastError = ref<string | null>(null)
const supported = ref(false)
let eventsRegistered = false

export function useLocalPrinter() {
  const isSupported = computed(() => supported.value)

  const isConnected = computed(() => state.value?.device?.opened ?? false)

  /**
   * Register USB connect/disconnect event listeners.
   * Call this once (e.g. on mount) to keep reactive state in sync
   * when the user physically plugs/unplugs the device.
   * Also initializes the `supported` ref on the client side.
   */
  function listenForUsbEvents(): void {
    if (import.meta.server) return

    // Detect support on the client (must happen after hydration)
    supported.value = typeof navigator !== 'undefined' && 'usb' in navigator

    if (!supported.value || eventsRegistered) return
    eventsRegistered = true

    navigator.usb.addEventListener('disconnect', (event: USBConnectionEvent) => {
      // If the disconnected device is our current printer, clear state
      if (state.value?.device === event.device) {
        state.value = null
        lastError.value = 'Printer was disconnected'
      }
    })

    navigator.usb.addEventListener('connect', async (_event: USBConnectionEvent) => {
      // If we don't currently have a connected printer, try to reconnect
      // to any previously-paired device that just appeared
      if (!state.value) {
        try {
          const devices = await navigator.usb.getDevices()
          if (devices.length > 0) {
            await openDevice(devices[0]!)
          }
        } catch {
          // Ignore — user can manually connect
        }
      }
    })
  }

  const connectedPrinterName = computed(() => {
    if (!state.value?.device) return null
    const d = state.value.device
    return d.productName || d.manufacturerName || `USB Device (${d.vendorId.toString(16)}:${d.productId.toString(16)})`
  })

  /**
   * Open the USB device picker and connect to a Zebra printer.
   * The browser remembers the pairing, so subsequent visits can reconnect
   * without showing the picker again.
   */
  async function connect(): Promise<boolean> {
    if (!isSupported.value) {
      lastError.value = 'WebUSB is not supported in this browser'
      return false
    }

    isConnecting.value = true
    lastError.value = null

    try {
      // Request a USB device — filter for Zebra vendor ID (0x0A5F)
      // Also allow any device in case of third-party Zebra-compatible printers
      const device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: 0x0A5F }, // Zebra Technologies
          { vendorId: 0x04B8 }  // Seiko Epson (some label printers)
        ]
      })

      await openDevice(device)
      return true
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        // User cancelled the picker — not an error
        lastError.value = null
        return false
      }
      lastError.value = error.message || 'Failed to connect to printer'
      return false
    } finally {
      isConnecting.value = false
    }
  }

  /**
   * Try to reconnect to a previously paired device without showing the picker.
   */
  async function reconnect(): Promise<boolean> {
    if (!isSupported.value) return false

    try {
      const devices = await navigator.usb.getDevices()
      if (devices.length === 0) return false

      // Try the first available previously-paired device
      await openDevice(devices[0]!)
      return true
    } catch {
      return false
    }
  }

  /**
   * Open and claim a USB device for printing.
   */
  async function openDevice(device: USBDevice): Promise<void> {
    await device.open()

    // Select configuration (usually only one)
    if (device.configuration === null) {
      await device.selectConfiguration(1)
    }

    // Find a bulk OUT endpoint for sending data
    const iface = device.configuration!.interfaces.find(i =>
      i.alternate.endpoints.some(ep => ep.direction === 'out' && ep.type === 'bulk')
    )

    if (!iface) {
      await device.close()
      throw new Error('No suitable USB interface found on this device')
    }

    const endpoint = iface.alternate.endpoints.find(
      ep => ep.direction === 'out' && ep.type === 'bulk'
    )

    if (!endpoint) {
      await device.close()
      throw new Error('No bulk OUT endpoint found')
    }

    await device.claimInterface(iface.interfaceNumber)

    state.value = {
      device,
      interfaceNumber: iface.interfaceNumber,
      endpointNumber: endpoint.endpointNumber
    }
  }

  /**
   * Disconnect from the current device.
   */
  async function disconnect(): Promise<void> {
    if (!state.value?.device) return

    try {
      await state.value.device.releaseInterface(state.value.interfaceNumber)
      await state.value.device.close()
    } catch {
      // Device may already be disconnected
    } finally {
      state.value = null
    }
  }

  /**
   * Send raw ZPL data to the connected printer.
   */
  async function printZpl(zpl: string): Promise<boolean> {
    if (!state.value?.device?.opened) {
      lastError.value = 'Printer is not connected'
      return false
    }

    lastError.value = null

    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(zpl)

      const result = await state.value.device.transferOut(
        state.value.endpointNumber,
        data
      )

      if (result.status !== 'ok') {
        throw new Error(`USB transfer failed with status: ${result.status}`)
      }

      return true
    } catch (error: any) {
      lastError.value = error.message || 'Failed to send data to printer'

      // If the device was disconnected, clean up state
      if (error.name === 'NotFoundError' || error.name === 'NetworkError') {
        state.value = null
      }

      return false
    }
  }

  return {
    isSupported,
    isConnected,
    isConnecting,
    connectedPrinterName,
    lastError,
    listenForUsbEvents,
    connect,
    reconnect,
    disconnect,
    printZpl
  }
}
