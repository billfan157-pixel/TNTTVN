import type { AttendanceRecord, Student } from '../types'
import { BRANCHES } from '../constants/branches'
import { calculateAttendanceRate } from '../utils/grades'
import { loadXlsx } from '../lib/xlsxLoader'

export interface SessionCountStat {
  present: number
  excused: number
  unexcused: number
  total: number
  rate: number
}

export type AttendanceStatusClassification = 'excellent' | 'good' | 'warning' | 'critical'

export interface StudentAttendanceSummary {
  student: Student
  mass: SessionCountStat
  catechism: SessionCountStat
  adoration: SessionCountStat
  overall: {
    totalSessions: number
    presentCount: number
    excusedCount: number
    unexcusedCount: number
    effectivePresent: number
    rate: number
    status: AttendanceStatusClassification
    statusLabel: string
  }
  historyRecords: AttendanceRecord[]
}

export interface AttendanceAnalyticsKPIs {
  totalStudents: number
  totalSessionsMarked: number
  averageRate: number
  massRate: number
  catechismRate: number
  adorationRate: number
  totalMassSessions: number
  totalCatechismSessions: number
  totalAdorationSessions: number
  excellentCount: number
  goodCount: number
  warningCount: number
  criticalCount: number
  atRiskStudents: Array<{
    student: Student
    summary: StudentAttendanceSummary
    reasons: string[]
  }>
  trendTimeline: Array<{
    date: string
    displayDate: string
    massRate: number | null
    catechismRate: number | null
    adorationRate: number | null
    overallRate: number
    totalRecords: number
  }>
}

export interface AttendanceRangeFilter {
  startDate?: string
  endDate?: string
}

/**
 * Tính toán số liệu chuyên cần cho 1 nhóm bản ghi của 1 loại hình sinh hoạt
 */
export function computeSessionStat(
  records: readonly AttendanceRecord[],
  excusedWeight: number = 1.0
): SessionCountStat {
  let present = 0
  let excused = 0
  let unexcused = 0

  for (const r of records) {
    if (r.status === 'Present') present++
    else if (r.status === 'AbsentExcused') excused++
    else if (r.status === 'AbsentUnexcused') unexcused++
  }

  const total = records.length
  const w = Math.min(Math.max(Number(excusedWeight) || 0, 0), 1)
  const effectivePresent = present + excused * w
  const { rate } = calculateAttendanceRate(effectivePresent, total)

  return {
    present,
    excused,
    unexcused,
    total,
    rate,
  }
}

/**
 * Tổng hợp toàn bộ số liệu chuyên cần chi tiết của 1 học sinh
 */
