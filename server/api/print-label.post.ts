/**
 * API endpoint to print a Zebra label for a stock item.
 *
 * Accepts barcode, part name, part number, and optional quantity,
 * composes a label with text + QR elements, and sends it to the
 * Zebra label printer service.
 */

// Minimal type definitions matching the zebra-label-printer library
interface TextOptions {
  x: number
  y: number
  height?: number
  width?: number
  font?: string
  rotation?: 'N' | 'R' | 'I' | 'B'
  reverse?: boolean
}

interface QROptions {
  x: number
  y: number
  magnification?: number
  errorCorrection?: 'L' | 'M' | 'Q' | 'H'
}

interface BarcodeOptions {
  x: number
  y: number
  type: string        // e.g. "CODE128"
  height?: number
  narrowBarWidth?: number
}

type LabelElement =
  | { type: 'text'; content: string; options: TextOptions }
  | { type: 'qrcode'; content: string; options: QROptions }
  | { type: 'barcode'; content: string; options: BarcodeOptions }

interface PrintResult {
  success: boolean
  jobId?: string
  error?: string
}

interface PrintLabelBody {
  barcode: string
  partName: string
  partNumber: string
  quantity?: number
  printerUrl?: string
  apiKey?: string
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  const { barcode, partName, partNumber, quantity, printerUrl: bodyPrinterUrl, apiKey: bodyApiKey } =
    await readBody<PrintLabelBody>(event)

  // Client-provided values (from localStorage) take priority over env defaults
  const printerUrl = bodyPrinterUrl || config.public.zebraPrinterUrl as string
  const apiKey = bodyApiKey || config.public.zebraApiKey as string

  if (!printerUrl) {
    throw createError({
      statusCode: 500,
      message: 'Zebra printer URL is not configured'
    })
  }

  if (!barcode || !partName || !partNumber) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: barcode, partName, partNumber'
    })
  }

  // Compose label elements — 2x1" label layout (406x203 dots at 203dpi)
  // QR code on the left, text stacked on the right, centered on label
  const elements: LabelElement[] = [
    {
      type: 'qrcode',
      content: barcode,
      options: { x: 40, y: 50, magnification: 4 }
    },
    {
      type: 'text',
      content: partName,
      options: { x: 160, y: 50, height: 35, width: 28 }
    },
    {
      type: 'text',
      content: partNumber,
      options: { x: 160, y: 95, height: 30, width: 28 }
    }
  ]

  // Add quantity as a small text element if provided
  if (quantity && quantity > 1) {
    elements.push({
      type: 'text',
      content: `Qty: ${quantity}`,
      options: { x: 160, y: 135, height: 25, width: 20 }
    })
  }

  // Send to printer
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  try {
    const response = await $fetch<PrintResult>('/api/print/label', {
      baseURL: printerUrl,
      method: 'POST',
      body: { elements },
      headers
    })

    if (!response.success) {
      throw new Error(response.error || 'Print request returned failure status')
    }

    return { success: true, barcode }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown print error'
    throw createError({
      statusCode: 502,
      message: `Failed to print label: ${message}`
    })
  }
})
