import type { ModuleId, ThermalTarget } from '../modules/types.ts'

interface DefaultImageMedia {
  kind: 'image'
  src: string
  width: number
  height: number
  filename?: string
  targets?: ThermalTarget[]
}

interface DefaultVideoMedia {
  kind: 'video'
  src: string
}

interface DefaultStreamMedia {
  kind: 'stream'
  source: 'simulated'
}

export type DefaultMediaSource = DefaultImageMedia | DefaultVideoMedia | DefaultStreamMedia

export const DEFAULT_MEDIA = {
  lineClamp: {
    kind: 'image',
    src: '/resources/line-clamp-sample.jpg',
    width: 1280,
    height: 720,
    filename: 'camera_0_20260420_202604_100_VideoCap_1.jpg',
  },
  lineProtrusion: {
    kind: 'video',
    src: '/resources/line-protrusion-sample.mp4',
  },
  magneticPlate: {
    kind: 'image',
    src: '/resources/magnetic-plate-sample.jpg',
    width: 640,
    height: 480,
  },
  lifeSensing: {
    kind: 'stream',
    source: 'simulated',
  },
  infraredTemperature: {
    kind: 'image',
    src: '/resources/infrared-person-sample.jpg',
    width: 1080,
    height: 1840,
    targets: [{
      id: 'P01',
      x: 0.43,
      y: 0.595,
      width: 0.42,
      height: 0.386,
      temperatureC: 38.6,
      state: 'alarm',
    }],
  },
} satisfies Record<ModuleId, DefaultMediaSource>
