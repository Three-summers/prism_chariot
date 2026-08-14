# Life Sensing Frontend Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有生命感知三栏驾驶舱中，以纯 TypeScript 模拟并解析 TI mmWave 二进制帧，实时展示双人跟踪、生命体征、异常状态与 CASE。

**Architecture:** `SimulatedSerialSource` 和未来串口源实现同一字节源接口，字节依次经过标准帧分包、TLV 解析、按人员隔离的状态分析、CASE 去重和 Dashboard View Model 映射。React 仅订阅 Provider，并用主题化 SVG 雷达组件绘制点云、人员和轨迹。

**Tech Stack:** TypeScript、React、SVG、Node.js test runner、Vite；不新增运行时依赖。

**Spec:** `docs/superpowers/specs/2026-08-14-life-sensing-frontend-pipeline-design.md`

## Global Constraints

- 全部协议、计算和模拟逻辑运行在浏览器 TypeScript 中，不增加 Python、WebSocket 或桌面后端。
- 模拟源约 10 Hz，36 秒循环，最多 2 人，输出与真实源相同的 `Uint8Array` 数据契约。
- 支持 TLV `1020`、`1010`、`1012`、`1040`；坏帧不得进入状态分析或生成 CASE。
- 心率中位数窗口为 10，心跳和呼吸波形窗口均为 150 点。
- 状态优先级固定为 `fallen > vitalsAbnormal > breathHold > motionless > normal`。
- 中英文资源键必须完全一致；样式只能使用现有主题 token 或语义色。
- 不使用 worktree，不提交无关的参考视频文件。

---

### Task 1: mmWave Protocol Types And Decoder

**Files:**
- Create: `src/lifeSensing/types.ts`
- Create: `src/lifeSensing/protocol.ts`
- Create: `tests/life-sensing-protocol.test.ts`

**Interfaces:**
- Consumes: 任意分块的 `Uint8Array`。
- Produces: `MmWaveStreamDecoder.push(chunk): MmWaveFrame[]`、`encodeMmWaveFrame(frame): Uint8Array`，以及点云、目标、高度、生命体征协议类型。

- [ ] **Step 1: Write failing protocol tests**

```ts
test('parses supported TLVs from split and joined standard frames', () => {
  const bytes = encodeMmWaveFrame(protocolFixture(7))
  const decoder = new MmWaveStreamDecoder()
  assert.equal(decoder.push(bytes.slice(0, 17)).length, 0)
  const frames = decoder.push(bytes.slice(17))
  assert.equal(frames[0].frameNumber, 7)
  assert.equal(frames[0].points.length, 1)
  assert.equal(frames[0].tracks[0].id, 1)
  assert.equal(frames[0].heights[0].maxZ, 1.72)
  assert.equal(frames[0].vitalSigns[0].heartWaveform.length, 15)
})

test('drops an invalid TLV frame and resynchronizes at the next magic word', () => {
  const decoder = new MmWaveStreamDecoder()
  const frames = decoder.push(concatBytes(corruptTlvLength(), encodeMmWaveFrame(protocolFixture(9))))
  assert.equal(frames.length, 1)
  assert.equal(frames[0].frameNumber, 9)
  assert.equal(decoder.parseErrorCount, 1)
})
```

- [ ] **Step 2: Run the protocol tests and verify the missing-module failure**

Run: `node --test tests/life-sensing-protocol.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lifeSensing/protocol.ts`.

- [ ] **Step 3: Implement exact protocol contracts and parsing**

```ts
export interface MmWaveFrame {
  frameNumber: number
  timestampCycles: number
  points: RadarPoint[]
  tracks: TrackedTarget[]
  heights: TargetHeight[]
  vitalSigns: VitalSignsReading[]
}

export class MmWaveStreamDecoder {
  readonly maxPacketLength: number
  parseErrorCount = 0
  push(chunk: Uint8Array): MmWaveFrame[]
  reset(): void
}

export function encodeMmWaveFrame(frame: MmWaveFrame): Uint8Array
```

