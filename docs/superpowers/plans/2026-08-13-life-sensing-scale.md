# Life Sensing Scale and Visual Coordination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the life-sensing dashboard fill fullscreen viewports with a centered, complete, proportional scale while tightening the page’s visual hierarchy and preventing the resolution panel from clipping.

**Architecture:** Keep the existing 1600x900 pixel design canvas. Add a pure `computeUiScale` helper and a small React hook that writes `--ui-scale` from the smaller viewport ratio; render the existing shell inside the already-defined `.stage` wrapper. Apply focused CSS changes to panel rhythm, scene balance, map contrast, and resolution-panel overflow without changing business state or interactions.

**Tech Stack:** React 19, TypeScript, Vite, CSS, Node built-in test runner, Chrome DevTools MCP.

**Spec:** `docs/superpowers/specs/2026-08-13-life-sensing-scale-design.md`

## Global Constraints

- Use `1600x900` as the only design baseline.
- Scale with `min(viewportWidth / 1600, viewportHeight / 900)`.
- Do not migrate the existing pixel-based stylesheet to `rem`.
- Preserve current labels, navigation, local state, SVG coordinate systems, and dark industrial visual language.
- Work directly in the current checkout; do not create a worktree.

---

### Task 1: Add and verify the pure viewport scale calculation

**Files:**
- Create: `src/uiScale.ts`
- Create: `tests/ui-scale.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `computeUiScale(viewportWidth: number, viewportHeight: number, designWidth?: number, designHeight?: number): number`.
- The helper returns a finite non-negative ratio and uses `1600` and `900` when design dimensions are omitted.

- [ ] **Step 1: Write the failing tests**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { computeUiScale } from '../src/uiScale.ts'

test('keeps the design size at one-to-one scale', () => {
  assert.equal(computeUiScale(1600, 900), 1)
})

test('scales a 1920x1080 viewport by 1.2', () => {
  assert.equal(computeUiScale(1920, 1080), 1.2)
})

test('uses the smaller ratio for a non-16:9 viewport', () => {
  assert.equal(computeUiScale(1920, 1200), 1.2)
})

test('shrinks to the smaller viewport dimension', () => {
  assert.equal(computeUiScale(1280, 720), 0.8)
})

test('does not emit NaN or Infinity for invalid dimensions', () => {
  assert.equal(computeUiScale(0, 0), 0)
  assert.equal(computeUiScale(Number.NaN, 900), 0)
  assert.equal(computeUiScale(1600, Number.POSITIVE_INFINITY), 0)
})
```

- [ ] **Step 2: Run the focused test and confirm the expected RED failure**

Run: `node --test tests/ui-scale.test.ts`

Expected: FAIL because `src/uiScale.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal pure helper**

```ts
export const DESIGN_WIDTH = 1600
export const DESIGN_HEIGHT = 900

