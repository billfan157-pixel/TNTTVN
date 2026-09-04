import { db, type DbExecutor } from '../db/index.js'
import { students, users } from '../db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'
import { checkUserClassAccess } from './classAccessQueryService.js'
import { getStudentClassId } from './studentService.js'
import { drizzleSemesterLockRepository } from '../repositories/DrizzleSemesterLockRepository.js'
import { SemesterLockSpecification } from '../domain/SemesterLockSpecification.js'
import { CanOverrideGradeSpecification } from '../domain/CanOverrideGradeSpecification.js'
import { CanAccessStudentSpecification } from '../domain/CanAccessStudentSpecification.js'
import { PromotionEligibilitySpecification } from '../domain/PromotionSpecifications.js'
import type { ClassAccessPort, LockStatePort, StudentAccessQueries, StudentClassPort } from '../domain/ports.js'

/**
 * Phase 2 (policy ports): infrastructure adapters cho domain policy ports.
 * Đây là nơi domain specs được bind với Drizzle executor. Mỗi critical use
 * case tạo specification từ transaction hiện hành; domain không nhận tx.
 */

// ─── Lock state (DrizzleSemesterLockRepository) ───
function createLockPort(executor: DbExecutor): LockStatePort {
  return {
    isLocked: (academicYear, semester, parishId) =>
      drizzleSemesterLockRepository.isLocked(academicYear, semester, parishId, executor),
  }
}

function createClassAccessPort(executor: DbExecutor): ClassAccessPort {
  return {
    hasAccess: (userId, parishId, classId) =>
      checkUserClassAccess(userId, parishId, classId, executor),
  }
}

function createStudentClassPort(executor: DbExecutor): StudentClassPort {
  return {
    getClassId: (studentId, parishId) => getStudentClassId(studentId, parishId, executor),
  }
}

function createAccessQueries(executor: DbExecutor): StudentAccessQueries {
  return {
    findStudent: async (parishId, studentId) => {
      const [row] = await executor
        .select({ id: students.id, classId: students.classId, parentPhone: students.parentPhone })
        .from(students)
        .where(and(eq(students.id, studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
        .limit(1)
      return row ?? null
    },
    findUserPhone: async (userId, parishId) => {
      const [row] = await executor
        .select({ phone: users.phone })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.parishId, parishId)))
        .limit(1)
      return row?.phone ?? null
    },
  }
}

// ─── Singletons (SSOT cho services/tests) ───
export function createSemesterLockSpecification(executor: DbExecutor = db): SemesterLockSpecification {
  return new SemesterLockSpecification(createLockPort(executor))
}

export function createCanOverrideGradeSpecification(executor: DbExecutor = db): CanOverrideGradeSpecification {
  return new CanOverrideGradeSpecification(createClassAccessPort(executor), createStudentClassPort(executor))
}

export function createCanAccessStudentSpecification(executor: DbExecutor = db): CanAccessStudentSpecification {
  return new CanAccessStudentSpecification(createAccessQueries(executor), createClassAccessPort(executor))
}

export function createPromotionEligibilitySpecification(executor: DbExecutor = db): PromotionEligibilitySpecification {
  return new PromotionEligibilitySpecification(undefined, undefined, createSemesterLockSpecification(executor))
}

// Non-transactional compatibility singletons. Critical write use cases must use
// the factories above with their active transaction executor.
export const semesterLockSpecification = createSemesterLockSpecification()
export const canOverrideGradeSpecification = createCanOverrideGradeSpecification()
export const canAccessStudentSpecification = createCanAccessStudentSpecification()
export const promotionEligibilitySpecification = createPromotionEligibilitySpecification()
