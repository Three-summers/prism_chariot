# Line Clamp Frontend Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the line-clamp module's Mock data with a browser-only TypeScript detector based on the reference OpenCV algorithm, without changing the dashboard layout.

**Architecture:** `LineClampDetector` consumes `ImageData` and calibration records and returns a typed detection result. `LineClampDataProvider` loads a bundled sample or user-selected image, invokes the detector, and maps the result into the existing `DashboardViewModel`; `DashboardShell` remains unchanged and only receives richer media/metric values.

**Tech Stack:** React, TypeScript, Canvas `ImageData`, Node test runner, Vite

**Spec:** `docs/superpowers/specs/2026-08-13-line-clamp-frontend-detection-design.md`

## Global Constraints

- No Python, HTTP, CLI, WebSocket, Tauri, or other backend process.
- Preserve the current `DashboardShell` three-column layout and 1600×900 scaling.
- Keep other four modules on the existing Mock Provider.
- Do not copy the full 140MB reference image/output directories into `public`.
- Use existing semantic i18n and theme tokens; no module-specific layout branch.

---

### Task 1: Pure Detection Contracts and Pixel Primitives

**Files:**
- Create: `src/lineClamp/types.ts`
- Create: `src/lineClamp/pixels.ts`
- Create: `src/lineClamp/calibration.ts`
- Test: `tests/line-clamp-pixels.test.ts`
- Test: `tests/line-clamp-calibration.test.ts`

**Interfaces:**
- Produces: `LineClampCalibration`, `LineClampDetectionResult`, `grayScale`, `threshold`, `closeBinaryMask`, `connectedComponents`, `parseCalibrationRecord`.

- [ ] **Step 1: Write failing pixel tests**

Assert grayscale conversion on a known RGBA pixel, threshold foreground/background, one-pixel rectangular closing, and connected-component bounding box/area on a literal 5×5 mask.

- [ ] **Step 2: Run `node --test tests/line-clamp-pixels.test.ts` and verify RED**

Expected: module-not-found failure for `src/lineClamp/pixels.ts`.

- [ ] **Step 3: Implement typed-array pixel primitives**

Use row-major `Uint8Array`; closing means dilation followed by erosion with a bounded rectangular kernel. Components use 8-connectivity and return area plus integer bounds.

- [ ] **Step 4: Run the pixel tests and verify GREEN**

Expected: all literal primitive cases pass.

- [ ] **Step 5: Write failing calibration tests**

Parse the reference shape `{box_corners, box_center, box_size, has_screw, screw_pos}` into normalized coordinates and reject malformed/partial records.

- [ ] **Step 6: Run calibration tests and verify RED**

Expected: module-not-found failure for `src/lineClamp/calibration.ts`.

- [ ] **Step 7: Implement calibration parsing and lookup**

Keep the lookup keyed by basename and preserve the expected screw state separately from auto contrast.

- [ ] **Step 8: Run all tests and verify GREEN**

Expected: existing 21 tests plus the new primitive/calibration tests pass.

### Task 2: Browser Line Clamp Detector

**Files:**
- Create: `src/lineClamp/detector.ts`
- Test: `tests/line-clamp-detector.test.ts`

**Interfaces:**
- Consumes: Task 1 pixel and calibration helpers.
- Produces: `LineClampDetector.detect(input): LineClampDetectionResult` and `classifyLineClampStatus(result)`.

- [ ] **Step 1: Write failing detector tests with synthetic ImageData**

Build literal grayscale/RGBA fixtures containing a dark 278×170 rectangle, a bright/dark center screw, and a rotated rectangle; assert success, dimensions, center, screw contrast direction, tilt classification, and no-candidate failure.

- [ ] **Step 2: Run detector tests and verify RED**

Expected: module-not-found failure for `src/lineClamp/detector.ts`.

- [ ] **Step 3: Implement calibration-guided detection**

Use the reference thresholds and calibrated box for center/size; threshold the tight crop, close it, choose the component nearest the calibrated center, derive orientation from second moments, compare inner/outer disk brightness, and override screw presence with calibration when available.

- [ ] **Step 4: Implement uncalibrated centered-crop fallback**

Scan the three reference crop windows, score candidates by area, extent, aspect ratio and center distance, and return `failed` when no candidate survives.

- [ ] **Step 5: Run detector tests and verify GREEN**

Expected: synthetic detector cases pass and existing tests remain green.

### Task 3: Result Mapping and Real Provider

**Files:**
- Create: `src/lineClamp/lineClampDataProvider.ts`
- Create: `src/lineClamp/lineClampViewModel.ts`
- Create: `tests/line-clamp-view-model.test.ts`
- Modify: `src/data/DashboardDataProvider.ts`
- Modify: `src/modules/types.ts`

