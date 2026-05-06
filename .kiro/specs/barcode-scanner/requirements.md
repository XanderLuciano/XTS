# Requirements Document

## Introduction

Add webcam-based barcode scanning to the existing XTS application. The feature is built around a reusable, headless scanner composable and component that handles webcam access, barcode detection, and camera management with zero dependencies on any specific page or application state. This base scanner exposes a clean API via props, events, and slots, allowing any parent component in the application to consume it.

The scan page (`/scan`) integrates the base scanner component alongside the existing manual text input, giving users the choice of either input method. Page-specific concerns such as scan history, product lookup, toast notifications, and localStorage persistence remain entirely within the Scan_Page.

## Glossary

- **Scanner_Composable**: A Vue composable (`useScanner`) that encapsulates all webcam access, camera enumeration, stream lifecycle, and barcode detection logic. The Scanner_Composable contains no references to any page-specific state, routing, or UI framework components. It exposes reactive state and methods that any component can consume.
- **Scanner_Component**: A reusable, self-contained Vue component that wraps the Scanner_Composable and provides the camera preview, overlay, and scanning UI. The Scanner_Component accepts configuration via props, communicates results via emitted events, and offers slots for UI customization. The Scanner_Component has no dependencies on Scan_Page state, Scan_History, toast notifications, or localStorage.
- **Scan_Page**: The existing `/scan` route (`app/pages/scan.vue`) that handles barcode input, scan history, product lookup, and part creation. The Scan_Page consumes the Scanner_Component and wires its events into page-specific behavior.
- **Camera_Feed**: The live video stream from the user's webcam displayed in the browser.
- **Barcode_Overlay**: A visual indicator drawn on top of the Camera_Feed showing the detected barcode region.
- **Scan_History**: The existing list of scanned barcodes stored in localStorage and displayed on the Scan_Page. Managed exclusively by the Scan_Page.
- **1D_Barcode**: A linear barcode that encodes data in parallel lines of varying width. Supported formats include EAN-13, EAN-8, UPC-A, UPC-E, and Code 128.
- **2D_Barcode**: A two-dimensional barcode that encodes data in a matrix of cells or patterns. Supported formats include QR Code, Data Matrix, PDF417, and Aztec.
- **Barcode_Type**: A label indicating whether a detected barcode is a 1D_Barcode or a 2D_Barcode, along with the specific format name (e.g., "1D - EAN-13", "2D - QR Code").
- **Detection_Library**: A client-side JavaScript barcode detection library (e.g., ZXing, QuaggaJS, or the BarcodeDetector API) used to decode both 1D and 2D barcodes from video frames.

## Requirements

### Requirement 1: Scanner Composable — Webcam Access and Stream Lifecycle

**User Story:** As a developer, I want a self-contained composable that manages webcam access and stream lifecycle, so that I can reuse camera functionality across any component without duplicating logic.

#### Acceptance Criteria

1. THE Scanner_Composable SHALL expose a `startCamera` method that requests camera access from the browser and returns a MediaStream.
2. THE Scanner_Composable SHALL expose a `stopCamera` method that stops all active MediaStream tracks and releases the webcam device.
3. THE Scanner_Composable SHALL expose reactive state for `isActive` (boolean indicating whether the Camera_Feed is running), `error` (current error state or null), and `availableCameras` (list of detected video input devices).
4. WHEN `startCamera` is called, THE Scanner_Composable SHALL enumerate available video input devices and populate the `availableCameras` list.
5. IF the browser denies camera access, THEN THE Scanner_Composable SHALL set the `error` state to a descriptive message explaining that camera permission is required.
6. IF no camera device is available, THEN THE Scanner_Composable SHALL set the `error` state to a message indicating that no camera was detected.
7. THE Scanner_Composable SHALL accept an optional `cameraDeviceId` parameter to target a specific camera device.
8. THE Scanner_Composable SHALL default to the environment-facing (rear) camera when no `cameraDeviceId` is provided and a rear camera is available.
9. WHEN the Vue component that owns the Scanner_Composable is unmounted, THE Scanner_Composable SHALL automatically stop the Camera_Feed and release the webcam device.
10. THE Scanner_Composable SHALL contain no references to Scan_History, localStorage, toast notifications, routing, or any page-specific state.

### Requirement 2: Scanner Composable — Barcode Detection

**User Story:** As a developer, I want the scanner composable to detect barcodes from a video stream, so that detection logic is centralized and reusable.

#### Acceptance Criteria

1. WHILE the Camera_Feed is active, THE Scanner_Composable SHALL continuously analyze video frames for barcodes using the Detection_Library.
2. WHEN the Detection_Library detects a valid barcode in a video frame, THE Scanner_Composable SHALL expose the decoded barcode value as a string and the identified Barcode_Type via reactive state.
3. THE Scanner_Composable SHALL support detection of 1D_Barcode formats including EAN-13, EAN-8, UPC-A, UPC-E, and Code 128.
4. THE Scanner_Composable SHALL support detection of 2D_Barcode formats including QR Code, Data Matrix, PDF417, and Aztec.
5. THE Scanner_Composable SHALL accept a `formats` configuration parameter that allows the consumer to restrict which barcode formats are detected.
6. THE Scanner_Composable SHALL accept a `cooldownMs` configuration parameter (defaulting to 3000 milliseconds) that prevents reporting the same barcode value within the cooldown period.
7. WHEN a barcode is detected and the cooldown period has elapsed, THE Scanner_Composable SHALL invoke an `onDetected` callback (provided by the consumer) with the barcode value and Barcode_Type.

### Requirement 3: Scanner Component — Reusable UI and API Design

**User Story:** As a developer, I want a reusable scanner component with a clean props/events/slots API, so that I can embed barcode scanning into any page without coupling to page-specific logic.