Implement the 40-byte little-endian standard header, 8-byte TLV headers, 32-byte packet padding, magic-word resynchronization, unknown-TLV skipping, `1020` signed decompression and spherical-to-Cartesian conversion, `1010` `I27f`, `1012` `I2f`, and `1040` `2H33f`. Reject payloads whose fixed record size or point payload remainder is invalid.

- [ ] **Step 4: Run protocol tests**

Run: `node --test tests/life-sensing-protocol.test.ts`

Expected: PASS, including split frame, sticky frames, noise, unknown TLV, corrupt length, and all four supported TLVs.

- [ ] **Step 5: Commit protocol implementation**

```bash
git add src/lifeSensing/types.ts src/lifeSensing/protocol.ts tests/life-sensing-protocol.test.ts
git commit -m "feat: parse life sensing radar frames"
```

### Task 2: Per-Person State Analyzer

**Files:**
- Create: `src/lifeSensing/analyzer.ts`
- Create: `tests/life-sensing-analyzer.test.ts`
- Modify: `src/lifeSensing/types.ts`

**Interfaces:**
- Consumes: `LifeSensingAnalyzer.update(frame: MmWaveFrame, receivedAtMs: number): LifeSensingSnapshot`。
- Produces: 按目标 ID 隔离的 `PersonSnapshot`，包含滤波后心率、呼吸率、位置、速度、高度、状态、150 点波形和轨迹。

- [ ] **Step 1: Write failing analyzer tests for windows and state thresholds**

```ts
test('keeps median and waveform histories isolated per person', () => {
  const analyzer = new LifeSensingAnalyzer()
  for (let index = 0; index < 10; index += 1) {
    analyzer.update(frameAt(index * 100, person(1, { heartRate: index === 9 ? 180 : 70 }), person(2, { heartRate: 82 })), index * 100)
  }
  const snapshot = analyzer.snapshot()
  assert.equal(snapshot.people.find((item) => item.id === 1)?.heartRate, 70)
  assert.equal(snapshot.people.find((item) => item.id === 2)?.heartRate, 82)
  assert.equal(snapshot.people[0].heartWaveform.length, 150)
})

test('applies duration thresholds and fixed state priority', () => {
  const analyzer = new LifeSensingAnalyzer()
  feedRange(analyzer, 0, 5100, 100, (time) => frameAt(time, person(1, { speed: 0.01 })))
  assert.equal(analyzer.snapshot().people[0].state, 'motionless')
  feedRange(analyzer, 5200, 8300, 100, (time) => frameAt(time, person(1, { speed: 0.01, breathDeviation: 0.01, heartRate: 45 })))
  assert.equal(analyzer.snapshot().people[0].state, 'vitalsAbnormal')
})
```

- [ ] **Step 2: Run analyzer tests and verify failure**

Run: `node --test tests/life-sensing-analyzer.test.ts`

Expected: FAIL because `LifeSensingAnalyzer` does not exist.

- [ ] **Step 3: Implement analyzer histories and timers**

```ts
export type LifeState = 'notDetected' | 'normal' | 'motionless' | 'breathHold' | 'vitalsAbnormal' | 'fallen'

export class LifeSensingAnalyzer {
  update(frame: MmWaveFrame, receivedAtMs: number): LifeSensingSnapshot
  snapshot(): LifeSensingSnapshot
  reset(): void
}
```

Use magnitude of XYZ velocity for motionless detection, valid nonzero heart-rate samples for the 10-value median, timestamped height samples for the 2.5-second fall comparison, and independent start timestamps for the 5-second, 2-second and 3-second duration rules. Missing targets and `breathDeviation === 0` become `notDetected` and reset duration timers without creating domain anomalies.

- [ ] **Step 4: Run analyzer tests**

