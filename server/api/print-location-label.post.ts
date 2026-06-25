/**
 * API endpoint to print a Zebra label for a bin location.
 *
 * Accepts the encoded location code and a human-readable description,
 * composes a label with a QR code (encoding the location code) plus text,
 * and sends it to the Zebra label printer service.
 *
 * NOTE: This layout mirrors app/utils/label.ts composeLocationLabelElements().
 * Keep both in sync when making layout changes.
 */

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
  type: string
  height?: number
  narrowBarWidth?: number
}

type LabelElement
  = | { type: 'text', content: string, options: TextOptions }
    | { type: 'qrcode', content: string, options: QROptions }
    | { type: 'barcode', content: string, options: BarcodeOptions }

interface PrintResult {
  success: boolean
  jobId?: string
  error?: string
}

interface PrintLocationLabelBody {
  code: string
  description?: string
  printerUrl?: string
  apiKey?: string
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  const { code, description, printerUrl: bodyPrinterUrl, apiKey: bodyApiKey }
    = await readBody<PrintLocationLabelBody>(event)

  const printerUrl = bodyPrinterUrl || config.public.zebraPrinterUrl as string
  const apiKey = bodyApiKey || config.public.zebraApiKey as string

  if (!printerUrl) {
    throw createError({
      statusCode: 500,
      message: 'Zebra printer URL is not configured'
    })
  }

  if (!code) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: code'
    })
  }

  // Compose label elements — 2x1" label layout (406x203 dots at 203dpi)
  // QR code on the left, location code + description stacked on the right.
  const elements: LabelElement[] = [
    {
      type: 'qrcode',
      content: code,
      options: { x: 40, y: 50, magnification: 4 }
    },
    {
      type: 'text',
      content: code,
      options: { x: 160, y: 50, height: 40, width: 32 }
    }
  ]

  if (description) {
    elements.push({
      type: 'text',
      content: description,
      options: { x: 160, y: 120, height: 24, width: 20 }
    })
  }

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

    return { success: true, code }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown print error'
    throw createError({
      statusCode: 502,
      message: `Failed to print location label: ${message}`
    })
  }
})
