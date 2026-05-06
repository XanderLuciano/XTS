<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { BarcodeFormat, ScanResult } from '~/types/scanner'
import { useScanner } from '~/composables/useScanner'

export interface BarcodeScannerProps {
  /** Barcode formats to detect. Default: all supported formats */
  formats?: BarcodeFormat[]
  /** Cooldown in ms for duplicate scan prevention. Default: 3000 */
  cooldownMs?: number
  /** Preferred camera device ID */
  cameraDeviceId?: string
  /** Show the scanning guide overlay. Default: true */
  showGuide?: boolean
  /** Auto-start camera on mount. Default: false */
  autoStart?: boolean
}

const props = withDefaults(defineProps<BarcodeScannerProps>(), {
  formats: undefined,
  cooldownMs: 3000,
  cameraDeviceId: undefined,
  showGuide: true,
  autoStart: false,
})

const emit = defineEmits<{
  'barcode-detected': [result: ScanResult]
  'camera-started': []
  'camera-stopped': []
  'camera-switched': [deviceId: string]
  'error': [message: string]
}>()

const {
  isActive,
  error,
  availableCameras,
  lastResult,
  startCamera,
  stopCamera,
  switchCamera,
  videoRef,
} = useScanner({
  formats: props.formats,
  cooldownMs: props.cooldownMs,
  cameraDeviceId: props.cameraDeviceId,
  onDetected: (result: ScanResult) => {
    emit('barcode-detected', result)
  },
})

// Watch composable error state and emit error event
watch(error, (newError) => {
  if (newError) {
    emit('error', newError)
  }
})

// Watch isActive to emit camera-started / camera-stopped
watch(isActive, (active) => {
  if (active) {
    emit('camera-started')
  }
  else {
    emit('camera-stopped')
  }
})

// Auto-start camera on mount if autoStart prop is true
onMounted(() => {
  if (props.autoStart) {
    startCamera()
  }
})

// --- Green flash feedback ---
const showFlash = ref(false)
let flashTimeout: ReturnType<typeof setTimeout> | null = null

// --- Audio beep ---
function playBeep() {
  try {
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'square'
    oscillator.frequency.value = 1800
    gain.gain.value = 0.15
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.12)
    oscillator.onended = () => ctx.close()
  }
  catch {
    // Silently ignore audio errors (e.g. user gesture requirement)
  }
}

// Watch lastResult to trigger flash + beep on detection
watch(lastResult, (result) => {
  if (result) {
    showFlash.value = true
    if (flashTimeout) clearTimeout(flashTimeout)
    flashTimeout = setTimeout(() => {
      showFlash.value = false
    }, 300)
    playBeep()
  }
})

// --- Bounding box coordinate mapping (video intrinsic → display) ---
// The detection library returns coordinates in the video's native resolution,
// but the video is displayed scaled/cropped via object-fit: cover.
// We need to map those coordinates to the element's display space.
const displayBoundingBox = computed(() => {
  const bb = lastResult.value?.boundingBox
  const video = videoRef.value
  if (!bb || !video) return null

  const videoW = video.videoWidth
  const videoH = video.videoHeight
  const elemW = video.clientWidth
  const elemH = video.clientHeight

  if (!videoW || !videoH || !elemW || !elemH) return null

  // object-fit: cover — compute scale and offset
  const videoAspect = videoW / videoH
  const elemAspect = elemW / elemH

  let scale: number
  let offsetX = 0
  let offsetY = 0

  if (videoAspect > elemAspect) {
    // Video is wider than element — cropped horizontally
    scale = elemH / videoH
    offsetX = (elemW - videoW * scale) / 2
  }
  else {
    // Video is taller than element — cropped vertically
    scale = elemW / videoW
    offsetY = (elemH - videoH * scale) / 2
  }

  return {
    x: bb.x * scale + offsetX,
    y: bb.y * scale + offsetY,
    width: bb.width * scale,
    height: bb.height * scale,
  }
})

// --- Camera selection ---
const currentCameraIndex = ref(0)
const hasMultipleCameras = computed(() => availableCameras.value.length > 1)

// --- Mirror toggle (persisted per camera ID) ---
const MIRROR_STORAGE_KEY = 'scanner-mirror-prefs'
const isMirrored = ref(false)

function loadMirrorPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(MIRROR_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  }
  catch {
    return {}
  }
}

function saveMirrorPref(deviceId: string, mirrored: boolean) {
  const prefs = loadMirrorPrefs()
  prefs[deviceId] = mirrored
  localStorage.setItem(MIRROR_STORAGE_KEY, JSON.stringify(prefs))
}