Run: `node --test tests/life-sensing-analyzer.test.ts`

Expected: PASS for boundary timing, fall recovery, waveform limits, median filtering and two-person isolation.

- [ ] **Step 5: Commit analyzer**

```bash
git add src/lifeSensing/types.ts src/lifeSensing/analyzer.ts tests/life-sensing-analyzer.test.ts
git commit -m "feat: analyze per-person life sensing state"
```

### Task 3: Deterministic Binary Simulator

**Files:**
- Create: `src/lifeSensing/simulator.ts`
- Create: `tests/life-sensing-simulator.test.ts`
- Modify: `src/lifeSensing/types.ts`

**Interfaces:**
- Consumes: `LifeSensingByteSource.start(sink)` and `encodeMmWaveFrame(frame)`.
- Produces: deterministic `createSimulatedFrame(elapsedMs, frameNumber)` and `SimulatedSerialSource.start()/stop()`.

- [ ] **Step 1: Write failing simulator and source lifecycle tests**

```ts
test('cycles deterministic two-person phases through binary frames', () => {
  const first = createSimulatedFrame(0, 1)
  const repeated = createSimulatedFrame(36_000, 361)
  assert.equal(first.tracks.length, 2)
  assert.deepEqual(repeated.tracks.map(({ x, y, z }) => ({ x, y, z })), first.tracks.map(({ x, y, z }) => ({ x, y, z })))
  assert.ok(createSimulatedFrame(20_000, 201).heights[0].maxZ < first.heights[0].maxZ * 0.6)
})

test('stops emitting binary chunks after source stop', () => {
  const chunks: Uint8Array[] = []
  const clock = new ManualSimulatorClock()
  const source = new SimulatedSerialSource({ clock })
  source.start({ onBytes: (chunk) => chunks.push(chunk), onStatus() {}, onError(error) { throw error } })
  clock.tick(100)
  source.stop()
  const countAfterStop = chunks.length
  clock.tick(100)
  assert.ok(countAfterStop > 0)
  assert.equal(chunks.length, countAfterStop)
})
```

- [ ] **Step 2: Run simulator tests and verify failure**

Run: `node --test tests/life-sensing-simulator.test.ts`

Expected: FAIL because the simulator module does not exist.

- [ ] **Step 3: Implement deterministic frames and the simulated byte source**

```ts
export interface LifeSensingByteSource {
  readonly kind: 'simulated' | 'serial'
  start(sink: LifeSensingByteSink): Promise<void> | void
  stop(): Promise<void> | void
}

export interface SimulatorClock {
  now(): number
  setInterval(callback: () => void, intervalMs: number): unknown
  clearInterval(handle: unknown): void
}

export class SimulatedSerialSource implements LifeSensingByteSource {
  readonly kind = 'simulated' as const
  constructor(options?: { clock?: SimulatorClock })
  start(sink: LifeSensingByteSink): void
  stop(): void
}
```

Generate 36-second phases with fixed formulas and two distinct trajectory/waveform phases. Encode each 100 ms frame, then emit it in changing chunk sizes so split and joined-byte behavior is exercised. Inject a minimal interval clock in tests so lifecycle behavior is deterministic.

- [ ] **Step 4: Run simulator tests**

Run: `node --test tests/life-sensing-simulator.test.ts`

Expected: PASS for deterministic phases, binary chunking and source start/stop/restart.

- [ ] **Step 5: Commit simulator**

```bash
git add src/lifeSensing/simulator.ts src/lifeSensing/types.ts tests/life-sensing-simulator.test.ts
git commit -m "feat: simulate life sensing radar frames"
```

### Task 4: CASE Tracking And Dashboard Mapping

**Files:**
- Create: `src/lifeSensing/caseTracker.ts`
- Create: `src/lifeSensing/lifeSensingViewModel.ts`
- Create: `tests/life-sensing-case-tracker.test.ts`
- Create: `tests/life-sensing-view-model.test.ts`
- Modify: `src/modules/types.ts`

