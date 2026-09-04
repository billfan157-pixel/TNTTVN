import type { ActorContext } from '../types/actor.js'
import type { ClassAccessPort, StudentAccessQueries } from './ports.js'
import { phoneMatchVariants } from '../utils/phone.js'

/**
 * Phase 2 (policy ports): spec chỉ phụ thuộc ports (inject qua constructor) +
 * phone matcher thuần. Không còn db/schema/middleware runtime imports trong
 * domain — singletons concrete nằm ở services/policyAdapters.ts.
 */
export class CanAccessStudentSpecification {
  private queries: StudentAccessQueries
  private access: ClassAccessPort

  constructor(queries: StudentAccessQueries, access: ClassAccessPort) {
    this.queries = queries
    this.access = access
  }

  public async isSatisfiedBy(user: ActorContext, targetStudentId: string): Promise<boolean> {
    if (user.role === 'admin') return true

    const student = await this.queries.findStudent(user.parishId, targetStudentId)
    if (!student) return false

    if (user.role === 'phuhuynh') {
      const phone = await this.queries.findUserPhone(user.userId, user.parishId)
      if (!phone) return false
      const variants = phoneMatchVariants(phone)
      const parentPhone = (student.parentPhone ?? '').trim()
      return variants.length > 0 && parentPhone !== '' && variants.includes(parentPhone)
    }

    if (user.role === 'chunhiem' || user.role === 'phuta') {
      if (!student.classId) return false
      return await this.access.hasAccess(user.userId, user.parishId, student.classId)
    }

    return false
  }
}
