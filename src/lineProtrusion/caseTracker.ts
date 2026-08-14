import type { DashboardCase } from '../modules/types.ts'
import type { LineProtrusionDetectionResult, WireIndex, WireState } from './types.ts'

export class LineProtrusionCaseTracker {
  private sequence = 0
  private readonly previous = new Map<WireIndex, WireState>([[0, 'ok'], [1, 'ok']])
  private readonly point: string

  constructor(point = 'C1-118') {
    this.point = point
  }

  next(result: LineProtrusionDetectionResult, timestamp: string): DashboardCase[] {
    if (result.state === 'failed') return []
    const created: DashboardCase[] = []
    for (const wire of result.wires) {
      const previous = this.previous.get(wire.wire) ?? 'ok'
      if (shouldCreateCase(previous, wire.state)) created.push(this.createCase(wire.wire, wire.state, timestamp))
      this.previous.set(wire.wire, wire.state)
    }
    return created
  }

  reset(): void {
    this.sequence = 0
    this.previous.set(0, 'ok')
    this.previous.set(1, 'ok')
  }

  private createCase(wire: WireIndex, state: WireState, timestamp: string): DashboardCase {
    this.sequence += 1
    const alarm = state === 'alarm'
    return {
      id: `LPR-${String(this.sequence).padStart(4, '0')}`,
      levelKey: alarm ? 'common.red' : 'common.orange',
      color: alarm ? 'red' : 'orange',
      time: timestamp,
      spot: `${this.point} / W${wire + 1}`,
      typeKey: alarm ? 'event.lineProtrusionAlarm' : 'event.lineProtrusionWarning',
      stateKey: 'common.processing',
      stateTone: 'processing',
      owner: '-',
      updated: timestamp.slice(11),
    }
  }
}

function shouldCreateCase(previous: WireState, current: WireState): boolean {
  return (previous === 'ok' && current !== 'ok') || (previous === 'warning' && current === 'alarm')
}
