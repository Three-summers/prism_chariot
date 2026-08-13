# 线夹识别纯前端检测设计

## 背景

线夹识别模块目前使用 Mock Dashboard 数据。参考程序位于 `docs/reference_program/线夹识别`，其核心算法在 `detector.py` 中，使用标定框、灰度阈值、形态学闭运算、轮廓候选筛选、旋转角度和螺钉中心亮度对比，输出线夹位置、尺寸、面积、角度、螺钉状态和倾斜状态。

## 目标

1. 不引入 Python、HTTP、CLI、WebSocket、Tauri 或任何后端进程。
2. 在浏览器 TypeScript 中完成图片读取、灰度/阈值/形态学/轮廓近似、标定读取和检测结果计算。
3. 线夹识别继续使用现有生命感知三栏布局；只替换线夹模块的数据来源、媒体内容和检测叠加数据。
4. 支持默认演示图片和用户选择图片；用户图片不能依赖文件名标定才能检测。
5. 对参考程序的四类结果保持语义一致：`OK`、`NO SCREW`、`TILTED`、`TILTED + NO SCREW`，并保留检测失败状态。

## 非目标

- 不在浏览器中复刻 PyQt 校准界面。
- 不实现视频流逐帧处理；首版处理单张图片，Provider 接口保留异步扩展点。
- 不把参考目录的 140MB 图片集全部复制到运行时资源。
- 不修改 DashboardShell 的三栏宽度、面板顺序、主题或缩放算法。

## 算法边界

纯 TypeScript 检测器消费 `ImageData` 和可选标定记录：

```ts
interface LineClampCalibration {
  filename: string
  box: { x: number; y: number; width: number; height: number }
  screw: { x: number; y: number; expected: boolean }
}

interface LineClampDetectionResult {
  filename: string
  width: number
  height: number
  center: { x: number; y: number }
  angleDeg: number
  area: number
  success: boolean
  hasScrew: boolean
  screwContrast: number
  isTilted: boolean
  status: 'ok' | 'no-screw' | 'tilted' | 'tilted-no-screw' | 'failed'
  box: { x: number; y: number; width: number; height: number } | null
  error?: string
}
```

The detector uses calibration-guided mode when the filename exists in the loaded calibration map. It falls back to a centered crop and candidate scoring for uploaded images without calibration. Thresholds mirror the reference program: screw contrast `12`, tilt angle `3°`, target area `46500`, candidate area `43000–50000`, and aspect ratio target `1.65` with broad bounds `0.7–2.5`.

The browser implementation uses no third-party image-processing runtime in the first pass. Small, deterministic typed-array helpers implement grayscale conversion, thresholding, rectangular closing, connected components, bounding boxes, and minimum-area orientation. This keeps the bundle and deployment simple; a library can be added later only if benchmarked against these contracts.

## Data flow

```text
<input type=file> / bundled sample
          |
          v
createImageBitmap -> canvas -> ImageData
          |
          v
LineClampDetector.detect(image)
          |
          v
LineClampDataProvider -> DashboardViewModel
          |
          v
existing DashboardShell / MediaPanel / MetricsPanel / CaseTable
```

The provider returns a normal `DashboardViewModel`; other modules continue using the existing Mock Provider. The line-clamp media model carries a browser object URL for the source image and normalized box coordinates for the existing overlay. Object URLs are revoked on replacement and module unmount.

## Failure behavior

- Invalid or unreadable files produce a translated provider error while the header and shell remain visible.
- No suitable component produces a `failed` result with an explanatory error and a CASE entry marked for review.
- Large images are decoded once and resized only for display; detection runs against source pixel dimensions.

## Verification

- Unit tests cover grayscale/threshold/closing, candidate scoring, calibration parsing, screw contrast, status classification, and result-to-view-model mapping.
- Golden fixtures use four small reference outputs copied from the reference program: normal, missing screw, tilted, and tilted/missing screw.
- Browser verification checks upload, default sample, real metrics/overlay/CASE, module switching, language/theme controls, and unchanged 1600×900 scaling.

## Directory Batch Inspection

The line-clamp module accepts an image directory instead of a single uploaded image. Chromium browsers use `showDirectoryPicker()` when available and fall back to a `webkitdirectory` file input. Images are recursively collected and naturally sorted by relative path.

The browser processes one image at a time and updates the existing media panel after every detection. A compact control strip in the media panel exposes the interval in seconds, pause/resume, stop, and current/total progress. Interval changes apply before a subsequent image, pause and stop preserve the current preview, and normal completion leaves the last image visible.

Only tilted, missing-screw, combined, and detection-failed results create CASE records. Records accumulate for the active directory batch and use the image relative path as their source point. Starting a new directory clears the previous batch; leaving the module cancels processing and releases retained blobs and object URLs.
