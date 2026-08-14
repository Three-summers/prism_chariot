import type { TranslationKey } from '../i18n/resources.ts'

export type ModuleId =
  | 'lineClamp'
  | 'lineProtrusion'
  | 'magneticPlate'
  | 'infraredTemperature'
  | 'lifeSensing'

export type ModuleIconId = 'scan' | 'crosshair' | 'plate' | 'thermometer' | 'heart'
export type ModuleAccent = 'cyan' | 'orange' | 'violet'
export type DetectionOverlayKind =
  | 'line-clamp'
  | 'line-protrusion'
  | 'magnetic-plate'
  | 'infrared'
  | 'vital-signs'

export interface MetricSlotDefinition { id: string; labelKey: TranslationKey }
export interface TrendSeriesDefinition { id: string; labelKey: TranslationKey; tone: 'primary' | 'secondary' | 'threshold' }
export interface CaseColumnDefinition { id: string; labelKey: TranslationKey }
export interface ResolutionFieldDefinition { id: string; labelKey: TranslationKey }

export interface ModuleDefinition {
  id: ModuleId
  labelKey: TranslationKey
  icon: ModuleIconId
  accent: ModuleAccent
  providerKey: ModuleId
  overlay: DetectionOverlayKind
  metricSlots: MetricSlotDefinition[]
  trendSeries: TrendSeriesDefinition[]
  caseColumns: CaseColumnDefinition[]
  resolutionFields: ResolutionFieldDefinition[]
}

export interface MapZone { id: string; x: number; y: number; width: number; height: number; current?: boolean }
export interface MapFloor { id: string; zones: MapZone[] }
export interface LogEntry { time: string; messageKey: TranslationKey; tone: 'info' | 'danger' | 'warning' }
export interface MetricValue {
  id: string
  labelKey: TranslationKey
  value: string
  unit?: string
  tone?: 'normal' | 'warning' | 'danger' | 'success'
  detected?: boolean
}
export interface TrendSeries {
  id: string
  labelKey: TranslationKey
  tone: 'primary' | 'secondary' | 'threshold'
  values: number[]
}
export interface DashboardCase {
  id: string
  levelKey: TranslationKey
  color: 'red' | 'orange' | 'yellow' | 'green'
  time: string
  spot: string
  typeKey: TranslationKey
  stateKey: TranslationKey
  stateTone: 'processing' | 'confirmed' | 'closed'
  owner: string
  updated: string
}
export interface OverlayStat { labelKey: TranslationKey; value: string; unit?: string }
export interface DetectionBox {
  /** Coordinates normalized to the source image dimensions (0..1). */
  x: number
  y: number
  width: number
  height: number
}
export interface DetectionWire {
  wire: 0 | 1
  spots: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }]
  deviationDeg: number
  state: 'ok' | 'warning' | 'alarm'
}
export interface DetectionStripe extends DetectionBox {
  state: 'normal' | 'warped'
}
export interface DetectionGap extends DetectionBox {}
export interface DetectionOverlayModel {
  kind: DetectionOverlayKind
  titleKey: TranslationKey
  detailKey: TranslationKey
  stats: OverlayStat[]
  detectionBox?: DetectionBox
  wires?: DetectionWire[]
  stripes?: DetectionStripe[]
  gap?: DetectionGap
}
export interface ResolutionDefaults {
  conclusions: TranslationKey[]
  defaultConclusion: TranslationKey
  notes: string
  operator: string
  resolvedAt: string
}

export interface DashboardViewModel {
  moduleId: ModuleId
  timestamp: string
  media: {
    deviceId: string
    area: string
    areaKey?: TranslationKey
    speed: string
    directionKey: TranslationKey
    modeKey: TranslationKey
    /** The existing placeholder remains the default for mock modules. */
    kind?: 'placeholder' | 'image' | 'video'
    src?: string
    sourceWidth?: number
    sourceHeight?: number
    detectionBox?: DetectionBox
  }
  map: { floors: MapFloor[]; defaultFloor: string; currentPoint: string }
  logs: LogEntry[]
  metrics: MetricValue[]
  trend: { titleKey: TranslationKey; unit: string; labels: string[]; series: TrendSeries[] }
  cases: DashboardCase[]
  defaultCaseId: string
  overlay: DetectionOverlayModel
  resolution: ResolutionDefaults
  systemStatusKeys: TranslationKey[]
}
