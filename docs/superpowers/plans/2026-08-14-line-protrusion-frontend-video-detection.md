# 配线突出纯前端视频检测实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在线突出识别页实现本地视频、双导线手动画线标定、逐帧光斑追踪、阈值 CASE 和现有 Dashboard 实时展示。

**Architecture:** 纯 TypeScript 检测器只消费像素和标定数据；独立 CASE 状态机与 mapper 产生 Dashboard 数据；专用 React 视频面板负责视频、Canvas 帧和指针标定；App 只负责模块数据和 CASE 聚合。现有线夹目录批处理保持不变。

**Tech Stack:** React 19、TypeScript、原生 HTMLVideoElement/Canvas/ImageData、Node test runner、Vite。

**Spec:** `docs/superpowers/specs/2026-08-14-line-protrusion-frontend-video-detection-design.md`

## Global Constraints

- 全部检测能力位于浏览器 TypeScript，不使用 Python、OpenCV.js、HTTP、WebSocket、CLI、Tauri 或后端进程。
- 默认预警 `2°`、报警 `5°`、灵敏度 `1×`。
- 保持三栏布局、面板顺序、主题系统和 1600×900 等比例缩放。
- 不提交 `docs/reference_program/配线突出识别/外寄Part1_1_.mp4`。
- 不创建 Git worktree，不调度子代理。

---

### Task 1: 三光斑标定与逐帧检测算法

**Files:**
- Create: `src/lineProtrusion/types.ts`
- Create: `src/lineProtrusion/detector.ts`
- Create: `tests/line-protrusion-detector.test.ts`

**Interfaces:**
- Consumes: RGBA `LineProtrusionImageData`、源坐标拖线、归一化 `WireCalibration[]`、`LineProtrusionConfig`。
- Produces: `findSpotsOnLine(...)`、`detectLineProtrusion(...)`、`classifyDeviation(...)` 和 `LineProtrusionDetectionResult`。

- [x] **Step 1: 写三光斑定位失败测试**

```ts
test('finds one brightness centroid in each third of a horizontal scan band', () => {
  const image = makeDarkImage(300, 120)
  paintSpot(image, 50, 60, 255)
  paintSpot(image, 150, 60, 220)
  paintSpot(image, 250, 60, 240)
  assert.deepEqual(roundSpots(findSpotsOnLine(image, 60, 0, 299)), [
    { x: 50, y: 60 }, { x: 150, y: 60 }, { x: 250, y: 60 },
  ])
})
```

- [x] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `node --test tests/line-protrusion-detector.test.ts`

- [x] **Step 3: 实现灰度列累加和每段 ±4px 亮度质心**

`findSpotsOnLine` 交换反向 X、限制图像边界、拒绝短于 10px 的线，并返回三个源图坐标；任一段无亮度时返回 `null`。

- [x] **Step 4: 写追踪、偏移和状态失败测试**

```ts
test('tracks the middle spot and classifies warning and alarm thresholds', () => {
  const calibration = calibrationAtY(100)
  const warning = detectLineProtrusion(frameWithMiddleAt(103), [calibration], { warningDeg: 2, alarmDeg: 5, sensitivity: 1 })
  const alarm = detectLineProtrusion(frameWithMiddleAt(106), [calibration], { warningDeg: 2, alarmDeg: 5, sensitivity: 1 })
  assert.equal(warning.wires[0].state, 'warning')
  assert.equal(warning.wires[0].deviationDeg, 3)
  assert.equal(alarm.state, 'alarm')
})
```

- [x] **Step 5: 运行测试并确认偏移 API 缺失失败**

Run: `node --test tests/line-protrusion-detector.test.ts`

- [x] **Step 6: 实现最大宽度 600px 的最近邻灰度缩放、±50px 搜索和分类**

左右点保留标定 Y，中点使用阈值以上亮度加权质心；结果返回源图归一化坐标、每根导线状态和报警优先的总状态。

- [x] **Step 7: 运行算法测试并确认通过**

Run: `node --test tests/line-protrusion-detector.test.ts`

- [x] **Step 8: 提交算法**

```bash
git add src/lineProtrusion/types.ts src/lineProtrusion/detector.ts tests/line-protrusion-detector.test.ts
git commit -m "feat: add line protrusion spot detector"
```

### Task 2: CASE 状态机和 Dashboard 映射

