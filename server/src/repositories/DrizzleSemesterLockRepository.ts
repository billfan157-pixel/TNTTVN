import { db, type DbExecutor } from '../db/index.js'
import { semesterLocks } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { generateId } from '../utils/id.js'

export class DrizzleSemesterLockRepository {
  public async isLocked(academicYear: string, semester: number, parishId: string, tx: DbExecutor = db): Promise<boolean> {
    const [row] = await tx
      .select({ isLocked: semesterLocks.isLocked })
      .from(semesterLocks)
      .where(
        and(
          eq(semesterLocks.parishId, parishId),
          eq(semesterLocks.academicYear, academicYear),
          eq(semesterLocks.semester, semester)
        )
      )
      .limit(1)

    return row ? row.isLocked === 1 : false
  }

  public async setLockState(
    academicYear: string,
    semester: number,
    isLocked: boolean,
    userId: string,
    parishId: string,
    unlockReason?: string,
    tx: DbExecutor = db
  ): Promise<void> {
    const now = new Date().toISOString()
    const lockVal = isLocked ? 1 : 0

    // AYL-05 (audit 2026-08-08): upsert 1 câu — hết race select-then-insert ném UNIQUE → 500.
    // AYL-04: unlock xoá lockedBy/lockedAt + ghi unlockedBy/unlockedAt — semantic không còn nhầm.
    await tx
      .insert(semesterLocks)
      .values({
        id: generateId('SML'),
        parishId,
        academicYear,
        semester,
        isLocked: lockVal,
        lockedBy: isLocked ? userId : null,
        lockedAt: isLocked ? now : null,
        unlockReason: !isLocked ? unlockReason || 'Unlocked by admin' : null,
        unlockedBy: isLocked ? null : userId,
        unlockedAt: isLocked ? null : now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [semesterLocks.parishId, semesterLocks.academicYear, semesterLocks.semester],
        set: {
          isLocked: lockVal,
          lockedBy: isLocked ? userId : null,
          lockedAt: isLocked ? now : null,
          unlockReason: !isLocked ? unlockReason || 'Unlocked by admin' : null,
          unlockedBy: isLocked ? null : userId,
          unlockedAt: isLocked ? null : now,
          updatedAt: now,
        },
      })
  }
}

export const drizzleSemesterLockRepository = new DrizzleSemesterLockRepository()
