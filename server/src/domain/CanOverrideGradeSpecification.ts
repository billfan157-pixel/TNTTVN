import { checkUserClassAccess } from '../middleware/auth.js'
import { getStudentClassId } from '../services/studentService.js'

export class CanOverrideGradeSpecification {
  public async isSatisfiedBy(userId: string, targetStudentId: string, userParishId: string): Promise<boolean> {
    const studentClassId = await getStudentClassId(targetStudentId, userParishId)
    if (!studentClassId) return false
    const hasAccess = await checkUserClassAccess(userId, userParishId, studentClassId)
    return hasAccess
  }
}

export const canOverrideGradeSpecification = new CanOverrideGradeSpecification()
