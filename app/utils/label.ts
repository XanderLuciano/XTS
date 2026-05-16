/**
 * Shared label composition utility.
 *
 * This is the single source of truth for how label elements are arranged.
 * Used by both the server-side print endpoint and local USB printing.
 */

export interface TextOptions {
  x: number
  y: number
  height?: number
  width?: number
  font?: string
  rotation?: 'N' | 'R' | 'I' | 'B'
  reverse?: boolean
}

export interface QROptions {
  x: number
  y: number
  magnification?: number
  errorCorrection?: 'L' | 'M' | 'Q' | 'H'
}

export interface BarcodeOptions {
  x: number
  y: number
  type: string
  height?: number
  narrowBarWidth?: number
}

export type LabelElement =
  | { type: 'text'; content: string; options: TextOptions }
  | { type: 'qrcode'; content: string; options: QROptions }
  | { type: 'barcode'; content: string; options: BarcodeOptions }

export interface LabelData {
  barcode: string
  partName: string
  partNumber: string
  quantity?: number
  vendor?: string
}

/**
 * Compose label elements from part/stock data.
 * Layout adapts to the configured label size.
 * Default: 2x1" label (406x203 dots at 203dpi)
 * QR code on the left, text stacked on the right.
 */
export function composeLabelElements(data: LabelData, labelWidth?: number, labelHeight?: number): LabelElement[] {
  // Use provided dimensions or default (2x1" at 203dpi)
  const w = labelWidth || 406
  const h = labelHeight || 203

  // Scale positions relative to label size
  // QR takes roughly 40% of width on the left
  const qrX = Math.round(w * 0.05)
  const qrY = Math.round(h * 0.15)
  const qrMag = Math.max(2, Math.min(6, Math.round(Math.min(w * 0.35, h * 0.7) / 33)))

  // Text starts at ~40% of width
  const textX = Math.round(w * 0.40)
  const textY1 = Math.round(h * 0.15)
  const textY2 = Math.round(h * 0.42)
  const textY3 = Math.round(h * 0.65)

  // Font sizes scale with label height
  const fontH1 = Math.max(18, Math.round(h * 0.17))
  const fontW1 = Math.max(14, Math.round(fontH1 * 0.8))
  const fontH2 = Math.max(16, Math.round(h * 0.15))
  const fontW2 = Math.max(14, Math.round(fontH2 * 0.8))
  const fontH3 = Math.max(14, Math.round(h * 0.12))
  const fontW3 = Math.max(12, Math.round(fontH3 * 0.8))

  const elements: LabelElement[] = [
    {
      type: 'qrcode',
      content: data.barcode,
      options: { x: qrX, y: qrY, magnification: qrMag }
    },
    {
      type: 'text',
      content: data.partName,
      options: { x: textX, y: textY1, height: fontH1, width: fontW1 }
    },
    {
      type: 'text',
      content: data.partNumber,
      options: { x: textX, y: textY2, height: fontH2, width: fontW2 }
    }
  ]

  // Add quantity and/or vendor on the third line
  const infoParts: string[] = []
  if (data.quantity && data.quantity > 1) infoParts.push(`Qty: ${data.quantity}`)
  if (data.vendor) infoParts.push(data.vendor)

  if (infoParts.length > 0) {
    elements.push({
      type: 'text',
      content: infoParts.join(' · '),
      options: { x: textX, y: textY3, height: fontH3, width: fontW3 }
    })
  }

  return elements
}

/**
 * Generate raw ZPL from label elements.
 * This converts our abstract element format into Zebra Programming Language
 * that can be sent directly to a Zebra printer via USB or network.
 */
export function elementsToZpl(elements: LabelElement[]): string {
  let zpl = '^XA\n' // Start format
  zpl += '^CI28\n'  // UTF-8 character set

  for (const el of elements) {
    switch (el.type) {
      case 'text': {
        const { x, y, height, width } = el.options
        const fontHeight = height || 30
        const fontWidth = width || fontHeight
        zpl += `^FO${x},${y}\n`
        zpl += `^A0N,${fontHeight},${fontWidth}\n`
        zpl += `^FD${escapeZpl(el.content)}^FS\n`
        break
      }
      case 'qrcode': {
        const { x, y, magnification, errorCorrection } = el.options
        const mag = magnification || 4
        const ec = errorCorrection || 'M'
        zpl += `^FO${x},${y}\n`
        zpl += `^BQN,2,${mag},,${ec}\n`
        zpl += `^FDMA,${escapeZpl(el.content)}^FS\n`
        break
      }
      case 'barcode': {
        const { x, y, type, height, narrowBarWidth } = el.options
        const barHeight = height || 50
        zpl += `^FO${x},${y}\n`
        if (narrowBarWidth) zpl += `^BY${narrowBarWidth}\n`
        if (type === 'CODE128') {
          zpl += `^BCN,${barHeight},Y,N,N\n`
        } else {
          // Default to Code 128
          zpl += `^BCN,${barHeight},Y,N,N\n`
        }
        zpl += `^FD${escapeZpl(el.content)}^FS\n`
        break
      }
    }
  }

  zpl += '^XZ\n' // End format
  return zpl
}

/**
 * Escape special characters for ZPL field data.
 */
function escapeZpl(text: string): string {
  // ZPL uses ^ as control character and ~ as escape prefix
  return text.replace(/\^/g, ' ').replace(/~/g, ' ')
}

/**
 * Generate a test label with mock data for previewing print output.
 * Uses realistic data matching actual part naming conventions
 * without touching any backend. Includes "TEST" markers so the
 * printed label is clearly identifiable as a test.
 * Randomizes the part number and quantity for variety across prints.
 */
export function generateTestLabelData(): LabelData {
  const randomDigits = String(Math.floor(100000 + Math.random() * 900000))
  const partNumber = `${randomDigits}-001`
  const quantity = Math.floor(1 + Math.random() * 50)

  return {
    barcode: `TEST-${partNumber}-A-TESTVENDOR-0000`,
    partName: '[TEST] Fork Arm',
    partNumber,
    quantity,
    vendor: 'TestVendor'
  }
}