export function computeStudentAttendanceSummary(
  student: Student,
  records: readonly AttendanceRecord[],
  excusedWeight: number = 1.0,
  minRateThreshold: number = 80
): StudentAttendanceSummary {
  const studentRecords = records
    .filter((r) => r.studentId === student.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  const massRecords = studentRecords.filter((r) => r.type === 'SundayMass')
  const catechismRecords = studentRecords.filter((r) => r.type === 'CatechismClass')
  const adorationRecords = studentRecords.filter((r) => r.type === 'EucharisticAdoration')

  const mass = computeSessionStat(massRecords, excusedWeight)
  const catechism = computeSessionStat(catechismRecords, excusedWeight)
  const adoration = computeSessionStat(adorationRecords, excusedWeight)

  let presentCount = mass.present + catechism.present + adoration.present
  let excusedCount = mass.excused + catechism.excused + adoration.excused
  let unexcusedCount = mass.unexcused + catechism.unexcused + adoration.unexcused
  let totalSessions = mass.total + catechism.total + adoration.total

  const w = Math.min(Math.max(Number(excusedWeight) || 0, 0), 1)
  const effectivePresent = presentCount + excusedCount * w
  const { rate: overallRate } = calculateAttendanceRate(effectivePresent, totalSessions)

  let status: AttendanceStatusClassification = 'good'
  let statusLabel = 'Đạt / Tốt'

  if (totalSessions === 0) {
    status = 'good'
    statusLabel = 'Chưa có điểm danh'
  } else if (overallRate >= 95) {
    status = 'excellent'
    statusLabel = 'Xuất Sắc'
  } else if (overallRate >= minRateThreshold) {
    status = 'good'
    statusLabel = 'Đạt Chuẩn'
  } else if (overallRate >= minRateThreshold - 10) {
    status = 'warning'
    statusLabel = 'Cần Lưu Ý'
  } else {
    status = 'critical'
    statusLabel = 'Nguy Cơ Vắng Nhiều'
  }

  if (unexcusedCount >= 3 && status !== 'critical') {
    status = 'warning'
    statusLabel = 'Vắng Không Phép Nhiều'
  }

  return {
    student,
    mass,
    catechism,
    adoration,
    overall: {
      totalSessions,
      presentCount,
      excusedCount,
      unexcusedCount,
      effectivePresent,
      rate: overallRate,
      status,
      statusLabel,
    },
    historyRecords: studentRecords,
  }
}

/**
 * Tính toán Dashboard Analytics KPIs & Timeline xu hướng
 */
export function calculateClassAttendanceAnalytics(
  students: readonly Student[],
  attendanceRecords: readonly AttendanceRecord[],
  range?: AttendanceRangeFilter,
  excusedWeight: number = 1.0,
  minRateThreshold: number = 80
): {
  kpis: AttendanceAnalyticsKPIs
  summaries: StudentAttendanceSummary[]
} {
  // Lọc theo khoảng ngày nếu có
  const filteredRecords = attendanceRecords.filter((r) => {
    if (range?.startDate && r.date < range.startDate) return false
    if (range?.endDate && r.date > range.endDate) return false
    return true
  })

  // Pre-index records theo studentId
  const recordsByStudent = new Map<string, AttendanceRecord[]>()
  for (const r of filteredRecords) {
    const list = recordsByStudent.get(r.studentId) || []
    list.push(r)
    recordsByStudent.set(r.studentId, list)
  }

  // Pre-index records theo date để tính timeline
  const recordsByDate = new Map<string, AttendanceRecord[]>()
  for (const r of filteredRecords) {
    const list = recordsByDate.get(r.date) || []
    list.push(r)
    recordsByDate.set(r.date, list)
  }

  const validStudents = students.filter((s) => !s.deletedAt)
  const summaries: StudentAttendanceSummary[] = []
  let totalRateSum = 0
  let totalMassRateSum = 0
  let massCountWithRecords = 0
  let totalCatechismRateSum = 0
  let catechismCountWithRecords = 0
  let totalAdorationRateSum = 0
  let adorationCountWithRecords = 0

  let excellentCount = 0
  let goodCount = 0
  let warningCount = 0
  let criticalCount = 0

  const atRiskStudents: Array<{
    student: Student
    summary: StudentAttendanceSummary
    reasons: string[]
  }> = []

  const distinctDates = new Set<string>()
  const distinctMassDates = new Set<string>()
  const distinctCatechismDates = new Set<string>()
  const distinctAdorationDates = new Set<string>()

  for (const r of filteredRecords) {
    distinctDates.add(r.date)
    if (r.type === 'SundayMass') distinctMassDates.add(r.date)
    if (r.type === 'CatechismClass') distinctCatechismDates.add(r.date)
    if (r.type === 'EucharisticAdoration') distinctAdorationDates.add(r.date)
  }

  for (const s of validStudents) {
    const sRecords = recordsByStudent.get(s.id) || []
    const summary = computeStudentAttendanceSummary(s, sRecords, excusedWeight, minRateThreshold)
    summaries.push(summary)

    totalRateSum += summary.overall.rate
    if (summary.mass.total > 0) {
      totalMassRateSum += summary.mass.rate
      massCountWithRecords++
    }
    if (summary.catechism.total > 0) {
      totalCatechismRateSum += summary.catechism.rate
      catechismCountWithRecords++
    }
    if (summary.adoration.total > 0) {
      totalAdorationRateSum += summary.adoration.rate
      adorationCountWithRecords++
    }

    if (summary.overall.status === 'excellent') excellentCount++
    else if (summary.overall.status === 'good') goodCount++
    else if (summary.overall.status === 'warning') warningCount++
    else if (summary.overall.status === 'critical') criticalCount++

    // Kiểm tra danh sách nguy cơ
    const reasons: string[] = []
    if (summary.overall.totalSessions > 0) {
      if (summary.overall.rate < minRateThreshold) {
        reasons.push(`Tỷ lệ chuyên cần chung thấp (${summary.overall.rate}% < ${minRateThreshold}%)`)
      }
      if (summary.overall.unexcusedCount >= 3) {
        reasons.push(`Vắng không phép ${summary.overall.unexcusedCount} buổi`)
      }
      if (summary.mass.total > 0 && summary.mass.unexcused >= 2) {
        reasons.push(`Vắng Thánh Lễ không phép ${summary.mass.unexcused} buổi`)
      }
      if (summary.catechism.total > 0 && summary.catechism.unexcused >= 2) {
        reasons.push(`Vắng Học Giáo Lý không phép ${summary.catechism.unexcused} buổi`)
      }
    }

    if (reasons.length > 0) {
      atRiskStudents.push({
        student: s,
        summary,
        reasons,
      })
    }
  }

  const studentCount = validStudents.length || 1
  const averageRate = Number((totalRateSum / studentCount).toFixed(1))
  const massRate = massCountWithRecords > 0 ? Number((totalMassRateSum / massCountWithRecords).toFixed(1)) : 100
  const catechismRate = catechismCountWithRecords > 0 ? Number((totalCatechismRateSum / catechismCountWithRecords).toFixed(1)) : 100
  const adorationRate = adorationCountWithRecords > 0 ? Number((totalAdorationRateSum / adorationCountWithRecords).toFixed(1)) : 100

  // Xây dựng Timeline xu hướng theo từng ngày điểm danh
  const sortedDates = Array.from(recordsByDate.keys()).sort((a, b) => a.localeCompare(b))
  // Lấy tối đa 15 buổi gần nhất để biểu đồ rõ ràng
  const recentDates = sortedDates.slice(-15)

  const trendTimeline = recentDates.map((dateStr) => {
    const dayRecords = recordsByDate.get(dateStr) || []
    const massRecs = dayRecords.filter((r) => r.type === 'SundayMass')
    const catRecs = dayRecords.filter((r) => r.type === 'CatechismClass')
    const adoRecs = dayRecords.filter((r) => r.type === 'EucharisticAdoration')

    const dayMassStat = massRecs.length > 0 ? computeSessionStat(massRecs, excusedWeight) : null
    const dayCatStat = catRecs.length > 0 ? computeSessionStat(catRecs, excusedWeight) : null
    const dayAdoStat = adoRecs.length > 0 ? computeSessionStat(adoRecs, excusedWeight) : null
    const dayOverall = computeSessionStat(dayRecords, excusedWeight)

    const dParts = dateStr.split('-')
    const displayDate = dParts.length === 3 ? `${dParts[2]}/${dParts[1]}` : dateStr

    return {
      date: dateStr,
      displayDate,
      massRate: dayMassStat ? dayMassStat.rate : null,
      catechismRate: dayCatStat ? dayCatStat.rate : null,
      adorationRate: dayAdoStat ? dayAdoStat.rate : null,
      overallRate: dayOverall.rate,
      totalRecords: dayRecords.length,
    }
  })

  // Sắp xếp summaries theo Tên
  summaries.sort((a, b) => a.student.fullName.localeCompare(b.student.fullName))

  return {
    kpis: {
      totalStudents: validStudents.length,
      totalSessionsMarked: distinctDates.size,
      averageRate,
      massRate,
      catechismRate,
      adorationRate,
      totalMassSessions: distinctMassDates.size,
      totalCatechismSessions: distinctCatechismDates.size,
      totalAdorationSessions: distinctAdorationDates.size,
      excellentCount,
      goodCount,
      warningCount,
      criticalCount,
      atRiskStudents,
      trendTimeline,
    },
    summaries,
  }
}

/**
 * Xuất dữ liệu Bảng tổng hợp chuyên cần ra file Excel (.xlsx) / CSV
 */
export async function exportAttendanceSummaryReport(
  summaries: readonly StudentAttendanceSummary[],
  className: string = 'Toan_Doan',
  rangeLabel: string = 'Ca_Nam',
  format: 'xlsx' | 'csv' = 'xlsx'
): Promise<void> {
  const rows = summaries.map((s, index) => {
    const branchName = BRANCHES[s.student.branch]?.name ?? s.student.branch
    return {
      'STT': index + 1,
      'Mã Thiếu Nhi': s.student.code,
      'Tên Thánh': s.student.holyName || '',
      'Họ và Tên': s.student.fullName,
      'Phân Ngành': branchName,
      'Thánh Lễ: Có Mặt': s.mass.present,
      'Thánh Lễ: Có Phép': s.mass.excused,
      'Thánh Lễ: Vắng K.Phép': s.mass.unexcused,
      'Thánh Lễ: Tỷ Lệ (%)': s.mass.total > 0 ? s.mass.rate : '-',
      'Giáo Lý: Có Mặt': s.catechism.present,
      'Giáo Lý: Có Phép': s.catechism.excused,
      'Giáo Lý: Vắng K.Phép': s.catechism.unexcused,
      'Giáo Lý: Tỷ Lệ (%)': s.catechism.total > 0 ? s.catechism.rate : '-',
      'Chầu: Có Mặt': s.adoration.present,
      'Chầu: Có Phép': s.adoration.excused,
      'Chầu: Vắng K.Phép': s.adoration.unexcused,
      'Chầu: Tỷ Lệ (%)': s.adoration.total > 0 ? s.adoration.rate : '-',
      'Tổng Số Buổi': s.overall.totalSessions,
      'Tổng Điểm Hiện Diện': Number(s.overall.effectivePresent.toFixed(1)),
      'Tỷ Lệ Chuyên Cần Chung (%)': s.overall.rate,
      'Đánh Giá': s.overall.statusLabel,
      'SĐT Phụ Huynh': s.student.parentPhone || '',
    }
  })

  const safeClassName = className.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_')
  const filename = `TongHop_ChuyenCan_${safeClassName}_${rangeLabel}`

  if (format === 'csv') {
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []
    const lines = [
      headers.join(','),
      ...rows.map((r: any) =>
        headers
          .map((h) => {
            const val = r[h] !== undefined && r[h] !== null ? String(r[h]) : ''
            return val.includes(',') || val.includes('"') || val.includes('\n')
              ? `"${val.replace(/"/g, '""')}"`
              : val
          })
          .join(',')
      ),
    ]
    const content = '\uFEFF' + lines.join('\r\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    triggerDownload(blob, `${filename}.csv`)
  } else {
    // PERF-XLSX-1: lazy-load xlsx chỉ khi user thực sự xuất Excel.
    const XLSX = await loadXlsx()
    const worksheet = XLSX.utils.json_to_sheet(rows)
    // Tự căn chỉnh chiều rộng cột
    const colWidths = [
      { wch: 6 },  // STT
      { wch: 14 }, // Mã
      { wch: 16 }, // Tên Thánh
      { wch: 24 }, // Họ Tên
      { wch: 14 }, // Phân Ngành
      { wch: 16 }, // Lễ Có Mặt
      { wch: 16 }, // Lễ Có Phép
      { wch: 18 }, // Lễ K.Phép
      { wch: 16 }, // Lễ %
      { wch: 16 }, // GL Có Mặt
      { wch: 16 }, // GL Có Phép
      { wch: 18 }, // GL K.Phép
      { wch: 16 }, // GL %
      { wch: 16 }, // Chầu Có Mặt
      { wch: 16 }, // Chầu Có Phép
      { wch: 18 }, // Chầu K.Phép
      { wch: 16 }, // Chầu %
      { wch: 14 }, // Tổng buổi
      { wch: 18 }, // Tổng hiện diện
      { wch: 24 }, // Tỷ lệ chung %
      { wch: 22 }, // Đánh giá
      { wch: 16 }, // SĐT
    ]
    worksheet['!cols'] = colWidths
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'TongHopChuyenCan')
    const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    triggerDownload(blob, `${filename}.xlsx`)
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  try {
    a.click()
  } finally {
    // Cleanup must be synchronous. A delayed DOM callback can outlive the page
    // or the jsdom test environment and then touch a missing document.
    a.remove()
    URL.revokeObjectURL(url)
  }
}
