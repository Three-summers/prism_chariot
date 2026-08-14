# Magnetic Plate Frontend Detection Design

## Goal

Add a browser-only magnetic base plate inspection flow to the existing dashboard. The detector must classify a continuous horizontal laser stripe as normal, classify a target stripe split into two significant segments as a warped plate, and ignore bright reflections outside the target stripe.

## Scope

- Keep the existing life-sensing three-column dashboard layout and 1600x900 proportional scaling.
- Accept one local image at a time in the magnetic plate module.
- Decode and inspect images entirely in TypeScript with browser Canvas APIs.
- Populate the existing media, metrics, trend, CASE, overlay, and resolution contracts with real detection output.
- Preserve Chinese and English UI support and all configured themes.
- Do not add Python, a backend service, OpenCV.js, or a new runtime dependency.

Directory batch processing and camera calibration controls are outside this first magnetic plate implementation.

## Detection Model

The detector analyzes a normalized region of interest covering the lower-left horizontal laser stripe. Its thresholds and ROI bounds live in one exported TypeScript configuration object so fixed-camera installations can tune them without changing the algorithm.

The processing pipeline is:

1. Convert RGBA pixels inside the ROI to luminance.
2. Derive a local brightness threshold from the ROI distribution.
3. Build a binary bright-pixel mask.
4. Find connected bright components.
5. Reject components that are too small, too vertical, too short, or outside the target region.
6. Describe remaining horizontal components by normalized bounding boxes and fitted center lines.
7. Classify one sufficiently long connected component as `normal`.
8. Classify two significant horizontal components separated by a spatial gap or center-line jump as `warped`.
9. Return `failed` when no trustworthy target stripe can be found.

The right-side V-shaped and vertical highlights in `docs/images/磁底板翘起.jpg` are excluded primarily by the ROI, then by horizontal aspect-ratio and coverage filters. Brightness alone never determines the result.

## Data Contracts

A focused `src/magneticPlate` module will own:

- Image and detector result types.
- Pure pixel and connected-component analysis.
- Browser image decoding and object URL lifecycle.
- Dashboard view-model mapping.

The detection result includes image dimensions, status, detected horizontal segments, segment count, estimated gap distance in pixels, continuity percentage, ROI bounds, and an optional failure reason.

The shared overlay model gains an optional magnetic-stripe segment collection. The dashboard overlay renders detected segments and the gap without changing other module overlays.

## Dashboard Behavior

Opening the magnetic plate module shows its existing placeholder with neutral values and no synthetic CASE records. Selecting an image runs inspection and keeps the uploaded image visible.

For a successful result:

- The image overlay marks the analyzed ROI and detected horizontal segment or segments.
- Status metrics show segment count, gap distance, continuity, and alert level.
- The trend records gap distance in pixels against a configured threshold.
- A warped result creates one real magnetic-plate CASE and selects it.
- A normal result produces no anomaly CASE.

For a failed result, the shell remains visible, metrics show an inspection failure, the media error explains that no valid target stripe was found, and no fabricated geometry is displayed.

## Error Handling

- Invalid or undecodable files produce a visible localized load error.
- Stale image requests cannot replace the latest result.
- Replaced and disposed object URLs are revoked.
- Detector failures are represented as normal dashboard data rather than throwing through React.

## Testing

Pure detector tests use synthetic images for:

- One continuous horizontal stripe.
- Two horizontal segments with a center gap or vertical jump.
- A valid horizontal stripe plus a bright right-side vertical reflection.
- Reflection-only and empty images.

Provider tests cover browser dependency injection and object URL cleanup. View-model tests cover metrics, trend, overlay, CASE creation, and failure mapping. The production build and complete test suite must pass.

Chrome verification at 1600x900 uses `docs/images/磁底板翘起.jpg` to confirm that the left target is classified as warped, the right reflection is ignored, overlay geometry aligns with the source image, bilingual labels render, and no dashboard elements overlap.