**Files:**
- Create: `src/lineProtrusion/caseTracker.ts`
- Create: `src/lineProtrusion/lineProtrusionViewModel.ts`
- Create: `src/lineProtrusion/lineProtrusionDataProvider.ts`
- Modify: `src/modules/types.ts`
- Test: `tests/line-protrusion-case-tracker.test.ts`
- Test: `tests/line-protrusion-view-model.test.ts`
- Test: `tests/line-protrusion-provider.test.ts`

**Interfaces:**
- Consumes: `LineProtrusionDetectionResult`、当前配置、当前视频 URL 和基础 `DashboardViewModel`。
- Produces: `LineProtrusionCaseTracker.next(result, timestamp)`、`mapLineProtrusionResult(...)`、`lineProtrusionDataProvider.getDashboard()`。

- [x] **Step 1: 写 CASE 状态迁移失败测试**

```ts
test('emits cases only on ok-to-warning, ok-to-alarm, and warning-to-alarm', () => {
  const tracker = new LineProtrusionCaseTracker()
  assert.equal(tracker.next(result('warning'), '2026-08-14 10:00:00').length, 1)
  assert.equal(tracker.next(result('warning'), '2026-08-14 10:00:01').length, 0)
  assert.equal(tracker.next(result('alarm'), '2026-08-14 10:00:02').length, 1)
  assert.equal(tracker.next(result('warning'), '2026-08-14 10:00:03').length, 0)
  tracker.next(result('ok'), '2026-08-14 10:00:04')
  assert.equal(tracker.next(result('warning'), '2026-08-14 10:00:05').length, 1)
})
```

- [x] **Step 2: 运行测试并确认状态机缺失失败**

Run: `node --test tests/line-protrusion-case-tracker.test.ts`

- [x] **Step 3: 实现每根导线独立状态和 LPR CASE 编号**

预警 CASE 为橙色，报警 CASE 为红色；点位格式为语言无关的 `C1-118 / W1`，事件键分别为 `event.lineProtrusionWarning` 和 `event.lineProtrusionAlarm`。

- [x] **Step 4: 写 mapper 和 provider 失败测试**

```ts
test('maps maximum wire deviation and geometry into line protrusion dashboard', async () => {
  const base = await lineProtrusionDataProvider.getDashboard()
  const mapped = mapLineProtrusionResult(result('alarm'), base, [], config, 'blob:video')
  assert.equal(mapped.media.kind, 'video')
  assert.equal(mapped.metrics.find(item => item.labelKey === 'metrics.protrusion')?.value, '6')
  assert.equal(mapped.metrics.find(item => item.labelKey === 'metrics.eventLevel')?.tone, 'danger')
  assert.equal(mapped.overlay.wires?.length, 1)
})
```

- [x] **Step 5: 运行测试并确认媒体和覆盖层类型缺失失败**

Run: `node --test tests/line-protrusion-view-model.test.ts tests/line-protrusion-provider.test.ts`

- [x] **Step 6: 扩展视频媒体与导线覆盖层类型并实现 mapper/provider**

`DashboardViewModel.media.kind` 增加 `video`；`DetectionOverlayModel.wires` 保存归一化三点和状态。Provider 只返回清空 Mock CASE 的线突出基础 Dashboard，不拥有用户文件 URL。

- [x] **Step 7: 运行 Task 2 测试并确认通过**

Run: `node --test tests/line-protrusion-case-tracker.test.ts tests/line-protrusion-view-model.test.ts tests/line-protrusion-provider.test.ts`

- [x] **Step 8: 提交映射层**

```bash
git add src/lineProtrusion src/modules/types.ts tests/line-protrusion-case-tracker.test.ts tests/line-protrusion-view-model.test.ts tests/line-protrusion-provider.test.ts
git commit -m "feat: map line protrusion detection results"
```

### Task 3: 视频会话、标定交互和模块接入

**Files:**
- Create: `src/components/dashboard/LineProtrusionMedia.tsx`
- Create: `src/lineProtrusion/videoSession.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/dashboard/DashboardShell.tsx`
- Modify: `src/components/dashboard/MediaPanel.tsx`
- Modify: `src/components/dashboard/DetectionOverlay.tsx`
- Test: `tests/line-protrusion-video-session.test.ts`

