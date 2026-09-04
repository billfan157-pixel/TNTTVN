import { db } from '../db/index.js'
import { students, users } from '../db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'
import { checkUserClassAccess } from '../middleware/auth.js'
import { getStudentClassId } from './studentService.js'
import { drizzleSemesterLockRepository } from '../repositories/DrizzleSemesterLockRepository.js'
import { SemesterLockSpecification } from '../domain/SemesterLockSpecification.js'
import { CanOverrideGradeSpecification } from '../domain/CanOverrideGradeSpecification.js'
import { CanAccessStudentSpecification } from '../domain/CanAccessStudentSpecification.js'
import { PromotionEligibilitySpecification } from '../domain/PromotionSpecifications.js'
import type { ClassAccessPort, LockStatePort, StudentAccessQueries, StudentClassPort } from '../domain/ports.js'

/**
 * Phase 2 (policy ports): infrastructure adapters cho domain policy ports.
 * Đây là nơi DUY NHẤT domain specs được bind với Drizzle/middleware —
 * services (và tests) lấy singletons từ đây, KHÔNG từ domain/*.
 */

// ─── Lock state (DrizzleSemesterLockRepository) ───
const drizzleLockPort: LockStatePort = {
  isLocked: (academicYear, semester, parishId, executor = db) =>
    drizzleSemesterLockRepository.isLocked(academicYear, semester, parishId, executor),
}

// ─── Class access (middleware auth) + student class (studentService) ───
const middlewareAccessPort: ClassAccessPort = {
  hasAccess: (userId, parishId, classId, executor = db) =>
    checkUserClassAccess(userId, parishId, classId, executor),
}

const serviceClassPort: StudentClassPort = {
  getClassId: (studentId, parishId, executor = db) =>
    getStudentClassId(studentId, parishId, executor),
}

// ─── Access queries (Drizzle schema reads) ───
const drizzleAccessQueries: StudentAccessQueries = {
  findStudent: async (parishId, studentId, executor = db) => {
    const [row] = await executor
      .select({ id: students.id, classId: students.classId, parentPhone: students.parentPhone })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
      .limit(1)
    return row ?? null
  },
  findUserPhone: async (userId, parishId, executor = db) => {
    const [row] = await executor
      .select({ phone: users.phone })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.parishId, parishId)))
      .limit(1)
    return row?.phone ?? null
  },
}

// ─── Singletons (SSOT cho services/tests) ───
export const semesterLockSpecification = new SemesterLockSpecification(drizzleLockPort)

export const canOverrideGradeSpecification = new CanOverrideGradeSpecification(
  middlewareAccessPort,
  serviceClassPort,
)

export const canAccessStudentSpecification = new CanAccessStudentSpecification(
  drizzleAccessQueries,
  middlewareAccessPort,
)

export const promotionEligibilitySpecification = new PromotionEligibilitySpecification(
  undefined,
  undefined,
  new SemesterLockSpecification(drizzleLockPort),
)
