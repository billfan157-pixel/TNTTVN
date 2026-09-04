import { reportCardProjectionRepository, ReportCardProjectionRepository } from '../repositories/ReportCardProjectionRepository.js'
import type { ReportCardDTO } from '../repositories/ReportCardProjectionRepository.js'
import type { ReportingProjectionContext } from '../repositories/ReportCardProjectionRepository.js'
import { classSummaryProjectionRepository, ClassSummaryProjectionRepository } from '../repositories/ClassSummaryProjectionRepository.js'
import type { ClassSummaryDTO } from '../repositories/ClassSummaryProjectionRepository.js'
import { createCanAccessStudentSpecification } from './policyAdapters.js'
import { checkUserClassAccess } from './classAccessQueryService.js'
import type { ActorContext } from '../types/actor.js'
import { runDbTransaction, type DbTransaction } from '../db/index.js'
import { getAcademicYearDateRange } from './academicYearService.js'
import { getParishAttendancePolicy, getParishGradeWeights } from './parishSettingsService.js'

export class ReportingApplicationService {
  private reportCardRepo: ReportCardProjectionRepository
  private classSummaryRepo: ClassSummaryProjectionRepository

  constructor(
    reportCardRepo: ReportCardProjectionRepository = reportCardProjectionRepository,
    classSummaryRepo: ClassSummaryProjectionRepository = classSummaryProjectionRepository,
  ) {
    this.reportCardRepo = reportCardRepo
    this.classSummaryRepo = classSummaryRepo
  }

  private async createProjectionContext(
    tx: DbTransaction,
    parishId: string,
    academicYear: string,
  ): Promise<ReportingProjectionContext> {
    // Keep every read on the same transaction executor. Resolve sequentially
    // because the libSQL transaction handle is not a general-purpose pool.
    const academicYearRange = await getAcademicYearDateRange(parishId, academicYear, tx)
    const gradeWeights = await getParishGradeWeights(parishId, tx)
    const attendancePolicy = await getParishAttendancePolicy(parishId, tx)
    return { executor: tx, academicYearRange, gradeWeights, attendancePolicy }
  }

  /**
   * CQRS Read Service: Generate Student Report Card
   */
  public async getStudentReportCard(
    user: ActorContext,
    studentId: string,
    academicYear: string
  ): Promise<ReportCardDTO | null> {
    return runDbTransaction(async (tx) => {
      const isAuthorized = await createCanAccessStudentSpecification(tx).isSatisfiedBy(user, studentId)
      if (!isAuthorized) {
        const err = new Error('Bạn không có quyền truy cập phiếu điểm của thiếu nhi này')
        ;(err as any).status = 403
        throw err
      }
      const context = await this.createProjectionContext(tx, user.parishId, academicYear)
      return this.reportCardRepo.getStudentReportCard(studentId, academicYear, user.parishId, context)
    })
  }

  /**
   * CQRS Read Service: Generate Class Academic & Attendance Summary Report
   */
  public async getClassSummary(
    user: ActorContext,
    classId: string,
    academicYear: string
  ): Promise<ClassSummaryDTO | null> {
    return runDbTransaction(async (tx) => {
      if (user.role !== 'admin') {
        const isAuthorized = await checkUserClassAccess(user.userId, user.parishId, classId, tx)
        if (!isAuthorized) {
          const err = new Error('Bạn không có quyền truy cập báo cáo tổng hợp của lớp này')
          ;(err as any).status = 403
          throw err
        }
      }
      const context = await this.createProjectionContext(tx, user.parishId, academicYear)
      return this.classSummaryRepo.getClassSummary(classId, academicYear, user.parishId, context)
    })
  }
}

export const reportingApplicationService = new ReportingApplicationService()
