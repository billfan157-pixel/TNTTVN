import { useStudentStore } from '../stores/studentStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { BRANCHES } from '../constants/branches'
import { ReportViewModelFactory } from '../utils/reportViewModelFactory'
import { normalizeAcademicYear, getCurrentAcademicYear } from '../utils/academicYear'
import { loadXlsx } from '../lib/xlsxLoader'

export type ExportRow = Record<string, string | number>

/**
 * Bảng thống kê học lực theo phân ngành (khớp UI DesktopReports):
 * đếm số học sinh theo xếp loại của học kỳ đã chọn.
 */
export function buildBranchSummaryRows(semester: 1 | 2): ExportRow[] {
  const students = useStudentStore.getState().students
  const calculateStudentAvg = useGradeStore.getState().calculateStudentAvg

  return Object.values(BRANCHES).map((b) => {
    const branchStudents = students.filter((s) => !s.deletedAt && s.branch === b.id)
    let xs = 0, gi = 0, kh = 0, tb = 0, ye = 0
    for (const s of branchStudents) {
      const label = calculateStudentAvg(s.id, semester).label
      if (label === 'Xuất Sắc') xs++
      else if (label === 'Giỏi') gi++
      else if (label === 'Khá') kh++
      else if (label === 'Trung Bình') tb++
      else if (label === 'Yếu') ye++
    }
    return {
      'Phân Ngành': b.name,
      'Số Thiếu Nhi': branchStudents.length,
      'Xuất Sắc (≥9.0)': xs,
      'Giỏi': gi,
      'Khá': kh,
      'Trung Bình': tb,
      'Cần Cố Gắng': ye,
    }
  })
}

/**
 * Báo cáo chi tiết từng học sinh: GPA HK1/HK2/cả năm, xếp loại, chuyên cần —
 * tái sử dụng ReportViewModelFactory (SSOT với phiếu điểm in).
 */
export function buildStudentDetailRows(): ExportRow[] {
  const students = useStudentStore.getState().students
  const grades = useGradeStore.getState().grades
  const attendance = useAttendanceStore.getState().attendance
  const year = normalizeAcademicYear(useAcademicYearStore.getState().currentYear) || getCurrentAcademicYear()

  const rows: ExportRow[] = []
  for (const s of students) {
    if (s.deletedAt) continue
    const vm = ReportViewModelFactory.createStudentViewModel(s, grades, attendance, { academicYear: year })
    rows.push({
      'Mã Học Sinh': s.code,
      'Thánh Danh': vm.student.holyName,
      'Họ Tên': vm.student.fullName,
      'Lớp': vm.student.className,
      'Phân Ngành': BRANCHES[s.branch]?.name ?? s.branch,
      'HK1': vm.grades[0]?.gpaLabel ?? '-',
      'HK2': vm.grades[1]?.gpaLabel ?? '-',
      'ĐTB Cả Năm': vm.summary.gpaLabel,
      'Xếp Loại': vm.summary.classification,
      'Chuyên Cần (%)': typeof vm.summary.attendanceRate === 'number'
        ? vm.summary.attendanceRate.toFixed(1)
        : '-',
    })
  }
  return rows.sort(
    (a, b) =>
      String(a['Phân Ngành']).localeCompare(String(b['Phân Ngành'])) ||
      String(a['Lớp']).localeCompare(String(b['Lớp'])) ||
      String(a['Họ Tên']).localeCompare(String(b['Họ Tên'])),
  )
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
  triggerDownload(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`)
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
