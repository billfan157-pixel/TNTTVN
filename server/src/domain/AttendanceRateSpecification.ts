import type { AttendanceStatus } from './AttendanceRecord.js'

export interface AttendanceRateCalculationInput {
  records: Array<{ status: AttendanceStatus }>
  excusedWeight?: number // Configurable in systemSettings (default 1.0)
}

export class AttendanceRateSpecification {
  /**
   * Calculates attendance rate with division-by-zero guards and boundary clamping [0, 100].
   */
  public calculateRate(input: AttendanceRateCalculationInput): number {
    const totalSessions = input.records.length
    if (totalSessions === 0) {
      return 100.0 // Default 100% for students with zero recorded sessions
    }

    const excusedWeight = typeof input.excusedWeight === 'number' ? input.excusedWeight : 1.0
    let weightedPresents = 0

    for (const r of input.records) {
      if (r.status === 'Present') {
        weightedPresents += 1.0
      } else if (r.status === 'AbsentExcused') {
        weightedPresents += Math.min(Math.max(excusedWeight, 0), 1.0)
      }
    }

    const rawRate = (weightedPresents / totalSessions) * 100.0
    const clampedRate = Math.min(Math.max(rawRate, 0.0), 100.0)

    return Number(clampedRate.toFixed(1))
  }

  /**
   * Evaluates if attendance rate satisfies minimum threshold requirement.
   */
  public isSatisfiedBy(calculatedRate: number, minAttendanceThreshold: number = 80.0): boolean {
    return calculatedRate >= minAttendanceThreshold
  }
}

export const attendanceRateSpecification = new AttendanceRateSpecification()