**Interfaces:**
- Consumes: `LineClampDetectionResult`, existing Mock Provider fallback, and browser `Blob`/object URL.
- Produces: `LineClampInput`, `LineClampDataProvider`, `mapLineClampResult(result, baseViewModel)`.

- [ ] **Step 1: Write failing view-model mapping tests**

Assert OK, missing-screw, tilted, tilted/missing-screw, and failed results produce the correct metric values, trend points, overlay stats/box, CASE level/state/type, media source, and translated error-safe data.

- [ ] **Step 2: Run mapping tests and verify RED**

Expected: module-not-found failure for `src/lineClamp/lineClampViewModel.ts`.

- [ ] **Step 3: Implement result-to-view-model mapping**

Keep the existing eight slots: device status, speed, floor, point, clamp count, anomaly count, confidence/angle, and alert level. Use the detector status to set warning/danger tones and CASE semantics.

- [ ] **Step 4: Implement browser image loading**

Decode `Blob` with `createImageBitmap`, draw to an offscreen canvas, run detection, retain a source object URL for display, and revoke it when replaced.

- [ ] **Step 5: Implement provider selection**

Expose `mockDashboardDataProvider` for all modules and `lineClampDataProvider` only for `lineClamp`; preserve the existing interface for other callers.

- [ ] **Step 6: Run all tests and verify GREEN**

Expected: primitive, detector, mapping, provider, i18n, registry, settings and scale tests pass.

### Task 4: Line Clamp Media Input Without Layout Changes

**Files:**
- Create: `public/resources/line-clamp-sample.jpg`
- Modify: `src/modules/types.ts`
- Modify: `src/components/dashboard/MediaPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/i18n/resources.ts`
- Modify: `src/styles/dashboard.css`

**Interfaces:**
- Consumes: `LineClampInput` and mapped `DashboardViewModel.media`.
- Produces: default sample detection on line-clamp tab and a file input for replacing it; existing three-column geometry remains unchanged.

- [ ] **Step 1: Add failing UI contract test data**

Assert a line-clamp view model carries `media.kind='image'`, a source URL, and normalized detection box while non-line-clamp view models retain placeholder media.

- [ ] **Step 2: Run the UI contract test and verify RED**

Expected: TypeScript type/module failure before the media model is added.

- [ ] **Step 3: Extend media model with optional image source and normalized overlay box**

Do not add a new panel or change grid columns; place the upload control inside the existing media heading/scene area.

- [ ] **Step 4: Wire default sample and `<input type=file accept=image/*>`**

On file selection, rerun only the line-clamp provider and reset its CASE/session state through the existing keyed shell.

- [ ] **Step 5: Render actual image plus detector overlay**

Use `<img>` behind the existing detection overlay, scale box coordinates from source dimensions to the scene using `object-fit: contain`, and fall back to the placeholder only for other modules or failed image decode.

- [ ] **Step 6: Run build and browser smoke test**

Verify the line-clamp tab shows the sample image and real status; upload a local image and verify the result changes without layout movement.

### Task 5: Golden Fixtures, Accessibility, and Delivery

**Files:**
- Create: `tests/fixtures/line-clamp/*.json`
- Modify: `tests/line-clamp-detector.test.ts`
- Modify: `tests/line-clamp-view-model.test.ts`

- [ ] **Step 1: Create four compact golden result fixtures**

Record expected status/angle/screw semantics from the reference program for normal, missing-screw, tilted, and tilted/missing-screw samples; do not commit the full reference image corpus.

- [ ] **Step 2: Run all tests, build, and `git diff --check`**

Expected: all tests pass, production build succeeds, and no whitespace errors appear.

- [ ] **Step 3: Verify Chrome behavior**

Check line-clamp default sample, file upload, failed decode, language/theme switching, module switching, console diagnostics, 1600×900 and non-16:9 scaling.

- [ ] **Step 4: Review and commit**

Commit with `feat: add browser line clamp detection` after confirming only intentional files are changed.

### Task 6: Directory Batch Inspection

**Files:**
- Create: `src/lineClamp/directoryBatch.ts`
- Test: `tests/line-clamp-directory-batch.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/dashboard/MediaPanel.tsx`
- Modify: `src/components/dashboard/DashboardShell.tsx`
- Modify: `src/styles/dashboard.css`
- Modify: `src/i18n/resources.ts`

- [ ] Naturally sort recursively selected images by relative path.
- [ ] Process the queue sequentially with a configurable interval.
- [ ] Support pause, resume, stop, progress, cancellation, and last-frame retention.
- [ ] Accumulate only anomaly and failure CASE records for the current batch.
- [ ] Prefer `showDirectoryPicker()` and fall back to `webkitdirectory`.
- [ ] Release batch resources when starting another directory or leaving the module.
