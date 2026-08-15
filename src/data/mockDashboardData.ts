import type {
  DashboardCase,
  DashboardViewModel,
  DetectionOverlayModel,
  MetricValue,
  ModuleId,
  TrendSeries,
} from '../modules/types.ts'
import type { TranslationKey } from '../i18n/resources.ts'

const timestamp = '2026-08-12 10:25:52'
const trendLabels = ['25:47', '25:48', '25:49', '25:50', '25:51', '25:52']

const floors = [
  {
    id: '1F',
    zones: [
      { id: 'CMP', x: 20, y: 26, width: 106, height: 120 },
      { id: 'DIF', x: 134, y: 26, width: 106, height: 120, current: true },
      { id: 'LIT', x: 20, y: 154, width: 106, height: 120 },
      { id: 'ETC', x: 134, y: 154, width: 106, height: 120 },
    ],
  },
  {
    id: '3F',
    zones: [
      { id: 'CMP', x: 20, y: 26, width: 106, height: 120 },
      { id: 'DIF', x: 134, y: 26, width: 106, height: 120 },
      { id: 'LIT', x: 20, y: 154, width: 106, height: 120 },
      { id: 'ETC', x: 134, y: 154, width: 106, height: 120, current: true },
    ],
  },
]

const logs: DashboardViewModel['logs'] = [
  ['10:24:18', 'log.enteredArea', 'info'],
  ['10:25:02', 'log.scanStarted', 'info'],
  ['10:25:48', 'log.targetDetected', 'warning'],
  ['10:25:53', 'log.eventCreated', 'danger'],
  ['10:25:55', 'log.centerNotified', 'info'],
  ['10:26:01', 'log.centerReceived', 'info'],
  ['10:27:05', 'log.supportDispatched', 'info'],
  ['10:30:18', 'log.resolving', 'info'],
  ['10:32:44', 'log.waitingResolution', 'info'],
].map(([time, messageKey, tone]) => ({
  time,
  messageKey: messageKey as TranslationKey,
  tone: tone as 'info' | 'danger' | 'warning',
}))

const levels: Array<{ key: TranslationKey; color: DashboardCase['color'] }> = [
  { key: 'common.red', color: 'red' },
  { key: 'common.orange', color: 'orange' },
  { key: 'common.yellow', color: 'yellow' },
  { key: 'common.yellow', color: 'yellow' },
  { key: 'common.orange', color: 'orange' },
]

const caseTimes = ['10:25:52', '09:58:23', '09:32:47', '08:46:05', '08:12:30']
const spots = ['LIT-086', 'CMP-042', 'LIT-118', 'DIF-063', 'ETC-009']
const owners = ['YZU', 'YZU', 'YZU', 'YZU', 'YZU']

function makeCases(moduleCode: string, currentPoint: string, eventKeys: TranslationKey[]): DashboardCase[] {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `${moduleCode}-${String(index + 1).padStart(3, '0')}`,
    levelKey: levels[index].key,
    color: levels[index].color,
    time: `2026-08-12 ${caseTimes[index]}`,
    spot: index === 0 ? currentPoint : spots[index],
    typeKey: eventKeys[index % eventKeys.length],
    stateKey: index === 0 ? 'common.processing' : index === 1 ? 'common.confirmed' : 'common.closed',
    stateTone: index === 0 ? 'processing' : index === 1 ? 'confirmed' : 'closed',
    owner: owners[index],
    updated: caseTimes[index],
  }))
}

function metrics(values: Array<[TranslationKey, string, string?, MetricValue['tone']?, boolean?]>): MetricValue[] {
  return values.map(([labelKey, value, unit, tone = 'normal', detected], index) => ({
    id: `metric-${index + 1}`, labelKey, value, unit, tone, detected,
  }))
}

function series(values: Array<[TranslationKey, TrendSeries['tone'], number[]]>): TrendSeries[] {
  return values.map(([labelKey, tone, points], index) => ({ id: `series-${index + 1}`, labelKey, tone, values: points }))
}

