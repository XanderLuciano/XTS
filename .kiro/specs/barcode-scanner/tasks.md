# Implementation Plan: Barcode Scanner

## Overview

Implement webcam-based barcode scanning for the XTS inventory app in three layers: a headless `useScanner` composable, a reusable `BarcodeScanner` Vue component, and scan page integration via a modal dialog. Detection uses the native `BarcodeDetector` API with a `zxing-wasm` fallback. The project already has vitest, happy-dom, and fast-check configured.

## Tasks

- [x] 1. Define scanner types and format labels
  - [x] 1.1 Create `app/types/scanner.ts` with `BarcodeFormat`, `Barcode1DFormat`, `Barcode2DFormat`, `ScanResult`, and `FORMAT_LABELS` map
    - Export all types and the format label constant
    - Include the `UseScannerOptions` and `UseScanner` interfaces
    - _Requirements: 2.2, 2.3, 2.4, 2.5_
  - [x] 1.2 Extend the existing `ScanRecord` interface in `app/pages/scan.vue` to include an optional `type` field for Barcode_Type
    - _Requirements: 6.3_

- [x] 2. Implement `useScanner` composable
  - [x] 2.1 Create `app/composables/useScanner.ts` implementing webcam access and stream lifecycle
    - Implement `startCamera` with `getUserMedia`, device enumeration, and `facingMode: 'environment'` default
    - Implement `stopCamera` that stops all MediaStream tracks and cancels the detection loop
    - Implement `switchCamera` that stops current stream and starts with new device ID
    - Expose reactive state: `isActive`, `error`, `availableCameras`, `lastResult`, `videoRef`
    - Register cleanup via `onUnmounted` to auto-stop camera
    - Reset `error` to `null` at the start of each `startCamera` call
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_
  - [x] 2.2 Implement barcode detection loop in `useScanner`
    - Use `requestAnimationFrame` loop to continuously analyze video frames
    - Use native `BarcodeDetector` API when available, fall back to `zxing-wasm`
    - Implement cooldown tracking via `Map<string, number>` to prevent duplicate reports within `cooldownMs`
    - Invoke `onDetected` callback with `ScanResult` containing value, type label from `FORMAT_LABELS`, rawFormat, and boundingBox
    - Accept `formats` parameter to restrict detected barcode formats
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 2.3 Write property test: startCamera activates stream and populates available cameras
    - **Property 1: startCamera activates stream and populates available cameras**
    - **Validates: Requirements 1.1, 1.4**
  - [x] 2.4 Write property test: stopCamera stops all MediaStream tracks
    - **Property 2: stopCamera stops all MediaStream tracks**
    - **Validates: Requirements 1.2**
  - [x] 2.5 Write property test: cameraDeviceId is forwarded to getUserMedia constraints
    - **Property 3: cameraDeviceId is forwarded to getUserMedia constraints**
    - **Validates: Requirements 1.7**
  - [x] 2.6 Write property test: detection result contains correct value and format label
    - **Property 4: Detection result contains correct value and format label**
    - **Validates: Requirements 2.2, 2.5**
  - [x] 2.7 Write property test: cooldown prevents duplicate barcode reports within the cooldown window
    - **Property 5: Cooldown prevents duplicate barcode reports within the cooldown window**
    - **Validates: Requirements 2.6, 2.7**
  - [x] 2.8 Write unit tests for `useScanner` composable
    - Test default facingMode is `'environment'` when no deviceId provided (Req 1.8)
    - Test permission denied sets specific error message (Req 1.5)
    - Test no camera available sets specific error message (Req 1.6)
    - Test cleanup on unmount stops camera (Req 1.9)
    - Test all 1D formats in default format list (Req 2.3)
    - Test all 2D formats in default format list (Req 2.4)
    - _Requirements: 1.5, 1.6, 1.8, 1.9, 2.3, 2.4_

