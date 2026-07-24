import type { Student, GradeRecord, AttendanceRecord } from '../types'
import { calculateGradeAverage, calculateAttendanceRate } from './grades'
import { MOCK_CLASSES } from '../data/mockParishData'

export type ReportType = 'CLASS_GRADEBOOK' | 'STUDENT_REPORT_CARD' | 'SACRAMENT_CERTIFICATE'

export interface ReportOptions {
  title?: string
  academicYear?: string
  parishName?: string
  dioceseName?: string
}

const DEFAULT_OPTIONS: ReportOptions = {
  parishName: 'Giáo Xứ Thánh Gia',
  dioceseName: 'Giáo Phận Xuân Lộc',
  academicYear: '2025 - 2026',
}

/**
 * Generates an HTML printable document for Class Gradebook (Sổ Điểm Lớp)
 */
export function generateClassGradebookHTML(
  classId: string,
  students: Student[],
  grades: GradeRecord[],
  attendance: AttendanceRecord[],
  options: ReportOptions = DEFAULT_OPTIONS,
): string {
  const classInfo = MOCK_CLASSES.find((c) => c.id === classId)
  const classStudents = students.filter((s) => s.classId === classId)
  const year = options.academicYear || DEFAULT_OPTIONS.academicYear

  const studentRows = classStudents
    .map((s, idx) => {
      const studentGrades = grades.filter((g) => g.studentId === s.id && g.academicYear === year)
      const sem1Grade = studentGrades.find((g) => g.semester === 1)
      const sem2Grade = studentGrades.find((g) => g.semester === 2)

      const sem1Res = sem1Grade ? calculateGradeAverage(sem1Grade) : null
      const sem2Res = sem2Grade ? calculateGradeAverage(sem2Grade) : null
      const sem1Avg = sem1Res?.score ?? null
      const sem2Avg = sem2Res?.score ?? null

      let yearAvg: number | null = null
      if (sem1Avg !== null && sem2Avg !== null) yearAvg = Number(((sem1Avg + sem2Avg) / 2).toFixed(1))
      else if (sem1Avg !== null) yearAvg = sem1Avg
      else if (sem2Avg !== null) yearAvg = sem2Avg

      const studentAtt = attendance.filter((a) => a.studentId === s.id)
      const presentCount = studentAtt.filter((a) => a.status === 'Present').length
      const attRate = calculateAttendanceRate(presentCount, studentAtt.length)

      return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${s.code}</td>
        <td><strong>${s.holyName}</strong> ${s.fullName}</td>
        <td style="text-align: center;">${s.gender}</td>
        <td style="text-align: center;">${s.dateOfBirth}</td>
        <td style="text-align: center;">${sem1Avg !== null ? sem1Avg.toFixed(1) : '-'}</td>
        <td style="text-align: center;">${sem2Avg !== null ? sem2Avg.toFixed(1) : '-'}</td>
        <td style="text-align: center; font-weight: bold; color: #1E3A8A;">${yearAvg !== null ? yearAvg.toFixed(1) : '-'}</td>
        <td style="text-align: center;">${attRate.rate}%</td>
        <td style="font-size: 11px;">${s.parentPhone}</td>
      </tr>
    `
    })
    .join('')

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Sổ Điểm Lớp ${classInfo?.name || classId}</title>
      <style>
        @page { size: A4 landscape; margin: 15mm; }
        body { font-family: Arial, sans-serif; color: #1E293B; margin: 0; padding: 20px; font-size: 12px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1E3A8A; padding-bottom: 10px; margin-bottom: 20px; }
        .header h1 { font-size: 18px; color: #1E3A8A; margin: 0; text-transform: uppercase; }
        .header p { margin: 2px 0; color: #64748B; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #CBD5E1; padding: 6px 8px; font-size: 11px; }
        th { background-color: #F1F5F9; color: #1E3A8A; text-transform: uppercase; font-size: 10px; }
        tr:nth-child(even) { background-color: #F8FAFC; }
        .footer { margin-top: 30px; display: flex; justify-content: space-between; text-align: center; font-size: 11px; }
        .signature-box { width: 200px; }
        .signature-space { height: 50px; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <p><strong>${options.dioceseName || DEFAULT_OPTIONS.dioceseName}</strong></p>
          <p><strong>${options.parishName || DEFAULT_OPTIONS.parishName}</strong></p>
        </div>
        <div style="text-align: right;">
          <h1>SỔ ĐIỂM GIÁO LÝ</h1>
          <p>Lớp: <strong>${classInfo?.name || classId}</strong> | Năm học: <strong>${year}</strong></p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 35px;">STT</th>
            <th style="width: 70px;">Mã TN</th>
            <th>Họ và Tên Thiếu Nhi</th>
            <th style="width: 45px;">Phái</th>
            <th style="width: 80px;">Ngày Sinh</th>
            <th style="width: 50px;">ĐTB HK1</th>
            <th style="width: 50px;">ĐTB HK2</th>
            <th style="width: 55px;">ĐTB Cả Năm</th>
            <th style="width: 65px;">Chuyên Cần</th>
            <th style="width: 90px;">SĐT Phụ Huynh</th>
          </tr>
        </thead>
        <tbody>
          ${studentRows}
        </tbody>
      </table>

      <div class="footer">
        <div class="signature-box">
          <p>Ngày ..... tháng ..... năm 20....</p>
          <p><strong>GLV Chủ Nhiệm</strong></p>
          <div class="signature-space"></div>
          <p><em>(Ký và ghi rõ họ tên)</em></p>
        </div>
        <div class="signature-box">
          <p>Xác nhận của Ban Hành Giáo</p>
          <p><strong>Cha Tuyên Úy / Trưởng Ban</strong></p>
          <div class="signature-space"></div>
          <p><em>(Ký tên & đóng dấu)</em></p>
        </div>
      </div>
    </body>
    </html>
  `
}

/**
 * Triggers native browser print preview window for the generated report HTML
 */
export function printHTMLReport(htmlContent: string) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(htmlContent)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
  }, 300)
}
