import type { DbExecutor } from '../db/index.js'
import type { LockStatePort } from './ports.js'

/**
 * Phase 2 (policy ports): spec chỉ phụ thuộc LockStatePort (inject qua
 * constructor). Không còn default repository infra trong domain — singletons
 * concrete nằm ở services/policyAdapters.ts.
 */
export class SemesterLockSpecification {
  private lockReader: LockStatePort

  constructor(lockReader: LockStatePort) {
    this.lockReader = lockReader
  }

  public async isSatisfiedBy(academicYear: string, semester: number, parishId: string, tx?: DbExecutor): Promise<boolean> {
    const isLocked = await this.lockReader.isLocked(academicYear, semester, parishId, tx)
    // Specification returns TRUE if operation is PERMITTED (i.e. semester is UNLOCKED)
    return !isLocked
  }
}