function loadMirrorForCurrentCamera() {
  const cam = availableCameras.value[currentCameraIndex.value]
  if (cam) {
    const prefs = loadMirrorPrefs()
    isMirrored.value = prefs[cam.deviceId] ?? false
  }
}

function toggleMirror() {
  isMirrored.value = !isMirrored.value
  const cam = availableCameras.value[currentCameraIndex.value]
  if (cam) {
    saveMirrorPref(cam.deviceId, isMirrored.value)
  }
}

// Load mirror pref when cameras become available
watch(availableCameras, () => {
  loadMirrorForCurrentCamera()
})

async function handleCameraSwap() {
  if (!hasMultipleCameras.value) return
  const nextIndex = (currentCameraIndex.value + 1) % availableCameras.value.length
  const deviceId = availableCameras.value[nextIndex].deviceId
  currentCameraIndex.value = nextIndex
  loadMirrorForCurrentCamera()
  await switchCamera(deviceId)
  emit('camera-switched', deviceId)
}

async function handleCameraSelect(event: Event) {
  const select = event.target as HTMLSelectElement
  const deviceId = select.value
  const index = availableCameras.value.findIndex(c => c.deviceId === deviceId)
  if (index !== -1) {
    currentCameraIndex.value = index
    loadMirrorForCurrentCamera()
  }
  await switchCamera(deviceId)
  emit('camera-switched', deviceId)
}

defineExpose({
  startCamera,
  stopCamera,
})
</script>

<template>
  <div
    class="barcode-scanner relative overflow-hidden rounded-lg bg-black"
    :class="{ 'scanner-flash': showFlash }"
  >
    <!-- Desktop camera selector: dropdown above video -->
    <select
      v-if="hasMultipleCameras"
      class="hidden md:block w-full mb-2 rounded-md border border-gray-600 bg-gray-900 text-white text-sm px-3 py-2"
      :value="availableCameras[currentCameraIndex]?.deviceId"
      @change="handleCameraSelect"
    >
      <option
        v-for="(camera, index) in availableCameras"
        :key="camera.deviceId"
        :value="camera.deviceId"
      >
        {{ camera.label || `Camera ${index + 1}` }}
      </option>
    </select>

    <!-- Camera preview -->
    <div class="relative">
      <video
        ref="videoRef"
        autoplay
        playsinline
        muted
        class="scanner-video w-full h-full object-cover block"
        :class="{ 'scanner-mirrored': isMirrored }"
      />

      <!-- Mirror toggle button: overlaid on preview top-left -->
      <button
        v-if="isActive"
        type="button"
        class="absolute top-3 left-3 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        :class="{ 'ring-2 ring-white': isMirrored }"
        aria-label="Toggle mirror"
        @click="toggleMirror"
      >
        <UIcon name="lucide:flip-horizontal-2" class="w-5 h-5" />
      </button>

      <!-- Mobile camera swap button: overlaid on preview bottom-right -->
      <button
        v-if="hasMultipleCameras"
        type="button"
        class="md:hidden absolute bottom-3 right-3 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        aria-label="Switch camera"
        @click="handleCameraSwap"
      >
        <UIcon name="lucide:refresh-cw" class="w-5 h-5" />
      </button>

      <!-- Guide overlay: shown when active and no detection -->
      <div
        v-if="isActive && !lastResult && props.showGuide"
        class="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <slot name="guide">
          <div class="scanner-guide" />
        </slot>
      </div>

      <!-- Barcode highlight overlay: shown when detection has a bounding box -->
      <div
        v-if="displayBoundingBox"
        class="absolute inset-0 pointer-events-none"
        :class="{ 'scanner-mirrored': isMirrored }"
      >
        <slot name="overlay" :bounding-box="displayBoundingBox">
          <div
            class="scanner-highlight"
            :style="{
              left: `${displayBoundingBox.x}px`,
              top: `${displayBoundingBox.y}px`,
              width: `${displayBoundingBox.width}px`,
              height: `${displayBoundingBox.height}px`,
            }"
          />
        </slot>
      </div>
    </div>

    <!-- Feedback slot -->
    <slot name="feedback" />
  </div>
</template>

<style scoped>
.barcode-scanner {
  transition: box-shadow 0.15s ease;
}

.scanner-flash {
  box-shadow: inset 0 0 0 4px #22c55e;
}

.scanner-video {
  min-height: 240px;
}

.scanner-mirrored {
  transform: scaleX(-1);
}

.scanner-guide {
  width: 60%;
  max-width: 280px;
  aspect-ratio: 4 / 3;
  border: 2px dashed rgba(255, 255, 255, 0.6);
  border-radius: 12px;
}

.scanner-highlight {
  position: absolute;
  border: 2px solid #22c55e;
  border-radius: 4px;
  background: rgba(34, 197, 94, 0.15);
}
</style>