#### Acceptance Criteria

1. THE Scanner_Component SHALL use the Scanner_Composable internally for all webcam and detection logic.
2. THE Scanner_Component SHALL accept the following props for configuration: `formats` (array of barcode formats to detect), `cooldownMs` (duplicate scan cooldown duration), `cameraDeviceId` (preferred camera device ID), `showGuide` (boolean to toggle the scanning guide overlay), and `autoStart` (boolean to start the camera automatically on mount).
3. THE Scanner_Component SHALL emit a `barcode-detected` event containing the barcode value and Barcode_Type when a barcode is successfully detected.
4. THE Scanner_Component SHALL emit a `camera-started` event when the Camera_Feed becomes active.
5. THE Scanner_Component SHALL emit a `camera-stopped` event when the Camera_Feed is stopped.
6. THE Scanner_Component SHALL emit an `error` event containing the error message when a camera or detection error occurs.
7. THE Scanner_Component SHALL provide a `guide` slot that allows the consumer to replace the default scanning guide overlay with custom markup.
8. THE Scanner_Component SHALL provide an `overlay` slot that allows the consumer to replace the default Barcode_Overlay with custom markup, receiving the detected barcode region coordinates as slot props.
9. THE Scanner_Component SHALL provide a `feedback` slot that allows the consumer to replace the default scan-success feedback (green flash) with custom markup.
10. THE Scanner_Component SHALL be responsive and adapt to different screen widths, maintaining usability on both desktop and mobile devices.
11. THE Scanner_Component SHALL contain no references to Scan_History, localStorage, toast notifications, routing, or any page-specific state.

### Requirement 4: Scanner Component — Camera Feed Display and Visual Feedback

**User Story:** As a user, I want to see my camera feed with clear visual feedback when scanning, so that I know the scanner is active and when a barcode is detected.

#### Acceptance Criteria

1. WHEN the Camera_Feed is active, THE Scanner_Component SHALL display the live video stream within a contained preview element.
2. WHILE the Camera_Feed is active and no barcode is detected, THE Scanner_Component SHALL display a scanning guide overlay (e.g., a target rectangle) to help the user position the barcode.
3. WHEN a barcode is successfully detected, THE Scanner_Component SHALL display the Barcode_Overlay on the Camera_Feed highlighting the detected barcode region.
4. WHEN a barcode is successfully detected, THE Scanner_Component SHALL briefly flash a green border on the Camera_Feed preview area as default feedback.
5. WHEN a barcode is successfully detected, THE Scanner_Component SHALL play a short audible beep sound to confirm the scan.
6. THE Scanner_Component SHALL expose a `startCamera` method and a `stopCamera` method to the parent component via template refs, allowing programmatic control of the Camera_Feed.

### Requirement 5: Scanner Component — Camera Selection

**User Story:** As a user with multiple cameras, I want to choose which camera to use for scanning, so that I can use the most suitable camera (e.g., rear-facing on a tablet).

#### Acceptance Criteria

1. WHEN multiple camera devices are available, THE Scanner_Component SHALL display a camera selection dropdown listing all available video input devices on desktop viewports.
2. WHEN the user selects a different camera from the dropdown, THE Scanner_Component SHALL switch the Camera_Feed to the selected camera device.
3. WHERE only one camera device is available, THE Scanner_Component SHALL use that camera automatically without displaying the selection dropdown or swap button.
4. THE Scanner_Component SHALL default to the environment-facing (rear) camera when available, as rear cameras are more suitable for barcode scanning.
5. WHEN multiple camera devices are available on a mobile viewport, THE Scanner_Component SHALL display a camera swap icon button overlaid on the Camera_Feed (e.g., a "flip camera" icon in the corner of the preview) instead of the dropdown.
6. WHEN the user taps the camera swap button on mobile, THE Scanner_Component SHALL cycle to the next available camera device and switch the Camera_Feed accordingly.
7. THE Scanner_Component SHALL emit a `camera-switched` event containing the new camera device ID when the active camera changes via either the dropdown or the swap button.

### Requirement 6: Scan Page Integration

**User Story:** As a user, I want detected barcodes from the webcam to automatically appear in my scan history and trigger notifications, so that I can look up products without manual entry.

#### Acceptance Criteria

1. THE Scan_Page SHALL display a "Scan with Camera" button above the existing manual barcode input section.
2. WHEN the user clicks the "Scan with Camera" button, THE Scan_Page SHALL open a modal (popup) dialog containing the Scanner_Component and automatically start the Camera_Feed.
3. WHEN the Scanner_Component emits a `barcode-detected` event, THE Scan_Page SHALL add the barcode value, Barcode_Type, and current timestamp to the Scan_History.
4. WHEN a barcode is added to the Scan_History via the Scanner_Component, THE Scan_Page SHALL display a success toast notification showing the detected barcode value and Barcode_Type.
5. WHEN a barcode is added to the Scan_History via the Scanner_Component, THE Scan_Page SHALL persist the updated Scan_History to localStorage.
6. WHEN the user closes the scanner modal (via the modal's close button, clicking the backdrop, or pressing the Escape key), THE Scan_Page SHALL stop the Camera_Feed, release the webcam device, and close the modal.
7. WHEN the user presses the Escape key on desktop while the scanner modal is open, THE Scan_Page SHALL close the scanner modal and stop the Camera_Feed.
8. WHEN the user navigates away from the Scan_Page while the scanner modal is open, THE Scan_Page SHALL close the modal, stop the Camera_Feed, and release the webcam device.
9. WHEN the Scanner_Component emits an `error` event, THE Scan_Page SHALL display the error message to the user via a toast notification.
