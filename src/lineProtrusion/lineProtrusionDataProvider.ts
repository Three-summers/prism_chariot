import { mockDashboardDataProvider } from '../data/DashboardDataProvider.ts'
import type { DashboardViewModel } from '../modules/types.ts'

export class LineProtrusionDataProvider {
  async getDashboard(): Promise<DashboardViewModel> {
    const base = await mockDashboardDataProvider.getDashboard('lineProtrusion')
    return { ...base, cases: [], defaultCaseId: '' }
  }
}

export const lineProtrusionDataProvider = new LineProtrusionDataProvider()
