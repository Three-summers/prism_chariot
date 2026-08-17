# 可配置多模块驾驶舱框架设计

## 背景

当前项目已经实现生命感知驾驶舱，并以 `1600x900` 设计画布支持全屏等比缩放。页面包含品牌页眉、五模块导航、厂区地图、日志、实时媒体区、状态指标、趋势图、CASE 表格和结案处理，但业务数据、模拟状态、交互和全部 JSX 都集中在 `src/App.tsx`，主题颜色也主要硬编码在 `src/styles.css`。

本次改造以现有生命感知页面的布局和视觉节奏为唯一框架，将顶部五个模块全部实现为可切换的模拟驾驶舱：

- 线卡识别
- 线突出识别
- 磁极板识别
- 红外测温
- 生命感知

`docs/images/线夹识别.png`、`docs/images/红外检测.png` 和 `docs/images/生命感知.png` 只用于提取模块字段、告警语义和内容层级。五个模块不复制参考图布局，中心视频或图片也不使用参考图作为运行时素材，统一显示可替换的媒体占位内容。

## 目标

1. 将生命感知页面拆成可复用的三栏驾驶舱组件框架。
2. 五个模块共享相同的列宽、面板顺序、交互模型和视觉节奏，只通过 TypeScript 配置与有限插槽表达业务差异。
3. 所有模块数据通过 `DashboardDataProvider` 获取；首版只提供前端模拟实现，不预设 HTTP 地址、REST 路径或后端响应协议。
4. 支持中文和英文即时切换，刷新后保留语言选择。
5. 支持深色、浅色和高对比三套主题即时切换，刷新后保留主题选择。
6. 保留现有 `1600x900` 全屏等比缩放行为。
7. 五个模块均具备地图、日志、媒体占位、检测叠加、指标、趋势、CASE 选择和结案表单，不再显示“建设中”。

## 非目标

- 不实现真实 HTTP、WebSocket、Tauri 命令或其他后端传输。
- 不在首版定义后端 API 契约。
- 不实现任意 JSON Schema 驱动的通用低代码渲染器。
- 不允许单个模块改变三栏布局、面板顺序或设计画布尺寸。
- 不把参考截图复制到运行时资源中。
- 不迁移到 HMI 项目的 Zustand、i18next 或完整依赖栈。

## 总体架构

采用“配置驱动骨架 + 有限插槽组件”。共享组件负责稳定布局与交互，模块定义负责可显示的数据、字段和业务语义；只有媒体检测叠加等确实存在结构差异的区域使用受控变体，而不是为五个模块建立五套页面。

```text
App
 |
 +-- AppSettingsProvider
 |    +-- language: zh | en
 |    `-- theme: dark | light | high-contrast
 |
 +-- I18nProvider
 |    `-- t(key, params)
 |
 `-- DashboardApp
      +-- AppHeader
      |    `-- moduleId / language / theme controls
      |
      `-- DashboardShell
           +-- MapPanel
           +-- LogPanel
           +-- MediaPanel + DetectionOverlay variant
           +-- CaseTable
           +-- MetricsPanel + TrendPanel
           `-- ResolutionPanel
                    ^
                    |
         DashboardDataProvider
                    ^
                    |
       MockDashboardDataProvider
```

这张图回答应用状态、模块定义、数据 Provider 和共享布局如何组合。设置状态位于最外层；模块导航只改变当前模块 ID；共享驾驶舱根据注册表取得模块定义，并通过 Provider 获得该模块的模拟 ViewModel。组件不直接导入某个模块的模拟数据。

## 目录与职责

```text
src/
|-- app/
|   |-- App.tsx
|   `-- AppSettingsProvider.tsx
|-- components/dashboard/
|   |-- DashboardShell.tsx
|   |-- AppHeader.tsx
|   |-- Panel.tsx
|   |-- MapPanel.tsx
|   |-- LogPanel.tsx
|   |-- MediaPanel.tsx
|   |-- DetectionOverlay.tsx
|   |-- MetricsPanel.tsx
|   |-- TrendPanel.tsx
|   |-- CaseTable.tsx
|   `-- ResolutionPanel.tsx
|-- modules/
|   |-- types.ts
|   |-- registry.ts
|   |-- lifeSensing.ts
|   |-- lineClamp.ts
|   |-- lineProtrusion.ts
|   |-- magneticPlate.ts
|   `-- infraredTemperature.ts
|-- data/
|   |-- DashboardDataProvider.ts
|   `-- mockDashboardDataProvider.ts
|-- i18n/
|   |-- types.ts
|   |-- zh.ts
|   |-- en.ts
|   `-- I18nProvider.tsx
|-- styles/
|   |-- tokens.css
|   |-- themes.css
|   `-- dashboard.css
|-- main.tsx
`-- uiScale.ts
```

`App.tsx` 只负责装配 Provider、当前模块状态和驾驶舱入口。共享组件不得导入具体模块文件；它们只消费 `ModuleDefinition` 和 `DashboardViewModel`。模块文件不得包含页面级 JSX。

## 模块定义

每个 `ModuleDefinition` 描述稳定的显示契约：

```ts
type ModuleId =
  | 'lineClamp'
  | 'lineProtrusion'
  | 'magneticPlate'
  | 'infraredTemperature'
  | 'lifeSensing'