- [x] 3. Checkpoint — Composable complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `BarcodeScanner` component
  - [x] 4.1 Create `app/components/BarcodeScanner.vue` with props, emits, and composable wiring
    - Accept props: `formats`, `cooldownMs`, `cameraDeviceId`, `showGuide`, `autoStart`
    - Wire `useScanner` composable internally
    - Emit events: `barcode-detected`, `camera-started`, `camera-stopped`, `camera-switched`, `error`
    - Expose `startCamera` and `stopCamera` via `defineExpose`
    - Watch composable `error` state and emit `error` event
    - Watch `isActive` to emit `camera-started` / `camera-stopped`
    - If `autoStart` is true, call `startCamera` on mount
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.10, 3.11_
  - [x] 4.2 Add camera preview, guide overlay, barcode highlight overlay, and scan feedback UI
    - Render `<video>` element bound to composable's `videoRef`
    - Show scanning guide overlay (target rectangle) when active and no detection
    - Show barcode highlight overlay on detection with bounding box
    - Implement green flash border on successful detection (CSS class toggle)
    - Play short audible beep on detection
    - Provide `#guide`, `#overlay` (with `boundingBox` slot prop), and `#feedback` slots
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 3.7, 3.8, 3.9_
  - [x] 4.3 Add camera selection UI (dropdown on desktop, swap button on mobile)
    - Show dropdown listing `availableCameras` on desktop viewports when multiple cameras exist
    - Show camera swap icon button overlaid on preview on mobile viewports when multiple cameras exist
    - Hide selector when only one camera is available
    - Emit `camera-switched` event on camera change
    - Default to rear camera
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [x] 4.4 Write property test: component emits error event for any composable error
    - **Property 6: Component emits error event for any composable error**
    - **Validates: Requirements 3.6**
  - [x] 4.5 Write property test: camera swap cycles through available devices
    - **Property 7: Camera swap cycles through available devices**
    - **Validates: Requirements 5.6, 5.7**
  - [x] 4.6 Write unit tests for `BarcodeScanner` component
    - Test props forwarded to composable (Req 3.2)
    - Test `camera-started` / `camera-stopped` events (Req 3.4, 3.5)
    - Test guide/overlay/feedback slots render custom content (Req 3.7, 3.8, 3.9)
    - Test video element present when active (Req 4.1)
    - Test guide overlay visible when active and no detection (Req 4.2)
    - Test green flash CSS class on detection (Req 4.4)
    - Test audio beep on detection (Req 4.5)
    - Test `startCamera`/`stopCamera` exposed via template ref (Req 4.6)
    - Test dropdown on desktop / swap button on mobile (Req 5.1, 5.5)
    - Test no selector with single camera (Req 5.3)
    - _Requirements: 3.2, 3.4, 3.5, 3.7, 3.8, 3.9, 4.1, 4.2, 4.4, 4.5, 4.6, 5.1, 5.3, 5.5_

- [x] 5. Checkpoint — Component complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Integrate scanner into Scan Page
  - [x] 6.1 Add "Scan with Camera" button and scanner modal to `app/pages/scan.vue`
    - Add button above the existing manual barcode input section
    - Open a modal dialog containing `BarcodeScanner` with `autoStart=true` on button click
    - Add close button, backdrop click, and Escape key to close the modal and stop the camera
    - Call `scannerRef.value?.stopCamera()` on modal close
    - _Requirements: 6.1, 6.2, 6.6, 6.7_
  - [x] 6.2 Wire `barcode-detected` event to scan history, toast, and localStorage
    - On `barcode-detected`, push `{ barcode: value, type, timestamp: new Date() }` to `scanHistory`
    - Show success toast with barcode value and Barcode_Type
    - Persist updated `scanHistory` to localStorage (existing watcher handles this)
    - _Requirements: 6.3, 6.4, 6.5_
  - [x] 6.3 Wire `error` event and route-leave cleanup
    - On `error` event, show error toast via `useToast()`
    - Add `onBeforeRouteLeave` guard to close modal and stop camera
    - _Requirements: 6.8, 6.9_
  - [x] 6.4 Write property test: scan history persistence round-trip
    - **Property 8: Scan history persistence round-trip**
    - **Validates: Requirements 6.3, 6.5**
  - [x] 6.5 Write property test: toast notification shown for each detected barcode
    - **Property 9: Toast notification shown for each detected barcode**
    - **Validates: Requirements 6.4**
  - [x] 6.6 Write unit tests for Scan Page integration
    - Test "Scan with Camera" button rendered above manual input (Req 6.1)
    - Test clicking button opens modal with BarcodeScanner (Req 6.2)
    - Test modal close stops camera and closes modal (Req 6.6)
    - Test Escape key closes modal on desktop (Req 6.7)
    - Test camera stopped on route leave (Req 6.8)
    - Test error toast on error event (Req 6.9)
    - _Requirements: 6.1, 6.2, 6.6, 6.7, 6.8, 6.9_

- [x] 7. Final checkpoint — All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use the existing fast-check + vitest setup
- Checkpoints ensure incremental validation after each layer
- The `zxing-wasm` package needs to be installed as a dependency (`npm install zxing-wasm`)
