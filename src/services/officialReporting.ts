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

async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 5,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let currentIndex = 0

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++
      results[idx] = await fn(items[idx], idx)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
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

  // Check if students already have embedded grades and classification from enriched backend projection
  const canSynthesize = summary.students.length > 0 && summary.students.every((s) => {
    const attendance = s.attendanceSummary
    const promotion = s.promotion
    return Array.isArray(s.grades)
      && attendance != null
      && typeof attendance.massPresentCount === 'number'
      && typeof attendance.massTotalCount === 'number'
      && typeof attendance.catechismPresentCount === 'number'
      && typeof attendance.catechismTotalCount === 'number'
      && typeof attendance.overallAttendanceRate === 'number'
      && Object.prototype.hasOwnProperty.call(s, 'promotion')
      && (promotion === null || (promotion != null
        && typeof promotion.status === 'string'
        && typeof promotion.gpa === 'number'
        && typeof promotion.attendanceRate === 'number'
        && typeof promotion.isOverridden === 'boolean'))
  })
  let reportCards: ReportCardDTO[]

  if (canSynthesize) {
    reportCards = summary.students.map((student) => ({
      student: {
        id: student.studentId,
        code: student.code,
        holyName: student.holyName,
        fullName: student.fullName,
        gender: student.gender ?? null,
        dateOfBirth: student.dateOfBirth ?? null,
        className: summary.className,
      },
      academicYear: year,
      grades: (student.grades || []).map((g) => ({
        semester: g.semester,
        scoreOral: g.scoreOral ?? null,
        score15m: g.score15m ?? null,
        score1Period: g.score1Period ?? null,
        scoreMidterm: g.scoreMidterm ?? null,
        scoreFinal: g.scoreFinal ?? null,
        scoreDaoDuc: g.scoreDaoDuc ?? null,
        gpa: g.gpa ?? null,
        classification: g.classification ?? null,
      })),
      yearSummary: {
        gpa: student.gpa ?? null,
        classification: student.classification ?? null,
      },
      attendanceSummary: { ...student.attendanceSummary },
      promotion: student.promotion ? { ...student.promotion } : null,
    }))
  } else if (summary.students.length === 0) {
    reportCards = []
  } else {
    // Fallback if grades were not embedded (e.g. legacy endpoint or mock in unit tests)
    reportCards = await pMap(
      summary.students,
      (student) => api.getStudentReportCard(student.studentId, year),
      5,
    )
  }

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

  const reports = await pMap(
    authorizedClasses,
    (item) => fetchOfficialClassReport(item.id, year, item),
    5,
  )
  if (reports.some((item) => !item.classInfo.branchId)) {
    throw new Error('Dữ liệu lịch sử thiếu phân ngành đã chốt; không thể dùng lớp hiện tại để thay thế.')
  }
  return reports.sort((a, b) => a.classInfo.name.localeCompare(b.classInfo.name, 'vi'))
}
