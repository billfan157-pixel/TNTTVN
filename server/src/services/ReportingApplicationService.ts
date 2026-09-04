import { reportCardProjectionRepository, ReportCardProjectionRepository } from '../repositories/ReportCardProjectionRepository.js'
import type { ReportCardDTO } from '../repositories/ReportCardProjectionRepository.js'
import { classSummaryProjectionRepository, ClassSummaryProjectionRepository } from '../repositories/ClassSummaryProjectionRepository.js'
import type { ClassSummaryDTO } from '../repositories/ClassSummaryProjectionRepository.js'
import { canAccessStudentSpecification } from './policyAdapters.js'
import type { CanAccessStudentSpecification } from '../domain/CanAccessStudentSpecification.js'
import { checkUserClassAccess, type JwtPayload } from '../middleware/auth.js'

export class ReportingApplicationService {
  private reportCardRepo: ReportCardProjectionRepository
  private classSummaryRepo: ClassSummaryProjectionRepository
  private canAccessStudentSpec: CanAccessStudentSpecification

  constructor(
    reportCardRepo: ReportCardProjectionRepository = reportCardProjectionRepository,
    classSummaryRepo: ClassSummaryProjectionRepository = classSummaryProjectionRepository,
    canAccessStudentSpec: CanAccessStudentSpecification = canAccessStudentSpecification
  ) {
    this.reportCardRepo = reportCardRepo
    this.classSummaryRepo = classSummaryRepo
    this.canAccessStudentSpec = canAccessStudentSpec
  }

  /**
   * CQRS Read Service: Generate Student Report Card
   */
  public async getStudentReportCard(
    user: JwtPayload,
    studentId: string,
    academicYear: string
  ): Promise<ReportCardDTO | null> {
    const isAuthorized = await this.canAccessStudentSpec.isSatisfiedBy(user, studentId)
    if (!isAuthorized) {
      const err = new Error('Bạn không có quyền truy cập phiếu điểm của thiếu nhi này')
      ;(err as any).status = 403
      throw err
    }
    return this.reportCardRepo.getStudentReportCard(studentId, academicYear, user.parishId)
  }

  /**
   * CQRS Read Service: Generate Class Academic & Attendance Summary Report
   */
  public async getClassSummary(
    user: JwtPayload,
    classId: string,
    academicYear: string
  ): Promise<ClassSummaryDTO | null> {
    if (user.role !== 'admin') {
      const isAuthorized = await checkUserClassAccess(user.userId, user.parishId, classId)
      if (!isAuthorized) {
        const err = new Error('Bạn không có quyền truy cập báo cáo tổng hợp của lớp này')
        ;(err as any).status = 403
        throw err
      }
    }
    return this.classSummaryRepo.getClassSummary(classId, academicYear, user.parishId)
  }
}

export const reportingApplicationService = new ReportingApplicationService()
