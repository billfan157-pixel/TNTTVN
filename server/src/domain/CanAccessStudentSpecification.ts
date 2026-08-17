import { db } from '../db/index.js'
import { students, users } from '../db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'
import { checkUserClassAccess, type JwtPayload } from '../middleware/auth.js'
import { phoneMatchVariants } from '../utils/phone.js'

export class CanAccessStudentSpecification {
  public async isSatisfiedBy(user: JwtPayload, targetStudentId: string): Promise<boolean> {
    if (user.role === 'admin') return true

    const [student] = await db
      .select({ id: students.id, classId: students.classId, parentPhone: students.parentPhone })
      .from(students)
      .where(and(eq(students.id, targetStudentId), eq(students.parishId, user.parishId), isNull(students.deletedAt)))
      .limit(1)

    if (!student) return false

    if (user.role === 'phuhuynh') {
      const [userDb] = await db
        .select({ phone: users.phone })
        .from(users)
        .where(and(eq(users.id, user.userId), eq(users.parishId, user.parishId)))
        .limit(1)
      if (!userDb || !userDb.phone) return false
      const variants = phoneMatchVariants(userDb.phone)
      return variants.length > 0 && variants.includes(student.parentPhone.trim())
    }

    if (user.role === 'chunhiem' || user.role === 'phuta') {
      if (!student.classId) return false
      return await checkUserClassAccess(user.userId, user.parishId, student.classId)
    }

    return false
  }
}

export const canAccessStudentSpecification = new CanAccessStudentSpecification()
