import type { Student, GradeRecord, AttendanceRecord } from '../types'
import { calculateGradeAverage, calculateAttendanceRate } from './grades'
import { useClassStore } from '../stores/classStore'
import * as Sentry from '@sentry/react'

export type ReportType = 'CLASS_GRADEBOOK' | 'STUDENT_REPORT_CARD' | 'SACRAMENT_CERTIFICATE'

export interface ReportOptions {
  title?: string
  academicYear?: string
  parishName?: string
  dioceseName?: string
}

const DEFAULT_OPTIONS: ReportOptions = {
  parishName: 'Giáo Xứ Gia Tôn',
  dioceseName: 'Giáo Phận Xuân Lộc',
  academicYear: '2025 - 2026',
}

/**
 * 1. Generates HTML for Class Gradebook (Sổ Điểm Lớp)
 */
export function generateClassGradebookHTML(
  classId: string,
  students: Student[],
  grades: GradeRecord[],
  attendance: AttendanceRecord[],
  options: ReportOptions = DEFAULT_OPTIONS,
): string {
  const classInfo = useClassStore.getState().findClassById(classId)
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
 * 2. Generates HTML for Student Report Card (Phiếu Điểm Cá Nhân)
 */
export function generateStudentReportCardHTML(
  student: Student,
  grades: GradeRecord[],
  attendance: AttendanceRecord[],
  options: ReportOptions = DEFAULT_OPTIONS,
): string {
  const classInfo = useClassStore.getState().findClassById(student.classId)
  const year = options.academicYear || DEFAULT_OPTIONS.academicYear

  const studentGrades = grades.filter((g) => g.studentId === student.id && g.academicYear === year)
  const sem1Grade = studentGrades.find((g) => g.semester === 1)
  const sem2Grade = studentGrades.find((g) => g.semester === 2)

  const sem1Res = sem1Grade ? calculateGradeAverage(sem1Grade) : { score: null, label: 'Chưa có' }
  const sem2Res = sem2Grade ? calculateGradeAverage(sem2Grade) : { score: null, label: 'Chưa có' }

  const studentAtt = attendance.filter((a) => a.studentId === student.id)
  const presentCount = studentAtt.filter((a) => a.status === 'Present').length
  const attRate = calculateAttendanceRate(presentCount, studentAtt.length)

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Phiếu Điểm - ${student.holyName} ${student.fullName}</title>
      <style>
        @page { size: A4 portrait; margin: 20mm; }
        body { font-family: Arial, sans-serif; color: #1E293B; margin: 0; padding: 20px; font-size: 13px; }
        .card-header { text-align: center; border-bottom: 2px solid #1E3A8A; padding-bottom: 15px; margin-bottom: 20px; }
        .card-header h1 { color: #1E3A8A; font-size: 20px; margin: 5px 0; text-transform: uppercase; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #F8FAFC; padding: 15px; border-radius: 8px; border: 1px solid #CBD5E1; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #CBD5E1; padding: 8px 12px; text-align: center; }
        th { background: #F1F5F9; color: #1E3A8A; }
        .footer { margin-top: 40px; display: flex; justify-content: space-between; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card-header">
        <p><strong>${options.dioceseName || DEFAULT_OPTIONS.dioceseName}</strong> - <strong>${options.parishName || DEFAULT_OPTIONS.parishName}</strong></p>
        <h1>PHIẾU ĐIỂM GIÁO LÝ CA CẢ NĂM</h1>
        <p>Năm học: <strong>${year}</strong></p>
      </div>

      <div class="info-grid">
        <div>Tên Thánh, Họ và Tên: <strong>${student.holyName} ${student.fullName}</strong></div>
        <div>Mã Thiếu Nhi: <strong>${student.code}</strong></div>
        <div>Lớp: <strong>${classInfo?.name || student.classId}</strong></div>
        <div>Ngày sinh: <strong>${student.dateOfBirth}</strong></div>
        <div>Phụ huynh: <strong>${student.parentName} (${student.parentPhone})</strong></div>
        <div>Tỷ lệ Chuyên cần: <strong>${attRate.rate}%</strong> (${presentCount}/${studentAtt.length} buổi)</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Học Kỳ</th>
            <th>Điểm Miệng</th>
            <th>15 Phút</th>
            <th>1 Tiết</th>
            <th>Thi HK</th>
            <th>ĐTB Học Kỳ</th>
            <th>Xếp Loại</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Học Kỳ 1</strong></td>
            <td>${sem1Grade?.scoreOral ?? '-'}</td>
            <td>${sem1Grade?.score15m ?? '-'}</td>
            <td>${sem1Grade?.score1Period ?? '-'}</td>
            <td>${sem1Grade?.scoreFinal ?? '-'}</td>
            <td><strong>${sem1Res.score !== null ? sem1Res.score.toFixed(1) : '-'}</strong></td>
            <td>${sem1Res.label}</td>
          </tr>
          <tr>
            <td><strong>Học Kỳ 2</strong></td>
            <td>${sem2Grade?.scoreOral ?? '-'}</td>
            <td>${sem2Grade?.score15m ?? '-'}</td>
            <td>${sem2Grade?.score1Period ?? '-'}</td>
            <td>${sem2Grade?.scoreFinal ?? '-'}</td>
            <td><strong>${sem2Res.score !== null ? sem2Res.score.toFixed(1) : '-'}</strong></td>
            <td>${sem2Res.label}</td>
          </tr>
        </tbody>
      </table>

      <div class="footer">
        <div>
          <p>GLV Chủ Nhiệm</p>
          <div style="height: 60px;"></div>
          <p><em>(Ký tên)</em></p>
        </div>
        <div>
          <p>Xác nhận Cha Tuyên Úy</p>
          <div style="height: 60px;"></div>
          <p><em>(Ký tên & đóng dấu)</em></p>
        </div>
      </div>
    </body>
    </html>
  `
}

/**
 * 3. Generates HTML for Sacrament Certificate (Giấy Chứng Nhận Bí Tích)
 */
export function generateSacramentCertificateHTML(
  student: Student,
  options: ReportOptions = DEFAULT_OPTIONS,
): string {
  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Giấy Chứng Nhận Bí Tích - ${student.holyName} ${student.fullName}</title>
      <style>
        @page { size: A4 landscape; margin: 15mm; }
        body { font-family: 'Times New Roman', serif; color: #1E293B; margin: 0; padding: 40px; text-align: center; border: 10px double #1E3A8A; min-height: 80vh; }
        h1 { color: #1E3A8A; font-size: 26px; text-transform: uppercase; margin-bottom: 5px; }
        h2 { color: #D97706; font-size: 22px; text-transform: uppercase; margin-top: 20px; }
        p { font-size: 15px; line-height: 1.8; }
        .cert-name { font-size: 24px; font-weight: bold; color: #1E3A8A; margin: 15px 0; }
        .footer { margin-top: 50px; display: flex; justify-content: space-around; font-size: 14px; }
      </style>
    </head>
    <body>
      <p><strong>${options.dioceseName || DEFAULT_OPTIONS.dioceseName}</strong></p>
      <p><strong>${options.parishName || DEFAULT_OPTIONS.parishName}</strong></p>
      
      <h2>GIẤY CHỨNG NHẬN BÍ TÍCH</h2>
      <h1>RƠMÊÔ / THÁNH THỂ & THÊM SỨC</h1>

      <p>Chứng nhận em Thiếu nhi:</p>
      <div class="cert-name">${student.holyName} ${student.fullName}</div>
      <p>Sinh ngày: <strong>${student.dateOfBirth}</strong> | Phụ huynh: <strong>${student.parentName}</strong></p>

      <p style="max-width: 600px; margin: 20px auto;">
        Đã hoàn thành chương trình Học Giáo Lý và đã đủ điều kiện lãnh nhận các Bí Tích Thánh Thể & Bí Tích Thêm Sức theo Giáo luật của Hội Thánh.
      </p>

      <div class="footer">
        <div>
          <p>Ngày ..... tháng ..... năm 20....</p>
          <p><strong>Trưởng Ban Giáo Lý</strong></p>
          <div style="height: 60px;"></div>
        </div>
        <div>
          <p>Linh Mục Chánh Xứ / Tuyên Úy</p>
          <div style="height: 60px;"></div>
          <p><em>(Ký tên & đóng dấu)</em></p>
        </div>
      </div>
    </body>
    </html>
  `
}

/**
 * Triggers browser print with popup blocker handling & iframe fallback
 */
export function printHTMLReport(htmlContent: string) {
  try {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      // Popup blocked fallback: create temporary hidden iframe
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      document.body.appendChild(iframe)
      
      const doc = iframe.contentWindow?.document
      if (doc) {
        doc.open()
        doc.write(htmlContent)
        doc.close()
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      }
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 2000)
      return
    }

    printWindow.document.write(htmlContent)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 300)
  } catch (err) {
    Sentry.captureException(err)
    alert('Không thể mở cửa sổ in. Vui lòng cho phép Popup trên trình duyệt!')
  }
}