function overlay(
  kind: DetectionOverlayModel['kind'],
  titleKey: TranslationKey,
  detailKey: TranslationKey,
  stats: Array<[TranslationKey, string, string?]>,
): DetectionOverlayModel {
  return { kind, titleKey, detailKey, stats: stats.map(([labelKey, value, unit]) => ({ labelKey, value, unit })) }
}

function dashboard(
  moduleId: ModuleId,
  currentPoint: string,
  values: MetricValue[],
  trendTitleKey: TranslationKey,
  unit: string,
  trendSeries: TrendSeries[],
  eventKeys: TranslationKey[],
  detection: DetectionOverlayModel,
  areaKey: TranslationKey,
): DashboardViewModel {
  const casePrefixes: Record<ModuleId, string> = {
    lineClamp: 'LCL',
    lineProtrusion: 'LPR',
    magneticPlate: 'MAG',
    infraredTemperature: 'INF',
    lifeSensing: 'LIF',
  }
  const cases = makeCases(casePrefixes[moduleId], currentPoint, eventKeys)
  return {
    moduleId,
    timestamp,
    media: { deviceId: 'AN0111', area: areaKey, areaKey, speed: '0.38', directionKey: 'status.forward', modeKey: 'status.autoInspection' },
    map: { floors, defaultFloor: '1F', currentPoint },
    logs,
    metrics: values,
    trend: { titleKey: trendTitleKey, unit, labels: trendLabels, series: trendSeries },
    cases,
    defaultCaseId: cases[0].id,
    overlay: detection,
    resolution: {
      conclusions: ['resolution.resolved', 'resolution.falseAlarm'],
      defaultConclusion: 'resolution.resolved',
      notes: 'resolution.defaultNotes',
      operator: 'YZU',
      resolvedAt: '2026-08-12 10:32:44',
    },
    systemStatusKeys: ['system.sensorNormal', 'system.videoRealtime', 'system.syncNow'],
  }
}

