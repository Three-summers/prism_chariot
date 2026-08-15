import type { DashboardCase } from '../modules/types.ts'
import type { LifeState, PersonSnapshot } from './types.ts'

const MAX_CASES = 50

const severityByState: Record<LifeState, number> = {
  notDetected: 0,
  normal: 0,
  motionless: 1,
  breathHold: 2,
  vitalsAbnormal: 3,
  fallen: 4,
}

export class LifeSensingCaseTracker {
  private sequence = 0
  private readonly activeSeverity = new Map<number, number>()
  private history: DashboardCase[] = []

  update(people: readonly PersonSnapshot[], timestamp: string): DashboardCase[] {
    const created: DashboardCase[] = []
    const visibleIds = new Set(people.map((person) => person.id))

    for (const person of people) {
      const severity = severityByState[person.state]
      const previousSeverity = this.activeSeverity.get(person.id) ?? 0

      if (severity === 0) {
        this.activeSeverity.delete(person.id)
      } else {
        if (severity > previousSeverity) created.push(this.createCase(person, timestamp))
        this.activeSeverity.set(person.id, Math.max(previousSeverity, severity))
      }
    }

    for (const personId of this.activeSeverity.keys()) {
      if (!visibleIds.has(personId)) this.activeSeverity.delete(personId)
    }

    if (created.length > 0) {
      this.history = [...this.history, ...created].slice(-MAX_CASES)
    }
    return created
  }

  cases(): DashboardCase[] {
    return this.history.map((item) => ({ ...item }))
  }

  reset(): void {
    this.sequence = 0
    this.activeSeverity.clear()
    this.history = []
  }

  private createCase(person: PersonSnapshot, timestamp: string): DashboardCase {
    this.sequence += 1
    const fallen = person.state === 'fallen'
    return {
      id: `LIF-${String(this.sequence).padStart(4, '0')}`,
      levelKey: fallen ? 'common.red' : 'common.orange',
      color: fallen ? 'red' : 'orange',
      time: timestamp,
      spot: `LIT-086 / P${person.id}`,
      typeKey: eventKey(person.state),
      stateKey: 'common.processing',
      stateTone: 'processing',
      owner: 'YZU',
      updated: timestamp.slice(11),
    }
  }
}

function eventKey(state: LifeState): DashboardCase['typeKey'] {
  if (state === 'fallen' || state === 'vitalsAbnormal') return 'event.personFallen'
  if (state === 'motionless') return 'event.personStill'
  return 'event.vitalsWeak'
}
