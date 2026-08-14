import { DEFAULT_MEDIA } from '../config/defaultMedia.ts'
import type { DashboardViewModel, ModuleId } from '../modules/types.ts'
import { mockDashboardData } from './mockDashboardData.ts'

export interface DashboardDataProvider {
  getDashboard(moduleId: ModuleId): Promise<DashboardViewModel>
}

export const mockDashboardDataProvider: DashboardDataProvider = {
  async getDashboard(moduleId) {
    const dashboard = structuredClone(mockDashboardData[moduleId])
    const media = DEFAULT_MEDIA[moduleId]
    if (media.kind === 'stream') return dashboard
    dashboard.media = {
      ...dashboard.media,
      kind: media.kind,
      src: media.src,
      ...(media.kind === 'image' ? { sourceWidth: media.width, sourceHeight: media.height } : {}),
    }
    if (media.kind === 'image' && 'targets' in media && media.targets) {
      dashboard.overlay.targets = structuredClone(media.targets)
    }
    return dashboard
  },
}