export function computeUiScale(
  viewportWidth: number,
  viewportHeight: number,
  designWidth = DESIGN_WIDTH,
  designHeight = DESIGN_HEIGHT,
): number {
  if (![viewportWidth, viewportHeight, designWidth, designHeight].every(Number.isFinite)) return 0
  if (viewportWidth <= 0 || viewportHeight <= 0 || designWidth <= 0 || designHeight <= 0) return 0
  return Math.min(viewportWidth / designWidth, viewportHeight / designHeight)
}
```

- [ ] **Step 4: Add the focused test command and verify GREEN**

Add the package script: `"test:scale": "node --test tests/ui-scale.test.ts"`.

Run: `npm run test:scale`

Expected: 5 passing tests and exit code 0.

- [ ] **Step 5: Commit the isolated helper and tests**

```bash
git add src/uiScale.ts tests/ui-scale.test.ts package.json
git commit -m "test: cover life sensing viewport scale"
```

### Task 2: Connect the scale helper to the rendered stage

**Files:**
- Modify: `src/App.tsx:1-75,187`
- Modify: `src/styles.css:20-45`

**Interfaces:**
- `useUiScale` imports `computeUiScale`, writes the root CSS custom property `--ui-scale`, and restores the previous inline value on cleanup.
- `App` renders `<div className="stage"><div className="app-shell">…</div></div>`.

- [ ] **Step 1: Replace the root-font-size implementation with the CSS-variable hook**

Use `useLayoutEffect` to run `applyScale` immediately, register `resize` and `fullscreenchange`, and clean up both listeners. The update must set `root.style.setProperty('--ui-scale', String(computeUiScale(window.innerWidth, window.innerHeight)))`; it must not set `root.style.fontSize`.

- [ ] **Step 2: Wrap the app shell in the existing stage element**

Change the top-level JSX from `<div className="app-shell">` to `<div className="stage"><div className="app-shell">` and close both wrappers at the end of the component return. Keep all existing children and state logic unchanged.

- [ ] **Step 3: Make the stage and shell center the transformed canvas**

Keep `.stage` full viewport with `display: grid`, `place-items: center`, and hidden overflow. Keep `.app-shell` at `var(--design-w)` x `var(--design-h)` and `transform-origin: center`; ensure `--ui-scale` remains the only transform input.

- [ ] **Step 4: Run the focused test and production build**

Run: `npm run test:scale && npm run build`

Expected: all scale tests pass and Vite/TypeScript build exits 0.

- [ ] **Step 5: Commit the scale wiring**

```bash
git add src/App.tsx src/styles.css
git commit -m "feat: scale life sensing canvas to viewport"
```

### Task 3: Coordinate the dashboard visual hierarchy and eliminate clipping

**Files:**
- Modify: `src/styles.css:67-180,190-280,345-482`

**Interfaces:**
- No new runtime interface; all changes remain CSS-only and preserve existing selectors used by `App.tsx`.

- [ ] **Step 1: Add a visual regression checklist before styling changes**

Record the current Chrome checks at `1600x900` and `1920x1080`: right panel content clipping, shell bounds, map contrast, and scene alert position. Use the same measurements after the changes.

- [ ] **Step 2: Fix panel rhythm and scene balance with focused CSS edits**

Apply these concrete adjustments:

```css
.panel { border-color: #1b3b50; border-radius: 6px; }
.panel-title { height: 38px; padding: 0 13px; letter-spacing: .2px; }
.left-column, .center-column, .right-column { gap: 14px; }
.dashboard { gap: 14px; }
.scene { background: radial-gradient(circle at 50% 42%, #102c3c 0, #071923 52%, #05131d 100%); }
.scene-placeholder { padding-bottom: 56px; }
.scene-alert { bottom: 14px; left: 14px; right: 14px; }
.map-grid { background: #081720; }
.route-map rect[fill="url(#map-grid)"] { opacity: .55; }
```

Adjust only existing selectors, keeping the current colors for `danger`, `warning`, and active module states.

- [ ] **Step 3: Make the resolution panel fit its content**

Use the existing flex column and action footer, but reduce unnecessary vertical margins and make the content area scroll-safe:

```css
.resolution-panel { padding-bottom: 8px; }
.resolution-panel label { margin-top: 7px; }
.resolution-panel textarea { height: 44px; }
.scene-photos { margin-top: 6px; }
.photo-upload { min-height: 64px; }
.drawer-actions { padding-top: 8px; }
```

Ensure `.drawer-actions` remains visible at `1600x900` and the panel’s internal scroll height does not exceed its client height when no photos are uploaded.

- [ ] **Step 4: Run build and inspect the exact CSS diff**

Run: `npm run build && git diff --check`

Expected: build passes, no whitespace errors, and only the intended selectors changed.

- [ ] **Step 5: Commit visual coordination changes**

```bash
git add src/styles.css
git commit -m "style: balance life sensing dashboard panels"
```

### Task 4: Verify browser behavior across fullscreen-sized viewports

**Files:**
- Modify: none unless verification reveals a concrete regression.

**Interfaces:**
- Browser-visible contract: `.stage` fills the viewport; `.app-shell` stays centered and scales proportionally; dashboard content remains complete.

- [ ] **Step 1: Start or reuse the Vite dev server**

Run: `npm run dev -- --host 127.0.0.1`.

- [ ] **Step 2: Check 1600x900 in Chrome DevTools MCP**

Evaluate `.app-shell.getBoundingClientRect()`, `getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')`, and the resolution panel’s `scrollHeight/clientHeight`. Capture a screenshot.

Expected: scale is `1`, shell is centered at approximately `(0,0)` for the design viewport, and the resolution action buttons are fully visible.

- [ ] **Step 3: Check 1920x1080 and 1920x1200**

Resize Chrome and verify scale values of approximately `1.2` for both viewports. Confirm shell bounds are centered and preserve a 16:9 ratio; the 1920x1200 case has vertical letterboxing instead of stretching.

- [ ] **Step 4: Check console and interactions**

List console messages and exercise module navigation, floor switching, CASE selection, and the photo upload label. Expected: no console errors and existing interactions still work.

- [ ] **Step 5: Run final verification commands**

Run: `npm run test:scale && npm run build && git diff --check`

Expected: 5 scale tests pass, build exits 0, and diff check is clean.
