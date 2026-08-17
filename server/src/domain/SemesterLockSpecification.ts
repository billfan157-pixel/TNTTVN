import { drizzleSemesterLockRepository, DrizzleSemesterLockRepository } from '../repositories/DrizzleSemesterLockRepository.js'
import type { DbExecutor } from '../db/index.js'

export class SemesterLockSpecification {
  private lockRepo: DrizzleSemesterLockRepository

  constructor(lockRepo: DrizzleSemesterLockRepository = drizzleSemesterLockRepository) {
    this.lockRepo = lockRepo
  }

  public async isSatisfiedBy(academicYear: string, semester: number, parishId: string, tx?: DbExecutor): Promise<boolean> {
    const isLocked = await this.lockRepo.isLocked(academicYear, semester, parishId, tx)
    // Specification returns TRUE if operation is PERMITTED (i.e. semester is UNLOCKED)
    return !isLocked
  }
}

export const semesterLockSpecification = new SemesterLockSpecification()
