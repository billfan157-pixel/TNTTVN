import type { ClassAccessPort, StudentClassPort } from './ports.js'

/**
 * Phase 2 (policy ports): spec chỉ phụ thuộc ports (inject qua constructor).
 * Không còn static import middleware auth / studentService trong domain —
 * singletons concrete nằm ở services/policyAdapters.ts.
 */
export class CanOverrideGradeSpecification {
  private access: ClassAccessPort
  private classes: StudentClassPort

  constructor(access: ClassAccessPort, classes: StudentClassPort) {
    this.access = access
    this.classes = classes
  }

  public async isSatisfiedBy(
    userId: string,
    targetStudentId: string,
    userParishId: string,
  ): Promise<boolean> {
    const studentClassId = await this.classes.getClassId(targetStudentId, userParishId)
    if (!studentClassId) return false
    const hasAccess = await this.access.hasAccess(userId, userParishId, studentClassId)
    return hasAccess
  }
}