**Interfaces:**
- Consumes: 用户视频 `File`、video/canvas 元素、`onDetection`/`onReset` 回调。
- Produces: `LineProtrusionVideoSession` 生命周期和 `LineProtrusionControls` React 控制模型。

- [x] **Step 1: 写会话状态与资源释放失败测试**

```ts
test('replaces video URLs and stops frame work on dispose', () => {
  const revoked: string[] = []
  const session = new LineProtrusionVideoSession({
    createObjectUrl: file => `blob:${file.size}`,
    revokeObjectUrl: url => revoked.push(url),
  })
  session.load(new Blob(['first'], { type: 'video/mp4' }))
  session.load(new Blob(['second-video'], { type: 'video/mp4' }))
  session.dispose()
  assert.deepEqual(revoked, ['blob:5', 'blob:12'])
  assert.equal(session.status, 'idle')
})
```

- [x] **Step 2: 运行测试并确认会话类缺失失败**

Run: `node --test tests/line-protrusion-video-session.test.ts`

- [x] **Step 3: 实现不依赖 DOM 的会话状态和 URL 生命周期**

会话状态为 `idle | ready | calibrating | running | paused | stopped | completed | error`，保存配置、两份可选标定和当前 URL；`load/reset/dispose` 都清理上一轮状态。

- [x] **Step 4: 实现专用视频面板和水平拖线标定**

面板使用可见 `<video>`、隐藏帧 Canvas 和绝对定位 SVG/HTML 覆盖层。指针事件把 CSS 内容坐标映射到 `videoWidth/videoHeight`，释放时调用 `findSpotsOnLine`。播放循环优先 `requestVideoFrameCallback`，回退 `requestAnimationFrame`。

- [x] **Step 5: 接入 App 和现有 DashboardShell**

线突出模块初始数据改用 `lineProtrusionDataProvider`；检测回调通过 tracker 与 mapper 更新指标、趋势、覆盖层和 CASE。离开模块时暂停视频并由组件卸载回收 URL。线夹继续接收原有 `BatchControls`。

- [x] **Step 6: 扩展覆盖层绘制两条基线和六个光斑**

正常使用成功色、预警使用橙色、报警使用危险色；每根线显示 `W1/W2` 和偏移角度，不改变原检测框覆盖层行为。

- [x] **Step 7: 运行会话测试和生产构建**

Run: `node --test tests/line-protrusion-video-session.test.ts`

Run: `npm run build`

- [x] **Step 8: 提交视频交互**

```bash
git add src/App.tsx src/components/dashboard src/lineProtrusion/videoSession.ts tests/line-protrusion-video-session.test.ts
git commit -m "feat: add line protrusion video calibration"
```

### Task 4: 双语样式、完整验证和浏览器验收

**Files:**
- Modify: `src/i18n/resources.ts`
- Modify: `src/styles/dashboard.css`
- Modify: `docs/superpowers/plans/2026-08-14-line-protrusion-frontend-video-detection.md`

**Interfaces:**
- Consumes: 已完成的视频控制和检测状态。
- Produces: 中英文文案、稳定的 1600×900 控制条与覆盖层样式、完整验收记录。

- [x] **Step 1: 添加中英文视频、标定、导线、阈值、预警和报警键**

中英文资源必须保持相同键集合；现有 i18n 测试会捕获漏项。

- [x] **Step 2: 添加紧凑控制条、视频 content-box 和标定覆盖层样式**

控制条不得挤压在线状态；数值输入固定宽度；视频使用 `object-fit: contain`；交互层尺寸与实际视频内容一致；所有控件在 1600×900 内无重叠。

- [x] **Step 3: 运行完整自动验证**

Run: `npm test`

Expected: 所有测试通过且 0 failed。

Run: `npm run build`

Expected: TypeScript 和 Vite 构建退出码 0。

Run: `git diff --check`

Expected: 无输出且退出码 0。

- [x] **Step 4: 使用 Chrome MCP 验收参考视频**

检查选择视频、导线 1/2 标定、播放/暂停/停止、阈值输入、CASE 去重、自然结束停留、模块切换资源释放、控制台项目错误和 1600×900 页面溢出。

- [x] **Step 5: 更新计划复选框并提交收尾**

```bash
git add src/i18n/resources.ts src/styles/dashboard.css docs/superpowers/plans/2026-08-14-line-protrusion-frontend-video-detection.md
git commit -m "feat: complete browser line protrusion inspection"
```