export const mockDashboardData: Record<ModuleId, DashboardViewModel> = {
  lineClamp: dashboard(
    'lineClamp', 'DIF-042',
    metrics([
      ['metrics.deviceStatus', 'common.normal'], ['metrics.speed', '0.38', 'm/s'], ['metrics.floor', '1F'], ['metrics.point', 'DIF-042'],
      ['metrics.clampCount', '24'], ['metrics.anomalyCount', '1', undefined, 'warning'], ['metrics.confidence', '96', '%'], ['metrics.alertLevel', 'common.orange', undefined, 'warning'],
    ]),
    'trend.deformationConfidence', '%',
    series([['trend.deformationConfidence', 'primary', [78, 81, 84, 88, 93, 96]], ['trend.threshold', 'threshold', [90, 90, 90, 90, 90, 90]]]),
    ['event.clampDeformed', 'event.clampLoose', 'event.clampMissing'],
    overlay('line-clamp', 'overlay.lineClamp', 'overlay.confidence', [['overlay.deformation', '8.4', 'mm'], ['overlay.confidence', '96', '%'], ['metrics.point', 'DIF-042']]),
    'areas.lineClamp',
  ),
  lineProtrusion: dashboard(
    'lineProtrusion', 'LIT-118',
    metrics([
      ['metrics.inspectionStatus', 'common.inspecting'], ['metrics.speed', '0.32', 'm/s'], ['metrics.floor', '1F'], ['metrics.point', 'LIT-118'],
      ['metrics.protrusion', '18.6', 'mm', 'warning'], ['metrics.threshold', '15', 'mm'], ['metrics.confidence', '94', '%'], ['metrics.eventLevel', 'common.orange', undefined, 'warning'],
    ]),
    'trend.protrusion', 'mm',
    series([['trend.protrusion', 'primary', [8, 10, 11, 13, 17, 18.6]], ['trend.threshold', 'threshold', [15, 15, 15, 15, 15, 15]]]),
    ['event.lineProtrusion', 'event.sheathBulge', 'event.edgeAnomaly'],
    overlay('line-protrusion', 'overlay.lineProtrusion', 'overlay.confidence', [['overlay.protrusion', '18.6', 'mm'], ['overlay.confidence', '94', '%'], ['metrics.point', 'LIT-118']]),
    'areas.lineProtrusion',
  ),
  magneticPlate: dashboard(
    'magneticPlate', 'CMP-063',
    metrics([
      ['metrics.deviceStatus', 'common.normal'], ['metrics.speed', '0.35', 'm/s'], ['metrics.floor', '1F'], ['metrics.point', 'CMP-063'],
      ['metrics.plateTemperature', '42.8', '°C'], ['metrics.offset', '4.2', 'mm', 'warning'], ['metrics.integrity', '91', '%'], ['metrics.alertLevel', 'common.yellow', undefined, 'warning'],
    ]),
    'trend.plateOffset', 'mm',
    series([['trend.plateOffset', 'primary', [1.8, 2.1, 2.4, 3.0, 3.7, 4.2]], ['trend.threshold', 'threshold', [4, 4, 4, 4, 4, 4]]]),
    ['event.plateOffset', 'event.plateLoose', 'event.surfaceDefect', 'event.temperatureHigh'],
    overlay('magnetic-plate', 'overlay.magneticPlate', 'overlay.confidence', [['overlay.offset', '4.2', 'mm'], ['overlay.confidence', '92', '%'], ['metrics.plateTemperature', '42.8', '°C']]),
    'areas.magneticPlate',
  ),
  infraredTemperature: dashboard(
    'infraredTemperature', 'ETC-009',
    metrics([
      ['metrics.inspectionStatus', 'common.inspecting'], ['metrics.deviceId', 'AN0111'], ['metrics.floor', '1F'], ['metrics.point', 'ETC-009'],
      ['metrics.currentTemperature', '38.6', '°C', 'danger'], ['metrics.threshold', '37.3', '°C'], ['metrics.temperatureRise', '1.8', '°C'], ['metrics.eventLevel', 'common.red', undefined, 'danger'],
    ]),
    'trend.temperature', '°C',
    series([['trend.temperature', 'primary', [36.8, 37.0, 37.2, 37.5, 38.1, 38.6]], ['trend.threshold', 'threshold', [37.3, 37.3, 37.3, 37.3, 37.3, 37.3]]]),
    ['event.temperatureHigh', 'event.temperatureRise', 'event.hotspot'],
    overlay('infrared', 'overlay.infrared', 'overlay.temperature', [['overlay.temperature', '38.6', '°C'], ['metrics.threshold', '37.3', '°C'], ['metrics.point', 'ETC-009']]),
    'areas.infraredTemperature',
  ),
  lifeSensing: dashboard(
    'lifeSensing', 'LIT-086',
    metrics([
      ['metrics.frontDistance', '12.6', 'm'], ['metrics.speed', '0.38', 'm/s'], ['metrics.floor', '1F'], ['metrics.point', 'LIT-086'],
      ['metrics.breathing', '10', 'bpm', 'normal', true], ['metrics.heartRate', '48', 'bpm', 'normal', true], ['metrics.lifeStatus', 'common.abnormal', undefined, 'warning'], ['metrics.eventLevel', 'common.red', undefined, 'danger'],
    ]),
    'trend.breathing', 'bpm',
    series([['trend.breathing', 'primary', [16, 15, 15, 14, 12, 10]], ['trend.heartRate', 'secondary', [68, 67, 65, 60, 54, 48]]]),
    ['event.personFallen', 'event.personStill', 'event.vitalsWeak'],
    overlay('vital-signs', 'overlay.vitalSigns', 'overlay.confidence', [['overlay.breathing', '10', 'bpm'], ['overlay.heart', '48', 'bpm'], ['overlay.radar', '77', 'GHz']]),
    'areas.lifeSensing',
  ),
}
