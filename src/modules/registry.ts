import type {
  CaseColumnDefinition,
  DetectionOverlayKind,
  MetricSlotDefinition,
  ModuleDefinition,
  ModuleId,
  ResolutionFieldDefinition,
  TrendSeriesDefinition,
} from './types.ts'
import type { TranslationKey } from '../i18n/resources.ts'

export const MODULE_IDS: readonly ModuleId[] = [
  'lineClamp',
  'lineProtrusion',
  'magneticPlate',
  'infraredTemperature',
  'lifeSensing',
]

const caseColumns: CaseColumnDefinition[] = [
  ['number', 'table.number'], ['level', 'table.level'], ['time', 'table.time'], ['point', 'table.point'],
  ['eventType', 'table.eventType'], ['state', 'table.state'], ['owner', 'table.owner'], ['updated', 'table.updated'],
].map(([id, labelKey]) => ({ id, labelKey: labelKey as TranslationKey }))

const resolutionFields: ResolutionFieldDefinition[] = [
  ['conclusion', 'resolution.conclusion'], ['notes', 'resolution.notes'],
  ['operator', 'resolution.operator'], ['resolvedAt', 'resolution.time'],
].map(([id, labelKey]) => ({ id, labelKey: labelKey as TranslationKey }))

const definitions: Array<{
  id: ModuleId
  labelKey: TranslationKey
  icon: ModuleDefinition['icon']
  accent: ModuleDefinition['accent']
  overlay: DetectionOverlayKind
  metricKeys: TranslationKey[]
  trendKeys: TranslationKey[]
}> = [
  { id: 'lineClamp', labelKey: 'modules.lineClamp', icon: 'scan', accent: 'cyan', overlay: 'line-clamp', metricKeys: ['metrics.deviceStatus', 'metrics.speed', 'metrics.floor', 'metrics.point', 'metrics.clampCount', 'metrics.anomalyCount', 'metrics.confidence', 'metrics.alertLevel'], trendKeys: ['trend.deformationConfidence', 'trend.threshold'] },
  { id: 'lineProtrusion', labelKey: 'modules.lineProtrusion', icon: 'crosshair', accent: 'cyan', overlay: 'line-protrusion', metricKeys: ['metrics.inspectionStatus', 'metrics.speed', 'metrics.floor', 'metrics.point', 'metrics.protrusion', 'metrics.threshold', 'metrics.confidence', 'metrics.eventLevel'], trendKeys: ['trend.protrusion', 'trend.threshold'] },
  { id: 'magneticPlate', labelKey: 'modules.magneticPlate', icon: 'plate', accent: 'cyan', overlay: 'magnetic-plate', metricKeys: ['metrics.deviceStatus', 'metrics.speed', 'metrics.floor', 'metrics.point', 'metrics.plateTemperature', 'metrics.offset', 'metrics.integrity', 'metrics.alertLevel'], trendKeys: ['trend.plateOffset', 'trend.threshold'] },
  { id: 'infraredTemperature', labelKey: 'modules.infraredTemperature', icon: 'thermometer', accent: 'orange', overlay: 'infrared', metricKeys: ['metrics.inspectionStatus', 'metrics.deviceId', 'metrics.floor', 'metrics.point', 'metrics.currentTemperature', 'metrics.threshold', 'metrics.temperatureRise', 'metrics.eventLevel'], trendKeys: ['trend.temperature', 'trend.threshold'] },
  { id: 'lifeSensing', labelKey: 'modules.lifeSensing', icon: 'heart', accent: 'violet', overlay: 'vital-signs', metricKeys: ['metrics.frontDistance', 'metrics.speed', 'metrics.floor', 'metrics.point', 'metrics.breathing', 'metrics.heartRate', 'metrics.lifeStatus', 'metrics.eventLevel'], trendKeys: ['trend.breathing', 'trend.heartRate'] },
]

export const moduleDefinitions: Record<ModuleId, ModuleDefinition> = Object.fromEntries(definitions.map((item) => {
  const metricSlots: MetricSlotDefinition[] = item.metricKeys.map((labelKey, index) => ({ id: `metric-${index + 1}`, labelKey }))
  const trendSeries: TrendSeriesDefinition[] = item.trendKeys.map((labelKey, index) => ({ id: `series-${index + 1}`, labelKey, tone: index === 0 ? 'primary' : labelKey === 'trend.threshold' ? 'threshold' : 'secondary' }))
  return [item.id, { ...item, providerKey: item.id, metricSlots, trendSeries, caseColumns, resolutionFields }]
})) as unknown as Record<ModuleId, ModuleDefinition>

export function getModuleDefinition(candidate: unknown): ModuleDefinition {
  return typeof candidate === 'string' && MODULE_IDS.includes(candidate as ModuleId)
    ? moduleDefinitions[candidate as ModuleId]
    : moduleDefinitions.lifeSensing
}
