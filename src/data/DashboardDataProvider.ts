import type { DashboardViewModel, ModuleId } from '../modules/types.ts'
import { mockDashboardData } from './mockDashboardData.ts'

export interface DashboardDataProvider {
  getDashboard(moduleId: ModuleId): Promise<DashboardViewModel>
}

export const mockDashboardDataProvider: DashboardDataProvider = {
  async getDashboard(moduleId) {
    return structuredClone(mockDashboardData[moduleId])
  },
}
