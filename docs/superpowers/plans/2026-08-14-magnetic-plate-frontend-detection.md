# Magnetic Plate Frontend Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-only magnetic plate image inspection that treats one continuous lower-left laser stripe as normal, reports a split stripe as warped, and ignores right-side reflection.

**Architecture:** A focused `src/magneticPlate` module owns pure RGBA analysis, browser image decoding/object URL lifecycle, and conversion to the shared dashboard contract. The existing media panel receives one small image-selection control, while the shared overlay model gains normalized stripe geometry rendered over the source image.

**Tech Stack:** TypeScript, React, Canvas 2D browser APIs, Node test runner, Vite

**Spec:** `docs/superpowers/specs/2026-08-14-magnetic-plate-frontend-detection-design.md`

## Global Constraints

- Keep the existing life-sensing three-column dashboard layout and 1600x900 proportional scaling.
- Run all detection in TypeScript in the browser; do not add Python, a backend, OpenCV.js, or a runtime dependency.
- Accept one local image at a time and keep its object URL alive only while it is current.
- Keep Chinese and English labels complete and theme-neutral.
- Do not use a worktree or subagent for this implementation, per the user's explicit instruction.

---

### Task 1: Pure Magnetic Stripe Detector

**Files:**
- Create: `src/magneticPlate/types.ts`
- Create: `src/magneticPlate/detector.ts`
- Test: `tests/magnetic-plate-detector.test.ts`

**Interfaces:**
- Produces: `MAGNETIC_PLATE_CONFIG: MagneticPlateConfig`
- Produces: `MagneticPlateDetector.detect(image: MagneticPlateImageData): MagneticPlateDetectionResult`
- `MagneticPlateDetectionResult` contains `width`, `height`, `status`, `roi`, `segments`, `gapPx`, `continuity`, and optional `error`.

- [ ] **Step 1: Write detector tests with literal synthetic RGBA fixtures**

Cover one long horizontal stripe (`normal`), two aligned or vertically shifted segments (`warped`), a valid stripe plus a right-side vertical reflection (`normal`), and reflection-only/empty images (`failed`).

- [ ] **Step 2: Run `npm test -- tests/magnetic-plate-detector.test.ts` and verify failure because the detector module is absent**

- [ ] **Step 3: Implement adaptive ROI luminance thresholding and 8-connected component analysis**

Use normalized ROI coordinates; calculate a local upper-quantile threshold; retain components only when their width, area, aspect ratio, and horizontal position meet `MAGNETIC_PLATE_CONFIG`; classify the sorted target segments by their combined horizontal coverage and inter-segment gap/center-line jump.

- [ ] **Step 4: Run the detector test and verify all cases pass**

### Task 2: Dashboard Provider and View Model

**Files:**
- Create: `src/magneticPlate/magneticPlateDataProvider.ts`
- Create: `src/magneticPlate/magneticPlateViewModel.ts`
- Modify: `src/modules/types.ts`
- Modify: `src/i18n/resources.ts`
- Test: `tests/magnetic-plate-provider.test.ts`
- Test: `tests/magnetic-plate-view-model.test.ts`

**Interfaces:**
- Produces: `MagneticPlateDataProvider.getDashboard(): Promise<DashboardViewModel>` for neutral initial state.
- Produces: `MagneticPlateDataProvider.inspect(file: Blob): Promise<MagneticPlateDashboardResult>` for decoded local images.
- Produces: `MagneticPlateDataProvider.dispose(): void` for URL cleanup and stale-request invalidation.
- Produces: `mapMagneticPlateResult(result, base, sourceUrl): DashboardViewModel`.
- Extends: `DetectionOverlayModel.stripes` and `DetectionOverlayModel.gap` using normalized source-image coordinates.

- [ ] **Step 1: Write failing mapper tests**

Assert warped output shows segment count, pixel gap, continuity, one anomaly CASE, a sliding pixel trend, ROI/segments/gap overlay, and source image dimensions. Assert normal output has no CASE and failed output has no fabricated stripe geometry.

- [ ] **Step 2: Run the mapper test and verify the missing exports fail**

- [ ] **Step 3: Implement the pure view-model mapper and bilingual keys**

Map the existing magnetic metric slots to inspection status, segment count, gap, continuity, and alert level. Preserve the existing trend length while appending `gapPx`; convert the configured minimum gap ratio to pixels for the threshold series. Build only one CASE for `warped`.

- [ ] **Step 4: Run the mapper test and verify it passes**

- [ ] **Step 5: Write failing provider lifecycle tests**

Inject decode/create/revoke dependencies; verify local image mapping, previous URL revocation, `dispose()`, and that an older async request cannot become the retained source URL.

- [ ] **Step 6: Implement Canvas image decoding, neutral initial state, URL lifecycle, and stale request handling**

- [ ] **Step 7: Run provider and mapper tests and verify they pass**

### Task 3: Image Selection and Overlay Rendering

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/dashboard/DashboardShell.tsx`
- Modify: `src/components/dashboard/MediaPanel.tsx`
- Modify: `src/components/dashboard/DetectionOverlay.tsx`
- Modify: `src/styles/dashboard.css`
- Modify: `src/i18n/resources.ts`

**Interfaces:**
- `MagneticPlateControls.onImage(file: File): void` is passed from `DashboardApp` through `DashboardShell` to `MediaPanel`.
- The existing image frame renders any image module with module-specific accessible text and the shared normalized overlay.

- [ ] **Step 1: Add magnetic plate provider selection and load-error state to `DashboardApp`**

Reset to neutral magnetic data on module entry, inspect one selected file, ignore a completion after navigation, and dispose the provider on replacement/unmount.

- [ ] **Step 2: Add the single-image picker without changing dashboard layout**

Show a compact image button only for magnetic plate, use `accept="image/*"`, reset the file input after selection, and render localized detection errors within the scene.

- [ ] **Step 3: Render normalized ROI, stripe segments, and gap marker**

Use CSS-positioned overlay elements inside the existing image frame. Give normal segments the active accent and warped segments/gap the danger color; keep pointer events disabled and avoid changing image sizing.

- [ ] **Step 4: Run `npm test` and `npm run build`**

- [ ] **Step 5: Start Vite and verify at 1600x900 in Chrome**

Open magnetic plate inspection, select `docs/images/磁极板翘起.jpg`, confirm `warped`, two left target segments, one real CASE, ignored right reflection, aligned overlay, bilingual copy, and no overlap.
