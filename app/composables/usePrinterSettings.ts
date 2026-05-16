/**
 * Composable for managing printer preference settings.
 *
 * Stores the user's preferred print method (server vs local USB)
 * and provides a unified print interface that routes to the correct output.
 */
import { ref, readonly } from 'vue'
import { composeLabelElements, elementsToZpl } from '~/utils/label'
import type { LabelData } from '~/utils/label'

export type PrintMethod = 'server' | 'local'

export interface PrinterSettings {
  defaultMethod: PrintMethod
}

const STORAGE_KEY = 'xts-printer-settings'

const settings = ref<PrinterSettings>({
  defaultMethod: 'server'
})

export function usePrinterSettings() {
  /**
   * Load settings from localStorage.
   */
  function load(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.defaultMethod === 'server' || parsed.defaultMethod === 'local') {
          settings.value.defaultMethod = parsed.defaultMethod
        }
      }
    } catch {
      // Ignore corrupted data
    }
  }

  /**
   * Save current settings to localStorage.
   */
  function save(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    } catch {
      // Ignore quota errors
    }
  }

  /**
   * Update the default print method.
   */
  function setDefaultMethod(method: PrintMethod): void {
    settings.value.defaultMethod = method
    save()
  }

  /**
   * Print a label using the server API (existing remote printer service).
   */
  async function printViaServer(data: LabelData): Promise<{ success: boolean; error?: string }> {
    const printerUrl = localStorage.getItem('zebra_printer_url') || ''
    const printerApiKey = localStorage.getItem('zebra_api_key') || ''

    try {
      await $fetch('/api/print-label', {
        method: 'POST',
        body: {
          barcode: data.barcode,
          partName: data.partName,
          partNumber: data.partNumber,
          quantity: data.quantity,
          vendor: data.vendor,
          printerUrl: printerUrl || undefined,
          apiKey: printerApiKey || undefined
        }
      })
      return { success: true }
    } catch (error: any) {
      const message = error?.data?.message || error?.message || 'Server print failed'
      return { success: false, error: message }
    }
  }

  /**
   * Print a label directly to a local USB printer via WebUSB.
   */
  async function printViaLocal(data: LabelData): Promise<{ success: boolean; error?: string }> {
    const { isConnected, printZpl, lastError } = useLocalPrinter()
    const { widthDots, heightDots, load: loadConfig } = useLocalPrinterConfig()

    loadConfig()

    if (!isConnected.value) {
      return { success: false, error: 'Local printer is not connected' }
    }

    const elements = composeLabelElements(data, widthDots.value, heightDots.value)
    const zpl = elementsToZpl(elements)
    const ok = await printZpl(zpl)

    if (!ok) {
      return { success: false, error: lastError.value || 'Failed to print locally' }
    }

    return { success: true }
  }

  /**
   * Print using the user's preferred method.
   * Returns result and which method was used.
   */
  async function print(data: LabelData): Promise<{ success: boolean; method: PrintMethod; error?: string }> {
    const method = settings.value.defaultMethod

    if (method === 'local') {
      const result = await printViaLocal(data)
      return { ...result, method: 'local' }
    }

    const result = await printViaServer(data)
    return { ...result, method: 'server' }
  }

  return {
    settings: readonly(settings),
    load,
    save,
    setDefaultMethod,
    printViaServer,
    printViaLocal,
    print
  }
}