**Interfaces:**
- Consumes: `LifeSensingSnapshot`, selected person ID and accumulated domain cases.
- Produces: `LifeSensingCaseTracker.update(people, timestamp)` and `mapLifeSensingSnapshot(base, snapshot, cases, selectedPersonId)`.

- [ ] **Step 1: Write failing CASE and mapper tests**

```ts
test('creates cases on anomaly entry and escalation but not persistence', () => {
  const tracker = new LifeSensingCaseTracker()
  assert.equal(tracker.update([snapshot(1, 'motionless')], timestamp(0)).length, 1)
  assert.equal(tracker.update([snapshot(1, 'motionless')], timestamp(1)).length, 0)
  assert.equal(tracker.update([snapshot(1, 'fallen')], timestamp(2)).length, 1)
  tracker.update([snapshot(1, 'normal')], timestamp(3))
  assert.equal(tracker.update([snapshot(1, 'motionless')], timestamp(4)).length, 1)
})

test('maps only the selected person into metrics and raw waveform trends', async () => {
  const base = await mockDashboardDataProvider.getDashboard('lifeSensing')
  const view = mapLifeSensingSnapshot(base, twoPersonSnapshot(), [], 2)
  assert.equal(view.lifeSensing?.selectedPersonId, 2)
  assert.equal(view.metrics.find((item) => item.labelKey === 'metrics.heartRate')?.value, '82')
  assert.equal(view.trend.unit, '')
  assert.deepEqual(view.trend.series[0].values, twoPersonSnapshot().people[1].breathWaveform)
})
```

- [ ] **Step 2: Run CASE/mapper tests and verify failure**

Run: `node --test tests/life-sensing-case-tracker.test.ts tests/life-sensing-view-model.test.ts`

Expected: FAIL because tracker and mapper modules do not exist.

- [ ] **Step 3: Implement transition tracking and view model mapping**

```ts
export class LifeSensingCaseTracker {
  update(people: readonly PersonSnapshot[], timestamp: string): DashboardCase[]
  cases(): DashboardCase[]
  reset(): void
}

export interface LifeSensingSceneModel {
  status: 'connecting' | 'streaming' | 'stale' | 'error' | 'stopped'
  parseErrorCount: number
  selectedPersonId: number | null
  points: RadarPoint[]
  people: PersonSnapshot[]
}
```

Assign orange CASEs to `motionless`, `breathHold`, `vitalsAbnormal`, red CASEs to `fallen`, cap at 50, and retain per-person active severity until normal/not-detected recovery. Map selected-person values into the existing eight slots and use raw waveform arrays with dimensionless trend unit and second-relative labels.

- [ ] **Step 4: Run CASE/mapper tests**

Run: `node --test tests/life-sensing-case-tracker.test.ts tests/life-sensing-view-model.test.ts`

Expected: PASS for transition deduplication, two-person independence, 50-record cap, metrics, logs, CASE and trend mapping.

- [ ] **Step 5: Commit CASE and mapping**

```bash
git add src/lifeSensing/caseTracker.ts src/lifeSensing/lifeSensingViewModel.ts src/modules/types.ts tests/life-sensing-case-tracker.test.ts tests/life-sensing-view-model.test.ts
git commit -m "feat: map life sensing events to dashboard"
```

### Task 5: Streaming Dashboard Provider

**Files:**
- Create: `src/lifeSensing/lifeSensingDataProvider.ts`
- Create: `tests/life-sensing-provider.test.ts`

**Interfaces:**
- Consumes: `LifeSensingByteSource`, `MmWaveStreamDecoder`, `LifeSensingAnalyzer`, `LifeSensingCaseTracker` and `mapLifeSensingSnapshot`.
- Produces: provider lifecycle `start()`, `stop()`, `subscribe()`, `selectPerson()` and current stream status.