interface ModuleDefinition {
  id: ModuleId
  labelKey: TranslationKey
  icon: ModuleIconId
  accent: 'cyan' | 'orange' | 'violet'
  providerKey: ModuleId
  overlay: DetectionOverlayKind
  metricSlots: MetricSlotDefinition[]
  trendSeries: TrendSeriesDefinition[]
  caseColumns: CaseColumnDefinition[]
  resolutionFields: ResolutionFieldDefinition[]
}
```

模块定义保存翻译键和字段标识，不保存已经翻译的中文或英文字符串。运行数据、日志、CASE、趋势点和当前检测结果由 Provider 返回，避免静态定义与未来后端数据耦合。

受控检测叠加类型首版包括：

- `line-clamp`：识别框、变形置信度和点位。
- `line-protrusion`：突出区域、突出量和置信度。
- `magnetic-plate`：板件区域、偏移/缺陷值和置信度。
- `infrared`：热点框、当前温度和阈值。
- `vital-signs`：人员状态、呼吸、心率和雷达状态。

模块强调色只能通过 `data-accent` 或模块级 CSS 变量覆盖语义 token，不允许在组件 JSX 中根据模块 ID 硬编码颜色。

## 共享驾驶舱布局

`DashboardShell` 固定继承生命感知三栏布局：

```text
+------------------+------------------------------------+----------------------+
| 地图 / 楼层       | 实时媒体与检测叠加                  | 状态指标与趋势        |
|                  |                                    |                      |
|------------------|------------------------------------|----------------------|
| 日志              | CASE 表格                          | 点位信息 / 结案处理   |
+------------------+------------------------------------+----------------------+
```

- 页眉固定包含品牌、五模块导航、当前日期/系统状态、语言和主题入口。
- 左栏固定包含地图和日志。
- 中栏固定包含实时媒体占位与 CASE 表。
- 右栏固定包含指标/趋势和结案处理；点位信息作为结案面板的上下文摘要。
- 五个模块共享列宽、面板标题高度、间距、表格密度和结案操作位置。
- 切换模块时保留语言与主题，模块内部楼层、CASE 和表单状态重置为该模块默认状态。

## 五模块内容模型

### 线卡识别

- 检测叠加：线卡识别框、变形类型、置信度。
- 指标：设备状态、速度、楼层、点位、线卡数量、异常数、置信度、告警等级。
- 趋势：线卡变形置信度与阈值。
- CASE：线卡变形、松动、缺失等模拟事件。

### 线突出识别

- 检测叠加：突出区域、突出距离、置信度。
- 指标：巡检状态、速度、楼层、点位、突出量、阈值、置信度、事件等级。
- 趋势：突出量与告警阈值。
- CASE：线缆突出、护套隆起、边缘异常等模拟事件。

### 磁极板识别

- 检测叠加：磁极板边界、偏移/缺陷标记、置信度。
- 指标：设备状态、速度、楼层、点位、板件温度、偏移量、完整度、告警等级。
- 趋势：偏移量或板件温度与阈值。
- CASE：偏移、松动、表面缺陷、温度异常等模拟事件。

### 红外测温

- 检测叠加：热点框、当前温度、告警阈值。
- 指标：巡检状态、设备编号、楼层/点位、方向、当前温度、阈值、温升、事件等级。
- 趋势：温度曲线与阈值线。
- CASE：温度异常、温升过快、局部热点等模拟事件。

### 生命感知

- 保留当前人员倒地、呼吸、心率和雷达检测语义。
- 保留现有指标、生命体征趋势、CASE 和结案内容。
- 迁移后作为共享框架的视觉基准和回归基准。

## 数据 Provider

定义面向页面的稳定接口，不暴露未来传输协议：

```ts
interface DashboardDataProvider {
  getDashboard(moduleId: ModuleId): Promise<DashboardViewModel>
}
```

`DashboardViewModel` 包含：

- 当前设备与媒体状态。
- 地图楼层、区域、轨迹与当前点位。
- 日志列表。
- 指标与趋势数据。
- CASE 列表及默认选中项。
- 点位摘要和结案表单默认值。

`MockDashboardDataProvider` 是首版唯一实现。它可以返回已解析的 Promise，以保持组件的数据加载流程与未来异步 Provider 一致。组件只依赖接口，后续接入后端时新增实现并在应用装配层替换实例。

Provider 失败时，驾驶舱骨架和页眉继续显示；依赖数据的面板显示双语错误占位和重试按钮，不回退到空白页。未知模块 ID 回退到生命感知定义。

## 国际化

首版不引入 i18next。使用轻量 `I18nProvider`：

```ts
type Language = 'zh' | 'en'
type TranslationKey = keyof typeof zh

