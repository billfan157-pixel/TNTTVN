import { useAcademicYearStore } from '../stores/academicYearStore'
import { BRANCHES } from '../constants/branches'
import { normalizeAcademicYear, getCurrentAcademicYear } from '../utils/academicYear'
import { loadXlsx } from '../lib/xlsxLoader'
import { rowsToSafeCsv } from '../utils/csv'
import { fetchOfficialAcademicYearReports, fetchOfficialClassReport, type OfficialClassReport } from './officialReporting'

export type ExportRow = Record<string, string | number>

/**
 * Bảng thống kê học lực theo phân ngành (khớp UI DesktopReports):
 * đếm số học sinh theo xếp loại của học kỳ đã chọn.
 */
export async function buildBranchSummaryRows(semester: 1 | 2): Promise<ExportRow[]> {
  const year = normalizeAcademicYear(useAcademicYearStore.getState().currentYear) || getCurrentAcademicYear()
  const classReports = await fetchOfficialAcademicYearReports(year)

  return Object.values(BRANCHES).map((b) => {
    const branchStudents = classReports
      .filter((report) => report.classInfo.branchId === b.id)
      .flatMap((report) => report.reportCards)
    let xs = 0, gi = 0, kh = 0, tb = 0, ye = 0
    for (const report of branchStudents) {
      const label = report.grades.find((grade) => grade.semester === semester)?.classification
      if (label === 'Xuất Sắc') xs++
      else if (label === 'Giỏi') gi++
      else if (label === 'Khá') kh++
      else if (label === 'Trung Bình') tb++
      else if (label === 'Yếu') ye++
    }
    return {
      'Phân Ngành': b.name,
      'Số Thiếu Nhi': branchStudents.length,
      'Xuất Sắc': xs,
      'Giỏi': gi,
      'Khá': kh,
      'Trung Bình': tb,
      'Cần Cố Gắng': ye,
    }
  })
}

/**
 * Báo cáo chi tiết từng học sinh: GPA HK1/HK2/cả năm, xếp loại, chuyên cần —
 * dùng trực tiếp server ReportCardDTO; không tính lại từ client store.
 */
export async function buildStudentDetailRows(): Promise<ExportRow[]> {
  const year = normalizeAcademicYear(useAcademicYearStore.getState().currentYear) || getCurrentAcademicYear()
  const classReports = await fetchOfficialAcademicYearReports(year)

  return buildStudentDetailRowsFromReports(classReports)
}

/** Pure export projection used by every student-detail CSV/XLSX caller. */
export function buildStudentDetailRowsFromReports(classReports: OfficialClassReport[]): ExportRow[] {
  const rows: ExportRow[] = []
  for (const classReport of classReports) {
    for (const report of classReport.reportCards) {
      const semester1 = report.grades.find((grade) => grade.semester === 1)
      const semester2 = report.grades.find((grade) => grade.semester === 2)
      rows.push({
        'Mã Học Sinh': report.student.code,
        'Thánh Danh': report.student.holyName || '',
        'Họ Tên': report.student.fullName,
        'Lớp': report.student.className || classReport.summary.className,
        'Phân Ngành': BRANCHES[classReport.classInfo.branchId as keyof typeof BRANCHES]?.name ?? classReport.classInfo.branchId,
        'HK1': semester1?.gpa ?? '-',
        'HK2': semester2?.gpa ?? '-',
        'ĐTB Cả Năm': report.yearSummary.gpa ?? '-',
        'Xếp Loại': report.yearSummary.classification || 'Chưa có',
        'Chuyên Cần (%)': report.attendanceSummary.overallAttendanceRate.toFixed(1),
      })
    }
  }
  return rows.sort(
    (a, b) =>
      String(a['Phân Ngành']).localeCompare(String(b['Phân Ngành'])) ||
      String(a['Lớp']).localeCompare(String(b['Lớp'])) ||
      String(a['Họ Tên']).localeCompare(String(b['Họ Tên'])),
  )
}

/** Canonical semester gradebook rows built only from server Reporting DTOs. */
export function buildOfficialGradebookRowsFromReports(
  classReports: OfficialClassReport[],
  semester: 1 | 2,
): ExportRow[] {
  const rows: ExportRow[] = []
  for (const classReport of classReports) {
    for (const report of classReport.reportCards) {
      const grade = report.grades.find((item) => item.semester === semester)
      rows.push({
        'Mã TN': report.student.code,
        'Thánh Danh': report.student.holyName || '',
        'Họ và Tên': report.student.fullName,
        'Lớp': report.student.className || classReport.summary.className,
        'Phái': report.student.gender || '',
        'Ngày Sinh': report.student.dateOfBirth || '',
        'Miệng': grade?.scoreOral ?? '',
        '15 Phút': grade?.score15m ?? '',
        '1 Tiết': grade?.score1Period ?? '',
        'Giữa Kỳ': grade?.scoreMidterm ?? '',
        'Cuối Kỳ': grade?.scoreFinal ?? '',
        'Đạo Đức': grade?.scoreDaoDuc ?? '',
        'ĐTB': grade?.gpa ?? '',
        'Xếp Loại': grade?.classification || '',
      })
    }
  }
  return rows.sort(
    (a, b) => String(a['Lớp']).localeCompare(String(b['Lớp']), 'vi')
      || String(a['Họ và Tên']).localeCompare(String(b['Họ và Tên']), 'vi')
      || String(a['Mã TN']).localeCompare(String(b['Mã TN']), 'vi'),
  )
}

/** Deterministic CSV payload; browser download is only a transport wrapper. */
export function buildCsvContent(rows: ExportRow[]): string {
  return '\uFEFF' + rowsToSafeCsv(rows)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

/** Xuất CSV (kèm BOM UTF-8 để Excel mở đúng tiếng Việt). */
export function exportCsv(filename: string, rows: ExportRow[]): void {
  triggerDownload(new Blob([buildCsvContent(rows)], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

/** Xuất Excel (.xlsx) qua lazy-loaded xlsx (PERF-XLSX-1) — chunk chỉ tải khi export. */
export async function exportXlsx(filename: string, sheetName: string, rows: ExportRow[]): Promise<void> {
  const XLSX = await loadXlsx()
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/**
 * Reachable gradebook buttons must never serialize Zustand/Dexie/editor state.
 * This gateway obtains the authorized current/frozen cohort from Reporting and
 * writes a real XLSX whose formula-looking strings remain string cells.
 */
export async function exportOfficialGradebook(params: {
  academicYear: string
  semester: 1 | 2
  classId: string
}): Promise<void> {
  const year = normalizeAcademicYear(params.academicYear) || getCurrentAcademicYear()
  const reports = params.classId === 'all'
    ? await fetchOfficialAcademicYearReports(year)
    : [await fetchOfficialClassReport(params.classId, year)]
  const rows = buildOfficialGradebookRowsFromReports(reports, params.semester)
  const semesterLabel = params.semester === 1 ? 'HK1' : 'HK2'
  await exportXlsx(exportFilename(`BangDiem_${semesterLabel}`), `Bảng điểm ${semesterLabel}`, rows)
}

/** Tên file mặc định kèm ngày — dùng cho cả CSV/Excel. */
export function exportFilename(prefix: string): string {
  return `${prefix}_${new Date().toISOString().slice(0, 10)}`
}
