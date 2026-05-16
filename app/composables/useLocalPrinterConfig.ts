/**
 * Composable for managing local USB printer label configuration.
 *
 * Stores label dimensions and density, and generates the ZPL commands
 * needed to configure the printer for the specified media size.
 */
import { ref, readonly, computed } from 'vue'

export interface LabelConfig {
  /** Label width in inches */
  widthInches: number
  /** Label height in inches */
  heightInches: number
  /** Printer density in DPI (dots per inch) — typically 203 or 300 */
  dpi: number
}

const STORAGE_KEY = 'xts-local-printer-label-config'

const DEFAULT_CONFIG: LabelConfig = {
  widthInches: 2,
  heightInches: 1,
  dpi: 203
}

const config = ref<LabelConfig>({ ...DEFAULT_CONFIG })

export function useLocalPrinterConfig() {
  /** Width in dots (pixels) based on current config */
  const widthDots = computed(() => Math.round(config.value.widthInches * config.value.dpi))

  /** Height in dots (pixels) based on current config */
  const heightDots = computed(() => Math.round(config.value.heightInches * config.value.dpi))

  /**
   * Load config from localStorage.
   */
  function load(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        config.value = {
          widthInches: Number(parsed.widthInches) || DEFAULT_CONFIG.widthInches,
          heightInches: Number(parsed.heightInches) || DEFAULT_CONFIG.heightInches,
          dpi: Number(parsed.dpi) || DEFAULT_CONFIG.dpi
        }
      }
    } catch {
      // Ignore corrupted data
    }
  }

  /**
   * Save current config to localStorage.
   */
  function save(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value))
    } catch {
      // Ignore quota errors
    }
  }

  /**
   * Update the label config and persist it.
   */
  function setConfig(newConfig: Partial<LabelConfig>): void {
    config.value = { ...config.value, ...newConfig }
    save()
  }

  /**
   * Reset to default label config.
   */
  function resetToDefault(): void {
    config.value = { ...DEFAULT_CONFIG }
    save()
  }

  /**
   * Generate ZPL commands to configure the printer for this label size.
   *
   * Commands sent:
   * - ^PW: Print width in dots
   * - ^LL: Label length in dots
   * - ^LH: Label home (origin) at 0,0
   * - ^MNN: Media type = non-continuous (die-cut labels)
   * - ^MNA: Media tracking = auto (use gap/notch sensor to detect label edges)
   * - ^XZ: End format / apply
   *
   * The ^MNA command is critical — without it the printer blindly advances
   * by ^LL dots per label, which causes cumulative Y drift over time.
   * With auto-sensing enabled, the printer uses the transmissive gap sensor
   * to find the actual top-of-form between labels.
   *
   * These are persistent — the printer remembers them across power cycles.
   */
  function toConfigZpl(): string {
    const w = widthDots.value
    const h = heightDots.value

    let zpl = '^XA\n'
    zpl += `^PW${w}\n`       // Print width
    zpl += `^LL${h}\n`       // Label length
    zpl += '^LH0,0\n'        // Label home origin
    zpl += '^MNN\n'           // Media type: non-continuous (die-cut)
    zpl += '^MNA\n'           // Media tracking: auto (gap sensing enabled)
    zpl += '^XZ\n'
    return zpl
  }

  /**
   * Generate ZPL command to trigger a full sensor calibration.
   *
   * This sends ~JC which makes the printer feed a few labels while
   * measuring the gap/mark sensor thresholds. After calibration,
   * the printer accurately detects label boundaries and eliminates Y drift.
   *
   * The printer will feed 2-4 labels during calibration — this is normal.
   */
  function calibrateZpl(): string {
    return '~JC\n'
  }

  return {
    config: readonly(config),
    widthDots,
    heightDots,
    DEFAULT_CONFIG,
    load,
    save,
    setConfig,
    resetToDefault,
    toConfigZpl,
    calibrateZpl
  }
}
