# Configurable Dashboard Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build five switchable, bilingual and themeable inspection dashboards on the existing life-sensing three-column layout, backed by typed mock data and reusable React components.

**Architecture:** `AppSettingsProvider` owns persistent language and theme state, while `I18nProvider` translates typed keys. A typed module registry selects presentation metadata and a `DashboardDataProvider` supplies each module's view model to one shared `DashboardShell`; controlled overlay variants handle only the media-area differences.

**Tech Stack:** React, TypeScript, Vite, Node test runner, lucide-react, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-08-13-configurable-dashboard-framework-design.md`

## Global Constraints

- Work directly in the current workspace; do not create a git worktree.
- Preserve the `1600x900` design canvas and `min(viewportWidth / 1600, viewportHeight / 900)` scaling behavior.
- Implement `lineClamp`, `lineProtrusion`, `magneticPlate`, `infraredTemperature`, and `lifeSensing` with the same three-column layout and panel order.
- Use TypeScript mock data only; do not define an HTTP, WebSocket, Tauri, or REST contract.
- Use the reference screenshots only for business semantics; do not ship them as runtime media.
- Support `zh` and `en`, plus `dark`, `light`, and `high-contrast`; persist settings at `prism-chariot.settings.v1`.
- Do not introduce Zustand, i18next, or conditional theme logic in React components.

## File Map

- `src/app/settings.ts`: setting types, validation, parsing, and serialization.
- `src/app/AppSettingsProvider.tsx`: persistent React settings state and `<html data-theme>` synchronization.
- `src/i18n/resources.ts`: structurally identical Chinese and English dictionaries and typed keys.
- `src/i18n/translate.ts`: dot-path lookup and parameter interpolation.
- `src/i18n/I18nProvider.tsx`: translation context bound to the selected language.
- `src/modules/types.ts`: presentation definitions and dashboard view-model contracts.
- `src/modules/registry.ts`: the five module definitions, navigation order, and safe fallback lookup.
- `src/data/mockDashboardData.ts`: complete mock view models for all five modules.
- `src/data/DashboardDataProvider.ts`: provider interface and mock implementation.
- `src/components/dashboard/*.tsx`: shared header, shell, panels, map, log, media overlay, metrics/trend, cases, and resolution form.
- `src/App.tsx`: provider assembly, scale hook, module selection, loading and retry state.
- `src/styles/tokens.css`: stable semantic token names and design dimensions.
- `src/styles/themes.css`: values for dark, light, and high-contrast themes.
- `src/styles/dashboard.css`: layout and component styling using semantic tokens only.
- `tests/*.test.ts`: pure contract tests for settings, translations, registry/provider, and existing scale behavior.

---

### Task 1: Settings and Translation Core

**Files:**
- Create: `src/app/settings.ts`
- Create: `src/i18n/resources.ts`
- Create: `src/i18n/translate.ts`
- Test: `tests/settings.test.ts`
- Test: `tests/i18n.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `Language = 'zh' | 'en'`, `ThemeId = 'dark' | 'light' | 'high-contrast'`, `AppSettings`, `DEFAULT_SETTINGS`, `SETTINGS_STORAGE_KEY`, `parseSettings(raw)`, `serializeSettings(settings)`.
- Produces: `TranslationKey`, `translate(language, key, params?)`, `translationResources`.

- [ ] **Step 1: Write failing settings tests**

Test literal defaults, valid payload preservation, malformed/old-version/illegal-value fallback, and stable serialized JSON.

- [ ] **Step 2: Run `node --test tests/settings.test.ts` and verify RED**

Expected: module-not-found failure for `src/app/settings.ts`.

- [ ] **Step 3: Implement the minimal validated setting parser and serializer**

Accept only `{version: 1, language: 'zh'|'en', theme: 'dark'|'light'|'high-contrast'}`; return a fresh default object for every invalid input.

- [ ] **Step 4: Run the settings test and verify GREEN**

Expected: all settings cases pass.

- [ ] **Step 5: Write failing translation tests**

Assert representative Chinese/English navigation, panel and action keys, `{count}` interpolation, complete key parity, and missing-key fallback.

- [ ] **Step 6: Run `node --test tests/i18n.test.ts` and verify RED**

Expected: module-not-found failure for `src/i18n/translate.ts`.

- [ ] **Step 7: Implement typed flat resources and translation lookup**

Export `zh` as the source shape, declare `en` with `satisfies Record<keyof typeof zh, string>`, interpolate known parameters, and return the key when no resource exists.

- [ ] **Step 8: Add `test` script and run all tests**

Set `"test": "node --test tests/*.test.ts"`; expected: settings, i18n, and scale tests all pass.

### Task 2: Module Registry and Mock Provider Contracts

**Files:**
- Create: `src/modules/types.ts`
- Create: `src/modules/registry.ts`
- Create: `src/data/mockDashboardData.ts`
- Create: `src/data/DashboardDataProvider.ts`
- Test: `tests/modules.test.ts`
- Test: `tests/dashboard-data-provider.test.ts`

**Interfaces:**
- Consumes: `TranslationKey` from Task 1.
- Produces: `ModuleId`, `ModuleDefinition`, `DashboardViewModel`, `MODULE_IDS`, `moduleDefinitions`, `getModuleDefinition(candidate)`.
- Produces: `DashboardDataProvider#getDashboard(moduleId): Promise<DashboardViewModel>` and `mockDashboardDataProvider`.

- [ ] **Step 1: Write failing registry tests**

Assert five ordered unique IDs, each controlled overlay kind, exactly eight metric slots, non-empty trend/case/resolution definitions, and `lifeSensing` fallback for unknown input.

- [ ] **Step 2: Run registry tests and verify RED**

Expected: module-not-found failure for `src/modules/registry.ts`.

- [ ] **Step 3: Implement registry types and five definitions**

Keep labels as translation keys, accents as `cyan|orange|violet`, and overlay kinds as `line-clamp|line-protrusion|magnetic-plate|infrared|vital-signs`.

- [ ] **Step 4: Run registry tests and verify GREEN**

Expected: all registry invariants pass.

- [ ] **Step 5: Write failing provider tests**

For every module assert matching ID, two floors, a valid selected point, logs, eight metrics, two trend series plus threshold where applicable, five cases, resolution defaults, and overlay payload matching the module definition.

- [ ] **Step 6: Run provider tests and verify RED**

Expected: module-not-found failure for `src/data/DashboardDataProvider.ts`.

- [ ] **Step 7: Implement complete mock view models and async provider**

Return isolated structured-clone data so UI edits cannot mutate the source fixture; keep device IDs, measurements, coordinates, units, and timestamps as data while all visible semantic labels remain translation keys.

- [ ] **Step 8: Run all tests and verify GREEN**

Expected: registry, provider, settings, i18n, and scale tests pass.

### Task 3: Settings Providers and Shared React Components

**Files:**
- Create: `src/app/AppSettingsProvider.tsx`
- Create: `src/i18n/I18nProvider.tsx`
- Create: `src/components/dashboard/Panel.tsx`
- Create: `src/components/dashboard/AppHeader.tsx`
- Create: `src/components/dashboard/MapPanel.tsx`
- Create: `src/components/dashboard/LogPanel.tsx`
- Create: `src/components/dashboard/DetectionOverlay.tsx`
- Create: `src/components/dashboard/MediaPanel.tsx`
- Create: `src/components/dashboard/MetricsPanel.tsx`
- Create: `src/components/dashboard/TrendPanel.tsx`
- Create: `src/components/dashboard/CaseTable.tsx`
- Create: `src/components/dashboard/ResolutionPanel.tsx`
- Create: `src/components/dashboard/DashboardShell.tsx`

**Interfaces:**
- Consumes: settings helpers, `translate`, `ModuleDefinition`, and `DashboardViewModel`.
- Produces: `useAppSettings()`, `useI18n()`, and `DashboardShell({definition, viewModel})`.

- [ ] **Step 1: Implement `AppSettingsProvider` from tested pure helpers**

Initialize once from localStorage, write the versioned payload after changes, set `document.documentElement.dataset.theme`, and expose language/theme setters that preserve the other value.

- [ ] **Step 2: Implement `I18nProvider` and typed `useI18n`**

Bind `t` to the current language and expose locale `zh-CN|en-US` for `Intl.DateTimeFormat`.

- [ ] **Step 3: Extract fixed-layout presentation components from the existing life-sensing JSX**

Move the three columns and stable panel sequence without changing `src/uiScale.ts`; components consume view-model data and never import a concrete module fixture.

- [ ] **Step 4: Implement five controlled media overlays**

Render the common placeholder grid/camera mark and a semantic alert card whose fields come from each overlay payload; choose markup only by `DetectionOverlayKind`.

- [ ] **Step 5: Implement shell session state and object-URL cleanup**

Use `key={moduleId}` at assembly to reset floor, selected case, resolution inputs, and photos. Revoke URLs on explicit removal and on unmount/module change.

- [ ] **Step 6: Run `npm run build`**

Expected: strict TypeScript and Vite production build succeed with no compile errors.

### Task 4: Application Assembly and Five-Module Interaction

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: providers, registry, mock provider, and shared components.
- Produces: a single mounted application with all five working module tabs, loading/error/retry states, language switch, and theme switch.

- [ ] **Step 1: Replace the monolithic app with provider assembly**

Keep the existing layout-scale hook, default to `lifeSensing`, fetch on module change with cancellation guarding, and pass data into a keyed `DashboardShell`.

- [ ] **Step 2: Add non-destructive loading and error states**

Keep the header and layout visible; show translated loading text or translated error plus retry action in the dashboard content area.

- [ ] **Step 3: Wire five tabs and settings controls**

Switching a tab fetches its own mock view model and resets only module-session state. Language/theme changes are immediate and do not change the selected module.

- [ ] **Step 4: Point `main.tsx` at the new style entry and build**

Expected: `npm run build` succeeds and no “under construction” branch remains.

### Task 5: Theme Tokens and Coordinated Visual Design

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/themes.css`
- Create: `src/styles/dashboard.css`
- Modify: `src/main.tsx`
- Delete: `src/styles.css`

**Interfaces:**
- Consumes: `<html data-theme>` and module `data-accent` attributes.
- Produces: component styling based exclusively on semantic CSS variables.

- [ ] **Step 1: Define stable layout and semantic tokens**

Include canvas sizes, spacing, radii, page/panel/title/input/media backgrounds, text levels, border levels, accent/status/chart colors, overlays, shadows, and module accent variables.

- [ ] **Step 2: Define dark, light, and high-contrast token values**

Dark retains the industrial deep-space look; light uses cool gray/white surfaces and aviation blue; high contrast uses black, white, cyan, yellow, and red with visibly stronger borders.

- [ ] **Step 3: Migrate all component CSS to semantic tokens**

Preserve the 1600×900 three-column geometry, improve header control grouping, visual hierarchy, table density, focus states, media overlay readability, and non-16:9 letterboxing.

- [ ] **Step 4: Scan for forbidden hard-coded theme branches and stale classes**

Run `rg "theme ===|建设中|placeholder button" src`; expected: no conditional theme code or construction placeholder text.

- [ ] **Step 5: Run tests and production build**

Expected: all tests and build pass.

### Task 6: Browser Verification and Delivery

**Files:**
- Modify only files needed to fix observed defects.

**Interfaces:**
- Consumes: complete application.
- Produces: verified desktop dashboard and one clean implementation commit.

- [ ] **Step 1: Start the Vite server and inspect at 1600×900**

Verify all five Chinese/dark modules show the same layout with distinct metrics, overlay, trend, cases, and resolution content.

- [ ] **Step 2: Inspect settings combinations**

Verify English, light, and high-contrast modes; refresh and confirm language/theme persistence while the app defaults module selection to life sensing.

- [ ] **Step 3: Inspect scaling and interactions**

Verify 1920×1080 and a non-16:9 viewport, floor switching, case selection, form fields, photo add/remove, module reset behavior, and visible keyboard focus.

- [ ] **Step 4: Inspect browser diagnostics**

Confirm no console errors, React key warnings, network failures for runtime assets, or obvious accessibility issues. Fix any observed issue and re-run the relevant verification.

- [ ] **Step 5: Run fresh completion checks**

Run `npm test`, `npm run build`, `git diff --check`, and `git status --short`; expected: clean checks and only intentional files pending.

- [ ] **Step 6: Review and commit**

Review `git diff --stat` and the full diff, then stage the implementation and commit with `feat: add configurable multi-module dashboards`.