- [ ] **Step 1: Write failing provider lifecycle tests**

```ts
test('stops its byte source and ignores late bytes', async () => {
  const source = new TestByteSource()
  const provider = new LifeSensingDataProvider({ source, now: () => 1_000 })
  const updates: DashboardViewModel[] = []
  provider.subscribe((view) => updates.push(view))
  await provider.start()
  provider.stop()
  const countAfterStop = updates.length
  source.emit(encodeMmWaveFrame(createSimulatedFrame(0, 1)))
  assert.equal(source.stopCount, 1)
  assert.equal(provider.status, 'stopped')
  assert.equal(updates.length, countAfterStop)
})
```

- [ ] **Step 2: Run provider tests and verify failure**

Run: `node --test tests/life-sensing-provider.test.ts`

Expected: FAIL because `lifeSensingDataProvider.ts` does not exist.

- [ ] **Step 3: Implement composition and lifecycle**

```ts
export class LifeSensingDataProvider {
  readonly sourceKind: 'simulated' | 'serial'
  get status(): LifeSensingStreamStatus
  start(): Promise<DashboardViewModel>
  stop(): void
  subscribe(listener: (viewModel: DashboardViewModel) => void): () => void
  selectPerson(personId: number): void
}

export const lifeSensingDataProvider = new LifeSensingDataProvider()
```

Load the isolated life-sensing base dashboard once per start, pass every decoded frame through analyzer, CASE tracker and mapper, emit immutable dashboard updates, select the first detected person by default, mark a running stream stale after 1 second without valid frames, recover on the next valid frame, and invalidate sinks/timers during stop so late callbacks cannot update React.

- [ ] **Step 4: Run provider tests**

Run: `node --test tests/life-sensing-provider.test.ts`

Expected: PASS for composition, selection, parse errors, stale/recovery, start/stop/restart and late-byte suppression.

- [ ] **Step 5: Commit provider**

```bash
git add src/lifeSensing/lifeSensingDataProvider.ts tests/life-sensing-provider.test.ts
git commit -m "feat: stream life sensing dashboard data"
```

### Task 6: Interactive Radar UI And App Lifecycle

**Files:**
- Create: `src/components/dashboard/LifeSensingMedia.tsx`
- Modify: `src/components/dashboard/MediaPanel.tsx`
- Modify: `src/components/dashboard/DashboardShell.tsx`
- Modify: `src/App.tsx`
- Modify: `src/i18n/resources.ts`
- Modify: `src/styles/dashboard.css`
- Modify: `tests/i18n.test.ts`

**Interfaces:**
- Consumes: `DashboardViewModel.lifeSensing` and `LifeSensingControls.onSelectPerson(personId)`.
- Produces: themed SVG radar scene and live provider subscription while the life-sensing tab is active.

- [ ] **Step 1: Add failing localization assertions**

```ts
test('translates life-sensing stream, target, and state labels', () => {
  assert.equal(translate('zh', 'life.source.simulated'), '模拟串口')
  assert.equal(translate('en', 'life.source.simulated'), 'Simulated serial')
  assert.equal(translate('zh', 'life.state.fallen'), '人员跌倒')
  assert.equal(translate('en', 'life.target', { id: 2 }), 'Person 2')
})
```

- [ ] **Step 2: Run localization test and verify missing-key failure**

Run: `node --test tests/i18n.test.ts`

Expected: FAIL because the new life-sensing translation keys are absent.

- [ ] **Step 3: Implement SVG radar and integrate the provider**