interface I18nContextValue {
  language: Language
  setLanguage(language: Language): void
  t(key: TranslationKey, params?: Record<string, string | number>): string
}
```

实际资源可按嵌套对象组织，再通过类型工具生成点路径键；关键要求是 `en.ts` 必须满足与 `zh.ts` 相同的资源形状。所有用户可见文案进入资源文件，包括：

- 品牌副标题与系统状态。
- 五个模块名称。
- 面板标题、表格列、表单字段、按钮和空/错状态。
- 指标名称、日志消息、CASE 类型和结论选项。
- 日期星期和时间相关短语。

设备编号、点位编号、坐标、数值和单位属于数据，不翻译。日期使用当前语言对应的 `Intl.DateTimeFormat`。缺少翻译键时开发环境输出警告，并回退到键名，不能造成页面崩溃。

## 设置持久化

`AppSettingsProvider` 管理：

```ts
type ThemeId = 'dark' | 'light' | 'high-contrast'

interface AppSettings {
  version: 1
  language: Language
  theme: ThemeId
}
```

设置保存到版本化的 `localStorage` 键 `prism-chariot.settings.v1`。默认值为中文和深色主题。读取不存在、JSON 损坏、版本不匹配或值非法时使用默认值，并允许后续正常覆盖。语言与主题切换立即生效。

## 主题系统

参考 HMI 的单向数据流：

```text
AppSettings.theme
        |
        v
<html data-theme="dark|light|high-contrast">
        |
        v
themes.css 覆盖语义 token
        |
        v
共享组件与模块强调色
```

`tokens.css` 定义不随主题改变的语义变量名称；`themes.css` 为三套主题提供值。至少覆盖：

- 页面、面板、标题栏、输入框和媒体区背景。
- 主/次/弱文字。
- 普通、强调和细分隔边框。
- 主强调色与模块 accent。
- 成功、处理中、警告和告警色。
- 图表网格、两条序列和阈值线。
- 阴影、内发光和遮罩强度。

深色主题保持当前工业深空风格；浅色主题使用浅灰/白面板、深色文字和航空蓝强调；高对比主题使用纯黑背景、白色正文、青色活动状态和高亮告警色。组件样式只引用 token，不出现 `if (theme === ...)`。

## 状态与交互

- 当前模块保存在应用内 React 状态，默认生命感知，不要求持久化。
- 切换模块会重新获取对应 ViewModel，并重置模块内部的楼层、CASE、表单和照片状态。
- 语言和主题由设置 Provider 管理并持久化。
- 楼层、CASE 选择、结案表单和照片预览属于 `DashboardShell` 当前模块会话状态。
- 上传照片继续使用浏览器 Object URL；模块切换和组件卸载时统一释放，避免内存泄漏。

## 迁移顺序

1. 建立类型、翻译资源、设置持久化和主题 token，并以测试锁定契约。
2. 建立模块注册表和 Mock Provider，迁移生命感知数据作为视觉回归基准。
3. 拆分页眉、Panel、地图、日志、媒体、指标、趋势、CASE 和结案组件。
4. 将 `App.tsx` 缩减为应用装配入口。
5. 依次加入线卡、线突出、磁极板和红外模块配置及模拟数据。
6. 用 Chrome 检查五个模块、两种语言和三套主题的关键组合。

迁移过程中保持 `src/uiScale.ts` 和固定设计画布算法不变。

## 测试策略

### 自动化测试

- 翻译资源：中英文键集合完整一致，插值可用，未知键安全回退。
- 设置持久化：默认值、合法值恢复、非法 JSON、非法枚举和版本不匹配。
- 文档同步：主题写入 `data-theme`，语言写入 `lang`。
- 模块注册表：五个模块均存在、顺序稳定、ID 唯一，未知 ID 回退生命感知。
- 模块定义：指标槽位、趋势、CASE 列和结案字段符合共享组件契约。
- Mock Provider：五个模块均返回完整 ViewModel，模块数据互不串用。
- 共享交互：模块切换、楼层切换、CASE 选择、主题切换和语言切换。
- 保留现有缩放纯函数测试。

### 浏览器验证

Chrome DevTools 至少检查：

- 五个模块在中文深色主题下均完整显示，没有“建设中”。
- 英文下页眉、面板标题、指标、表格和表单无关键截断。
- 浅色主题具备足够文字/边框对比，图表和告警语义可见。
- 高对比主题没有残留的硬编码深色面板或低对比文字。
- `1600x900`、`1920x1080` 和非 16:9 视口继续等比例缩放。
- 控制台无 error、warning 或 accessibility issue。

## 验收标准

1. 顶部五个模块均切换到同一生命感知三栏布局，并显示模块对应模拟内容。
2. 页面级 JSX 不再集中在单个大型 `App.tsx`。
3. 所有共享组件通过模块定义和 Provider 工作，不直接导入具体模块模拟数据。
4. 所有可见界面文案可在中文和英文间即时切换，刷新保持选择。
5. 深色、浅色和高对比主题可即时切换，刷新保持选择。
6. 模拟 Provider 是驾驶舱运行数据的唯一入口，且未来后端实现无需修改共享组件接口。
7. 中心媒体全部使用统一占位处理，不依赖参考截图。
8. 全屏等比缩放、楼层切换、CASE 选择、结案表单和照片上传继续工作。
9. 自动化测试、生产构建、diff 检查与 Chrome 验证全部通过。
