import { mockDashboardDataProvider } from '../data/DashboardDataProvider.ts'
import type { DashboardViewModel } from '../modules/types.ts'

export class LineProtrusionDataProvider {
  async getDashboard(): Promise<DashboardViewModel> {
    const base = await mockDashboardDataProvider.getDashboard('lineProtrusion')
    return {
      ...base,
      cases: [],
      defaultCaseId: '',
      metrics: base.metrics.map((metric) => {
        if (metric.labelKey === 'metrics.protrusion') return { ...metric, value: '0', unit: '°', tone: 'success' }
        if (metric.labelKey === 'metrics.threshold') return { ...metric, value: '5', unit: '°' }
        if (metric.labelKey === 'metrics.confidence') return { ...metric, value: '-', unit: undefined, tone: 'normal' }
        if (metric.labelKey === 'metrics.eventLevel') return { ...metric, value: 'common.normal', tone: 'success' }
        return metric
      }),
      trend: {
        ...base.trend,
        unit: '°',
        series: base.trend.series.map((series, index) => ({
          ...series,
          values: series.values.map(() => index === 0 ? 0 : 5),
        })),
      },
      overlay: {
        ...base.overlay,
        detailKey: 'overlay.protrusionNormal',
        stats: [
          { labelKey: 'overlay.protrusion', value: '0', unit: '°' },
          { labelKey: 'metrics.threshold', value: '5', unit: '°' },
        ],
        wires: [],
      },
    }
  }
}

export const lineProtrusionDataProvider = new LineProtrusionDataProvider()
