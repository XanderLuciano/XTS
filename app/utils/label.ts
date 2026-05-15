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
 * Layout: 2x1" label (406x203 dots at 203dpi)
 * QR code on the left, text stacked on the right.
 */
export function composeLabelElements(data: LabelData): LabelElement[] {
  const elements: LabelElement[] = [
    {
      type: 'qrcode',
      content: data.barcode,
      options: { x: 40, y: 50, magnification: 4 }
    },
    {
      type: 'text',
      content: data.partName,
      options: { x: 160, y: 50, height: 35, width: 28 }
    },
    {
      type: 'text',
      content: data.partNumber,
      options: { x: 160, y: 95, height: 30, width: 28 }
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
      options: { x: 160, y: 135, height: 25, width: 20 }
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