```tsx
export interface LifeSensingControls {
  onSelectPerson(personId: number): void
}

export function LifeSensingMedia({ viewModel, controls }: Props) {
  const { t } = useI18n()
  const scene = viewModel.lifeSensing!
  return <>
    <div className="live-heading">
      <span>{t('panels.liveView')}</span><b>|</b>
      <span>{t('life.source.simulated')}</span><b>|</b>
      <span className="live-stamp">{viewModel.timestamp}</span>
      <span className="online">{t(`life.stream.${scene.status}` as TranslationKey)}</span>
    </div>
    <div className="scene life-radar-scene">
      <svg viewBox="-620 -640 1240 700" role="img" aria-label={t('life.radar')}>
        {[1, 2, 3, 4, 5, 6].map((range) => <circle key={range} r={range * 100} className="life-range-ring" />)}
        {scene.points.map((point, index) => <circle key={index} cx={point.x * 100} cy={-point.y * 100} r="2" className="life-radar-point" />)}
        {scene.people.map((person) => <g key={person.id} role="button" tabIndex={0}
          transform={`translate(${person.position.x * 100} ${-person.position.y * 100})`}
          className={`life-target ${person.state} ${scene.selectedPersonId === person.id ? 'selected' : ''}`}
          onClick={() => controls.onSelectPerson(person.id)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') controls.onSelectPerson(person.id) }}>
          <circle r="18" /><text y="-26">{t('life.target', { id: person.id })}</text>
        </g>)}
      </svg>
    </div>
  </>
}
```

Add localized keys for simulated source, stream states, person label and all six person states. In `App.tsx`, start and subscribe to `lifeSensingDataProvider` only for the life-sensing module, stop it in effect cleanup and module teardown, and route target clicks to `selectPerson`. In `MediaPanel`, select `LifeSensingMedia` before generic placeholder rendering. CSS must keep the radar full-bleed in `.scene`, expose focus/hover states, use existing `--module-accent`, `--success`, `--warning`, `--danger`, `--surface-*` tokens, and preserve the current fixed dashboard dimensions.

- [ ] **Step 4: Run focused tests and build**

Run: `node --test tests/life-sensing-*.test.ts tests/i18n.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript and Vite build exit 0.

- [ ] **Step 5: Commit UI integration**

```bash
git add src/components/dashboard/LifeSensingMedia.tsx src/components/dashboard/MediaPanel.tsx src/components/dashboard/DashboardShell.tsx src/App.tsx src/i18n/resources.ts src/styles/dashboard.css tests/i18n.test.ts
git commit -m "feat: render interactive life sensing radar"
```

### Task 7: Full Verification And Browser Review

**Files:**
- Modify only files required by failures found in this task.

**Interfaces:**
- Consumes: completed life-sensing feature.
- Produces: verified build and browser behavior at the design viewport.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all Node tests pass with 0 failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: `tsc --noEmit` and Vite production build exit 0.

- [ ] **Step 3: Run repository whitespace verification**

Run: `git diff --check`

Expected: no output and exit 0.

- [ ] **Step 4: Review in Chrome at 1600x900**

Start: `npm run dev -- --host 127.0.0.1 --port 5176`

Verify: life-sensing tab shows two targets and point cloud; selecting each target changes only that person's metrics and trends; the 36-second sequence produces motionless/breath-hold/fall events without duplicate CASE rows; recovery returns to normal; Chinese and English fit; theme switching remains legible; browser console has no errors.

- [ ] **Step 5: Commit any verification fixes**

```bash
git add src/lifeSensing src/components/dashboard/LifeSensingMedia.tsx src/components/dashboard/MediaPanel.tsx src/components/dashboard/DashboardShell.tsx src/App.tsx src/modules/types.ts src/i18n/resources.ts src/styles/dashboard.css tests/life-sensing-protocol.test.ts tests/life-sensing-analyzer.test.ts tests/life-sensing-simulator.test.ts tests/life-sensing-provider.test.ts tests/life-sensing-case-tracker.test.ts tests/life-sensing-view-model.test.ts tests/i18n.test.ts
git commit -m "fix: polish life sensing dashboard integration"
```

Skip this commit when Step 1 through Step 4 require no code changes.
