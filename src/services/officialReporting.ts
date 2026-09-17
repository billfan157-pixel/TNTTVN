import { api } from '../lib/api'
import type { ClassSummaryDTO, ReportCardDTO, ReportClassDTO } from '../types'
import { normalizeAcademicYear } from '../utils/academicYear'

export type OfficialClassMetadata = ReportClassDTO

export interface OfficialClassReport {
  classInfo: OfficialClassMetadata
  summary: ClassSummaryDTO
  reportCards: ReportCardDTO[]
}

export async function fetchOfficialReportClasses(academicYear: string): Promise<OfficialClassMetadata[]> {
  return api.getReportClasses(normalizeAcademicYear(academicYear))
}

/**
 * Official academic output gateway.
 *
 * It deliberately has no Zustand/Dexie fallback. The server projection decides
 * whether the requested year is live or finalized and fails closed when frozen
 * historical evidence is missing.
 */
export async function fetchOfficialClassReport(
  classId: string,
  academicYear: string,
  classInfo?: OfficialClassMetadata,
): Promise<OfficialClassReport> {
  const year = normalizeAcademicYear(academicYear)
  const summary = await api.getClassSummary(classId, year)
  const reportCards = await Promise.all(
    summary.students.map((student) => api.getStudentReportCard(student.studentId, year)),
  )
  return {
    classInfo: {
      ...(classInfo || { id: classId, name: summary.className, branchId: summary.branchId, academicYear: year }),
      id: classId,
      // The projection owns historical labels and branch evidence. Never let
      // mutable class metadata override it.
      name: summary.className,
      branchId: summary.branchId,
      academicYear: year,
    },
    summary,
    reportCards,
  }
}

export async function fetchOfficialAcademicYearReports(academicYear: string): Promise<OfficialClassReport[]> {
  const year = normalizeAcademicYear(academicYear)
  const authorizedClasses = await fetchOfficialReportClasses(year)

  const reports = await Promise.all(
    authorizedClasses.map((item) => fetchOfficialClassReport(item.id, year, item)),
  )
  if (reports.some((item) => !item.classInfo.branchId)) {
    throw new Error('Dữ liệu lịch sử thiếu phân ngành đã chốt; không thể dùng lớp hiện tại để thay thế.')
  }
  return reports.sort((a, b) => a.classInfo.name.localeCompare(b.classInfo.name, 'vi'))
}
