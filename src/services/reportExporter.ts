import { useAcademicYearStore } from '../stores/academicYearStore'
import { BRANCHES } from '../constants/branches'
import { normalizeAcademicYear, getCurrentAcademicYear } from '../utils/academicYear'
import { loadXlsx } from '../lib/xlsxLoader'
import { fetchOfficialAcademicYearReports, type OfficialClassReport } from './officialReporting'

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

/** Deterministic CSV payload; browser download is only a transport wrapper. */
export function buildCsvContent(rows: ExportRow[]): string {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => {
        const value = String(r[h] ?? '')
        return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
      }).join(','),
    ),
  ]
  return '\uFEFF' + lines.join('\n')
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

/** Tên file mặc định kèm ngày — dùng cho cả CSV/Excel. */
export function exportFilename(prefix: string): string {
  return `${prefix}_${new Date().toISOString().slice(0, 10)}`
}
