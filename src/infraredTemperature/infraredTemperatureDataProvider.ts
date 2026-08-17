import { formatTrendClock } from '../components/dashboard/trendGeometry.ts'
import { mockDashboardDataProvider } from '../data/DashboardDataProvider.ts'
import type { DashboardViewModel } from '../modules/types.ts'

/**
 * Infrared temperature has no live data source yet. On load, restamp the demo
 * dashboard with the current clock so the trend x-axis and header read as a
 * live session instead of the frozen mock timestamp.
 */
export const infraredTemperatureDataProvider = {
  async getDashboard(): Promise<DashboardViewModel> {
    const dashboard = await mockDashboardDataProvider.getDashboard('infraredTemperature')
    const now = new Date()
    return {
      ...dashboard,
      timestamp: formatTimestamp(now),
      trend: {
        ...dashboard.trend,
        labels: dashboard.trend.labels.map((_, index, all) => (
          formatTrendClock(new Date(now.getTime() - (all.length - 1 - index) * 1000))
        )),
      },
    }
  },
}

function formatTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
