import type { Student, GradeRecord, AttendanceRecord, ReportCardDTO } from '../types'
import type { StudentReportCardViewModel, BatchReportViewModel } from '../types/reportViewModel'
import { escapeHtml, calculateGradeAverage, calculateAttendanceRate, countAttendancePresent, roundToDecimal, type GradeWeightsConfig } from './grades'
import { normalizeAcademicYear, getCurrentAcademicYear } from './academicYear'
import { ReportViewModelFactory } from './reportViewModelFactory'
import { ReportExportService } from '../services/reportExportService'
import { useSettingsStore } from '../stores/settingsStore'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { useClassStore } from '../stores/classStore'
import { BRANCHES } from '../constants/branches'
import { getSacramentStatus, getAge } from '../utils/sacraments'
import { generateCertificateQrSvg, buildCertificateQrPayload } from '../lib/qr'
import {  parishLogoImgHtml } from './parishLogo'

export type ReportType = 'CLASS_GRADEBOOK' | 'STUDENT_REPORT_CARD' | 'SACRAMENT_CERTIFICATE' | 'BATCH_STUDENT_REPORT_CARDS' | 'BATCH_PHOTO_CARDS' | 'PARENT_INVITATION' | 'BATCH_PARENT_INVITATIONS'

export interface ReportOptions {
  title?: string
  academicYear?: string
  parishName?: string
  dioceseName?: string
  meetingTime?: string
  meetingLocation?: string
  meetingReason?: string
  note?: string
}

export const REPORT_CARD_STYLES = `
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: Arial, sans-serif; color: #1E293B; margin: 0; padding: 15px; font-size: 13px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .card-header { text-align: center; border-bottom: 2px solid #1E3A8A; padding-bottom: 12px; margin-bottom: 15px; }
  .card-header.with-logo { display: flex; align-items: center; gap: 14px; text-align: left; }
  .card-header.with-logo .parish-logo { width: 58px; height: 58px; object-fit: contain; flex-shrink: 0; }
  .card-header.with-logo .header-text { flex: 1; text-align: center; }
  .card-header h1 { color: #1E3A8A; font-size: 18px; margin: 4px 0; text-transform: uppercase; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #F8FAFC; padding: 12px; border-radius: 6px; border: 1px solid #CBD5E1; margin-bottom: 15px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #CBD5E1; padding: 6px 10px; text-align: center; font-size: 12px; }
  th { background: #F1F5F9; color: #1E3A8A; font-weight: bold; }
  .footer { margin-top: 30px; display: flex; justify-content: space-between; text-align: center; font-size: 12px; }
  .signature-box { width: 180px; }
  .signature-space { height: 50px; }
  .page-break { page-break-after: always; break-after: page; page-break-inside: avoid; }

  [WATERMARK]
`

// P0 (2026-08-14): Tên giáo xứ cho watermark/header lấy từ settings — trước đây
// hardcode 'Giáo Xứ Gia Tôn' trong CSS tĩnh khiến mọi ấn phẩm in sai tên khi
// settings đổi (tenant correctness). buildWatermarkBlock inject theo tên đã escape.
function resolveParishName(options?: ReportOptions): string {
  return options?.parishName || useSettingsStore.getState().settings.parishName || 'Giáo Xứ Gia Tôn'
}

function buildWatermarkBlock(parishName: string): string {
  // SEC-XSS-1 (2026-09-09): parishName là input do admin cấu hình, được inject vào
  // <style> (rawtext — HTML parser đóng tag ở `</style>` đầu tiên bất kể CSS quoting).
  // Chỉ escape `\` và `'` là KHÔNG đủ: payload `</style><script>…` vẫn breakout.
  // Sanitize: loại bỏ `<`, `>`, `"` và ký tự xuống dòng trước khi escape CSS string.
  const safe = parishName
    .replace(/[<>"\u201C\u201D]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
  return `
  /* Watermark for document security */
  @media print {
    body::before {
      content: '${safe}';
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 120px;
      font-weight: 800;
      color: rgba(30, 58, 138, 0.03);
      pointer-events: none;
      z-index: 9999;
      white-space: nowrap;
      user-select: none;
    }
  }`
}

/**
 * Pure Single Student Report Card Body Renderer (Canonical Layout)
 */
export function renderStudentReportCardBody(vm: StudentReportCardViewModel): string {
  const { student, summary, grades, options } = vm

  const gradeRowsHtml = grades
    .map(
      (g) => `
      <tr>
        <td><strong>${escapeHtml(g.semesterLabel)}</strong></td>
        <td>${escapeHtml(g.scoreOral)}</td>
        <td>${escapeHtml(g.score15m)}</td>
        <td>${escapeHtml(g.score1Period)}</td>
        <td>${escapeHtml(g.scoreMidterm)}</td>
        <td>${escapeHtml(g.scoreFinal)}</td>
        <td>${escapeHtml(g.scoreDaoDuc)}</td>
        <td><strong>${escapeHtml(g.gpaLabel)}</strong></td>
        <td>${escapeHtml(g.classification)}</td>
      </tr>
    `
    )
    .join('')

  return `
    <div class="report-card-container">
      <div class="card-header with-logo">
        ${parishLogoImgHtml(58)}
        <div class="header-text">
          <p><strong>${escapeHtml(options.dioceseName)}</strong> - <strong>${escapeHtml(options.parishName)}</strong></p>
          <h1>PHIẾU KẾT QUẢ HỌC TẬP GIÁO LÝ CẢ NĂM</h1>
          <p>Năm học: <strong>${escapeHtml(options.academicYear)}</strong></p>
        </div>
      </div>

      <div class="info-grid">
        <div>Tên Thánh, Họ và Tên: <strong>${escapeHtml(student.holyName)} ${escapeHtml(student.fullName)}</strong></div>
        <div>Mã Thiếu Nhi: <strong>${escapeHtml(student.code)}</strong></div>
        <div>Lớp: <strong>${escapeHtml(student.className)}</strong></div>
        <div>Ngày sinh: <strong>${escapeHtml(student.dateOfBirth)}</strong></div>
        <div>Phụ huynh: <strong>${escapeHtml(student.parentName)} (${escapeHtml(student.parentPhone)})</strong></div>
        <div>Tỷ lệ Chuyên cần: <strong>${summary.attendanceRate}%</strong> (${summary.presentMassCount}/${summary.totalMassCount} buổi)</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Học Kỳ</th>
            <th>Điểm Miệng</th>
            <th>15 Phút</th>
            <th>1 Tiết</th>
            <th>Giữa Kỳ</th>
            <th>Thi HK</th>
            <th>Đạo Đức</th>
            <th>ĐTB Học Kỳ</th>
            <th>Xếp Loại</th>
          </tr>
        </thead>
        <tbody>
          ${gradeRowsHtml}
        </tbody>
      </table>

      <div style="margin-top: 12px; background: #F1F5F9; padding: 8px 12px; border-radius: 6px; border: 1px solid #CBD5E1; text-align: center;">
        <span style="font-size: 13px;">Điểm Trung Bình Cả Năm: <strong style="color: #1E3A8A; font-size: 15px;">${escapeHtml(summary.gpaLabel)}</strong></span>
        <span style="margin: 0 15px;">|</span>
        <span style="font-size: 13px;">Xếp Loại Chung: <strong style="color: #D97706; font-size: 14px;">${escapeHtml(summary.classification)}</strong></span>
      </div>

      <!-- Attendance 3-Pillar Breakdown Box -->
      <div style="margin-top: 12px; background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 6px; padding: 10px;">
        <div style="font-size: 11.5px; font-weight: bold; color: #1E3A8A; margin-bottom: 6px; display: flex; justify-content: space-between;">
          <span>CHI TIẾT ĐIỂM DANH CHUYÊN CẦN</span>
          <span>Chuyên Cần Cả Năm: <strong style="color: #16A34A;">${summary.attendanceRate}%</strong> (${summary.presentMassCount}/${summary.totalMassCount} buổi đi • vắng ${summary.attendanceDetails?.absentCount ?? (summary.totalMassCount - summary.presentMassCount)})</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 11px; text-align: center;">
          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; padding: 6px 8px; border-radius: 4px;">
            <strong style="color: #1E3A8A; display: block; margin-bottom: 2px;">Thánh Lễ Chúa Nhật</strong>
            <span><strong>${summary.attendanceDetails?.sundayMass.present ?? summary.presentMassCount}</strong> đi • <span style="color: ${(summary.attendanceDetails?.sundayMass.absent ?? 0) > 0 ? '#DC2626' : '#64748B'};">${summary.attendanceDetails?.sundayMass.absent ?? 0} vắng</span></span>
            <span style="color: #64748B; display: block; font-size: 10px; margin-top: 1px;">(Tổng: ${summary.attendanceDetails?.sundayMass.total ?? summary.totalMassCount} buổi)</span>
          </div>
          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; padding: 6px 8px; border-radius: 4px;">
            <strong style="color: #047857; display: block; margin-bottom: 2px;">Giờ Học Giáo Lý</strong>
            <span><strong>${summary.attendanceDetails?.catechism.present ?? 0}</strong> đi • <span style="color: ${(summary.attendanceDetails?.catechism.absent ?? 0) > 0 ? '#DC2626' : '#64748B'};">${summary.attendanceDetails?.catechism.absent ?? 0} vắng</span></span>
            <span style="color: #64748B; display: block; font-size: 10px; margin-top: 1px;">(Tổng: ${summary.attendanceDetails?.catechism.total ?? 0} buổi)</span>
          </div>
          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; padding: 6px 8px; border-radius: 4px;">
            <strong style="color: #B45309; display: block; margin-bottom: 2px;">Chầu & Sinh Hoạt</strong>
            <span><strong>${summary.attendanceDetails?.adoration.present ?? 0}</strong> đi • <span style="color: ${(summary.attendanceDetails?.adoration.absent ?? 0) > 0 ? '#DC2626' : '#64748B'};">${summary.attendanceDetails?.adoration.absent ?? 0} vắng</span></span>
            <span style="color: #64748B; display: block; font-size: 10px; margin-top: 1px;">(Tổng: ${summary.attendanceDetails?.adoration.total ?? 0} buổi)</span>
          </div>
        </div>
      </div>

      <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #CBD5E1; padding-top: 15px;">
        <div style="font-size: 11px; color: #475569; max-width: 320px;">
          <p style="margin: 0 0 4px 0; font-weight: bold; color: #1E3A8A;">Xác thực Kết Quả Học Tập (QR Verification)</p>
          <p style="margin: 0; line-height: 1.4;">Quét mã QR bên cạnh để kiểm tra tính nguyên vẹn của kết quả học tập hệ thống Brave Davinci.</p>
        </div>
        <div style="background: #FFFFFF; padding: 6px; border: 1px solid #CBD5E1; border-radius: 6px; text-align: center;">
          ${(() => {
            const certId = `REP-${student.id}-${options.academicYear.replace(/\s+/g, '')}`
            const payload = buildCertificateQrPayload(certId, student.id, 'completion')
            const svg = generateCertificateQrSvg(payload, 3)
            return `<div style="width: 72px; height: 72px;">${svg}</div>`
          })()}
          <span style="font-size: 9px; color: #64748B; display: block; margin-top: 2px;">${escapeHtml(student.code)}</span>
        </div>
      </div>

      <div class="footer">
        <div class="signature-box">
          <p>GLV Chủ Nhiệm</p>
          <div class="signature-space"></div>
          <p><em>(Ký tên)</em></p>
        </div>
        <div class="signature-box">
          <p>Xác nhận Cha Tuyên Úy</p>
          <div class="signature-space"></div>
          <p><em>(Ký tên & đóng dấu)</em></p>
        </div>
      </div>
    </div>
  `
}

/**
 * Pure Empty State Renderer
 */
export function renderEmptyStateHTML(message: string = 'Không có học sinh trong danh sách để xuất kết quả học tập.'): string {
  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Không có dữ liệu</title>
      <style>${REPORT_CARD_STYLES.replace('[WATERMARK]', buildWatermarkBlock(resolveParishName()))}</style>
    </head>
    <body>
      <div style="text-align: center; padding: 50px 20px;">
        <h2 style="color: #64748B;">${escapeHtml(message)}</h2>
      </div>
    </body>
    </html>
  `
}

/**
 * Pure Pure Renderer: Generates Standalone Batch Student Report Cards HTML Document
 */
export function generateBatchReportCardsHTML(batchVm: BatchReportViewModel): string {
  if (!batchVm || !batchVm.reports || batchVm.reports.length === 0) {
    return renderEmptyStateHTML('Không có học sinh trong danh sách để xuất kết quả học tập hàng loạt.')
  }

  const cardFragments = batchVm.reports.map((vm, idx) => {
    const cardHtml = renderStudentReportCardBody(vm)
    const pageBreak = idx < batchVm.reports.length - 1 ? '<div class="page-break"></div>' : ''
    return `${cardHtml}${pageBreak}`
  })

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Kết Quả Học Tập Hàng Loạt - ${escapeHtml(batchVm.classInfo?.name || 'Tất Cả')}</title>
      <style>
        ${REPORT_CARD_STYLES.replace('[WATERMARK]', buildWatermarkBlock(resolveParishName()))}
      </style>
    </head>
    <body>
      ${cardFragments.join('')}
    </body>
    </html>
  `
}

/**
 * Backward-Compatible Pure Utility: Single Student Report Card
 */
export function generateStudentReportCardHTML(
  student: Student,
  grades: GradeRecord[],
  attendance: AttendanceRecord[],
  options?: ReportOptions
): string {
  const vm = ReportViewModelFactory.createStudentViewModel(student, grades, attendance, options)
  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Kết Quả Học Tập - ${escapeHtml(student.holyName)} ${escapeHtml(student.fullName)}</title>
      <style>
        ${REPORT_CARD_STYLES.replace('[WATERMARK]', buildWatermarkBlock(resolveParishName(options)))}
      </style>
    </head>
    <body>
      ${renderStudentReportCardBody(vm)}
    </body>
    </html>
  `
}

const PARENT_PROMOTION_LABELS: Record<string, string> = {
  PROMOTED: 'Được lên lớp',
  RETAINED: 'Ở lại lớp',
  GRADUATED: 'Tốt nghiệp',
  CONDITIONALLY_PROMOTED: 'Lên lớp có điều kiện',
  TRANSFERRED: 'Chuyển ngành',
}

/**
 * Cổng Phụ Huynh Print (B2 consolidation): sinh phiếu kết quả học tập từ server `ReportCardDTO`
 * (ReportCardProjectionRepository) bằng template duy nhất bên pdfGenerator —
 * thay bản HTML thủ công trong `ParentPage`. Escaped + watermark + canh cỡ @page chuẩn.
 */
export function generateParentReportCardHTML(report: ReportCardDTO, options?: ReportOptions): string {
  const parishName = resolveParishName(options)
  const dioceseName = options?.dioceseName || useSettingsStore.getState().settings.dioceseName || 'Giáo Phận Xuân Lộc'
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : escapeHtml(String(v)))

  const gradeRowsHtml = report.grades
    .map(
      (g) => `
      <tr>
        <td><strong>Học Kỳ ${g.semester}</strong></td>
        <td>${fmt(g.scoreOral)}</td>
        <td>${fmt(g.score15m)}</td>
        <td>${fmt(g.score1Period)}</td>
        <td>${fmt(g.scoreMidterm)}</td>
        <td>${fmt(g.scoreFinal)}</td>
        <td>${fmt(g.scoreDaoDuc)}</td>
        <td><strong>${fmt(g.gpa)}</strong></td>
        <td>${escapeHtml(g.classification || 'Chưa có')}</td>
      </tr>
    `
    )
    .join('')

  const promotionLine = report.promotion
    ? `<div style="margin-top: 6px;">Kết quả năm: <strong>${escapeHtml(PARENT_PROMOTION_LABELS[report.promotion.status] || report.promotion.status)}</strong></div>`
    : ''

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Kết Quả Học Tập - ${escapeHtml(report.student.holyName ?? '')} ${escapeHtml(report.student.fullName)}</title>
      <style>
        ${REPORT_CARD_STYLES.replace('[WATERMARK]', buildWatermarkBlock(parishName))}
      </style>
    </head>
    <body>
      <div class="report-card-container">
        <div class="card-header with-logo">
          ${parishLogoImgHtml(58)}
          <div class="header-text">
            <p><strong>${escapeHtml(dioceseName)}</strong> - <strong>${escapeHtml(parishName)}</strong></p>
            <h1>PHIẾU KẾT QUẢ HỌC TẬP GIÁO LÝ</h1>
            <p>Năm học: <strong>${escapeHtml(report.academicYear)}</strong></p>
          </div>
        </div>
        <div class="info-grid">
          <div>Tên Thánh, Họ và Tên: <strong>${escapeHtml(report.student.holyName ?? '')} ${escapeHtml(report.student.fullName)}</strong></div>
          <div>Mã Thiếu Nhi: <strong>${escapeHtml(report.student.code)}</strong></div>
          <div>Lớp: <strong>${escapeHtml(report.student.className ?? '—')}</strong></div>
          <div>Ngày sinh: <strong>${escapeHtml(report.student.dateOfBirth ?? '—')}</strong></div>
        </div>
        <table>
          <thead>
            <tr><th>Học Kỳ</th><th>Điểm Miệng</th><th>15 Phút</th><th>1 Tiết</th><th>Giữa Kỳ</th><th>Thi HK</th><th>Đạo Đức</th><th>ĐTB Học Kỳ</th><th>Xếp Loại</th></tr>
          </thead>
          <tbody>
            ${gradeRowsHtml}
          </tbody>
        </table>
        <div class="summary" style="margin-top: 15px; background: #F1F5F9; padding: 10px; border-radius: 6px; border: 1px solid #CBD5E1; text-align: center;">
          Cả năm: <strong>${fmt(report.yearSummary.gpa)}</strong> — <strong>${escapeHtml(report.yearSummary.classification || 'Chưa có')}</strong><br />
          Chuyên cần: <strong>${fmt(report.attendanceSummary.overallAttendanceRate)}%</strong>
          (Lễ: ${fmt(report.attendanceSummary.massPresentCount)}/${fmt(report.attendanceSummary.massTotalCount)} — Giáo lý: ${fmt(report.attendanceSummary.catechismPresentCount)}/${fmt(report.attendanceSummary.catechismTotalCount)})${promotionLine}
        </div>
        <div class="footer">
          <div class="signature-box"><p>Phụ Huynh</p><div class="signature-space"></div><p><em>(Ký tên)</em></p></div>
          <div class="signature-box"><p>GLV Chủ Nhiệm</p><div class="signature-space"></div><p><em>(Ký tên)</em></p></div>
          <div class="signature-box"><p>Trưởng Ban Giáo Lý</p><div class="signature-space"></div><p><em>(Ký tên)</em></p></div>
        </div>
      </div>
    </body>
    </html>
  `
}

export function generateOfficialBatchReportCardsHTML(
  reports: ReportCardDTO[],
  profiles: Map<string, Pick<Student, 'parentName' | 'parentPhone'>>,
  classInfo?: { id: string; name: string },
  options?: ReportOptions,
): string {
  const viewModels = reports.map((report) => ReportViewModelFactory.createOfficialStudentViewModel(
    report,
    profiles.get(report.student.id),
    { parishName: options?.parishName, dioceseName: options?.dioceseName },
  ))
  return generateBatchReportCardsHTML({ classInfo, reports: Object.freeze(viewModels) })
}

export function generateOfficialClassGradebookHTML(
  reports: ReportCardDTO[],
  className: string,
  profiles: Map<string, Pick<Student, 'parentPhone'>>,
  options?: ReportOptions,
): string {
  const year = normalizeAcademicYear(options?.academicYear || reports[0]?.academicYear || getCurrentAcademicYear())
  const rows = reports.map((report, index) => {
    const semester1 = report.grades.find((grade) => grade.semester === 1)
    const semester2 = report.grades.find((grade) => grade.semester === 2)
    const fmt = (value: number | null | undefined) => value === null || value === undefined ? '-' : escapeHtml(String(value))
    return `
      <tr>
        <td style="text-align:center;">${index + 1}</td>
        <td>${escapeHtml(report.student.code)}</td>
        <td><strong>${escapeHtml(report.student.holyName || '')}</strong> ${escapeHtml(report.student.fullName)}</td>
        <td style="text-align:center;">${escapeHtml(report.student.gender || '')}</td>
        <td style="text-align:center;">${escapeHtml(report.student.dateOfBirth || '')}</td>
        <td style="text-align:center;">${fmt(semester1?.gpa)}</td>
        <td style="text-align:center;">${fmt(semester2?.gpa)}</td>
        <td style="text-align:center;font-weight:bold;color:#1E3A8A;">${fmt(report.yearSummary.gpa)}</td>
        <td style="text-align:center;">${fmt(report.attendanceSummary.overallAttendanceRate)}%</td>
        <td style="font-size:11px;">${escapeHtml(profiles.get(report.student.id)?.parentPhone || '')}</td>
      </tr>`
  }).join('')

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Sổ Điểm Lớp ${escapeHtml(className)}</title>
      <style>
        @page { size: A4 landscape; margin: 15mm; }
        body { font-family: Arial, sans-serif; color: #1E293B; margin: 0; padding: 20px; font-size: 12px; }
        .header { display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1E3A8A;padding-bottom:10px;margin-bottom:20px; }
        .header h1 { font-size:18px;color:#1E3A8A;margin:0;text-transform:uppercase; }
        table { width:100%;border-collapse:collapse;margin-top:10px; }
        th, td { border:1px solid #CBD5E1;padding:6px 8px;font-size:11px; }
        th { background-color:#F1F5F9;color:#1E3A8A;text-transform:uppercase;font-size:10px; }
        ${buildWatermarkBlock(resolveParishName(options))}
      </style>
    </head>
    <body>
      <div class="header">
        <div style="display:flex;align-items:center;gap:14px;">
          ${parishLogoImgHtml(52)}
          <div><div style="font-size:11px;font-weight:700;color:#1E3A8A;text-transform:uppercase;">${escapeHtml(resolveParishName(options))}</div><h1>SỔ ĐIỂM GIÁO LÝ</h1></div>
        </div>
        <div style="font-size:11px;color:#64748B;">Lớp: <strong>${escapeHtml(className)}</strong> · Năm học: <strong>${escapeHtml(year)}</strong></div>
      </div>
      <table>
        <thead><tr><th>STT</th><th>Mã TN</th><th>Họ và Tên Thiếu Nhi</th><th>Phái</th><th>Ngày Sinh</th><th>ĐTB HK1</th><th>ĐTB HK2</th><th>ĐTB Cả Năm</th><th>Chuyên Cần</th><th>SĐT Phụ Huynh</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body>
    </html>`
}

/**
 * Backward-Compatible Pure Utility: Class Gradebook HTML
 */
export function generateClassGradebookHTML(
  classId: string,
  students: Student[],
  grades: GradeRecord[],
  attendance: AttendanceRecord[],
  options?: ReportOptions
): string {
  const activeStudents = students.filter((s) => !s.deletedAt && s.classId === classId)
  // ADR-017 (F4): Năm học chuẩn hóa + fallback năm hiện tại — trước đây
  // exact-match `g.academicYear === year` với 'YYYY - YYYY'/'2025-2026' mismatch
  // khiến Sổ Điểm in ra toàn dấu '-'.
  const year = normalizeAcademicYear(options?.academicYear || getCurrentAcademicYear())
  // ADR-017 (F3): Trọng số từ settings giáo xứ.
  const gradeWeights: GradeWeightsConfig = useSettingsStore.getState().settings.gradeWeights

  const studentRows = activeStudents
    .map((s, idx) => {
      const studentGrades = grades.filter((g) => g.studentId === s.id && normalizeAcademicYear(g.academicYear) === year)
      const sem1Grade = studentGrades.find((g) => g.semester === 1)
      const sem2Grade = studentGrades.find((g) => g.semester === 2)

      const sem1Res = sem1Grade ? calculateGradeAverage(sem1Grade, gradeWeights) : { score: null }
      const sem2Res = sem2Grade ? calculateGradeAverage(sem2Grade, gradeWeights) : { score: null }
      const sem1Avg = sem1Res.score
      const sem2Avg = sem2Res.score

      // ADR-018 (import/export audit #3): GPA cả năm dùng roundToDecimal theo
      // roundingDecimal của parish — trước đây hardcode Math.round(...*10)/10
      // (1 chữ số) lệch với reportViewModelFactory khi parish cấu hình 2 chữ số.
      let yearlyAvg: number | null = null
      if (sem1Avg !== null && sem2Avg !== null) {
        yearlyAvg = roundToDecimal((sem1Avg + sem2Avg) / 2, gradeWeights.roundingDecimal)
      }

      // ADR-017 (F2): Attendance được giới hạn theo năm học — khớp
      // reportViewModelFactory & server (trước đây tính all-time làm lệch tỷ lệ).
      const attRange = useAcademicYearStore.getState().getYearRange(year)
      const studentAtt = attendance.filter(
        (a) => a.studentId === s.id && a.date >= attRange.startDate && a.date <= attRange.endDate
      )
      // ADR-018 (import/export audit #3): Dùng countAttendancePresent với
      // excusedWeight của parish — trước đây đếm AbsentExcused full 1.0 bất kể
      // parish cấu hình excusedWeight < 1 → lệch với reportViewModelFactory.
      const excusedWeight = useSettingsStore.getState().settings.attendancePolicy?.excusedWeight ?? 1.0
      const presentCount = countAttendancePresent(studentAtt, excusedWeight)
      const attRes = calculateAttendanceRate(presentCount, studentAtt.length)
      const attText = studentAtt.length > 0 ? `${attRes.rate}%` : '-'

      return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${escapeHtml(s.code)}</td>
        <td><strong>${escapeHtml(s.holyName)}</strong> ${escapeHtml(s.fullName)}</td>
        <td style="text-align: center;">${escapeHtml(s.gender)}</td>
        <td style="text-align: center;">${escapeHtml(s.dateOfBirth)}</td>
        <td style="text-align: center;">${sem1Avg !== null ? sem1Avg.toFixed(1) : '-'}</td>
        <td style="text-align: center;">${sem2Avg !== null ? sem2Avg.toFixed(1) : '-'}</td>
        <td style="text-align: center; font-weight: bold; color: #1E3A8A;">${yearlyAvg !== null ? yearlyAvg.toFixed(1) : '-'}</td>
        <td style="text-align: center;">${attText}</td>
        <td style="font-size: 11px;">${escapeHtml(s.parentPhone)}</td>
      </tr>
    `
    })
    .join('')

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Sổ Điểm Lớp ${escapeHtml(classId)}</title>
      <style>
        @page { size: A4 landscape; margin: 15mm; }
        body { font-family: Arial, sans-serif; color: #1E293B; margin: 0; padding: 20px; font-size: 12px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1E3A8A; padding-bottom: 10px; margin-bottom: 20px; }
        .header h1 { font-size: 18px; color: #1E3A8A; margin: 0; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #CBD5E1; padding: 6px 8px; font-size: 11px; }
        th { background-color: #F1F5F9; color: #1E3A8A; text-transform: uppercase; font-size: 10px; }
        ${buildWatermarkBlock(resolveParishName(options))}
      </style>
    </head>
    <body>
      <div class="header" style="gap:14px;">
        <div style="display:flex;align-items:center;gap:14px;">
          ${parishLogoImgHtml(52)}
          <div>
            <div style="font-size:11px;font-weight:700;color:#1E3A8A;text-transform:uppercase;">${escapeHtml(resolveParishName(options))}</div>
            <h1 style="margin:2px 0 0;">SỔ ĐIỂM GIÁO LÝ</h1>
          </div>
        </div>
        <div style="font-size:11px;color:#64748B;">Năm học: <strong style="color:#1E3A8A;">${escapeHtml(normalizeAcademicYear(options?.academicYear || getCurrentAcademicYear()))}</strong></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã TN</th>
            <th>Họ và Tên Thiếu Nhi</th>
            <th>Phái</th>
            <th>Ngày Sinh</th>
            <th>ĐTB HK1</th>
            <th>ĐTB HK2</th>
            <th>ĐTB Cả Năm</th>
            <th>Chuyên Cần</th>
            <th>SĐT Phụ Huynh</th>
          </tr>
        </thead>
        <tbody>
          ${studentRows}
        </tbody>
      </table>
    </body>
    </html>
  `
}

/**
 * Backward-Compatible Pure Utility: Sacrament Certificate HTML
 */
export function generateSacramentCertificateHTML(student: Student, options?: ReportOptions): string {
  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Giấy Chứng Nhận Bí Tích - ${escapeHtml(student.holyName)} ${escapeHtml(student.fullName)}</title>
      <style>
        @page { size: A4 landscape; margin: 15mm; }
        body { font-family: 'Times New Roman', serif; color: #1E293B; margin: 0; padding: 40px; text-align: center; border: 10px double #1E3A8A; }
        h1 { color: #1E3A8A; font-size: 26px; text-transform: uppercase; }
        ${buildWatermarkBlock(resolveParishName(options))}
      </style>
    </head>
    <body>
      <div style="display:flex;justify-content:center;margin-bottom:14px;">${parishLogoImgHtml(72)}</div>
      <div style="font-size:11px;font-weight:700;color:#1E3A8A;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(resolveParishName(options))} — ${escapeHtml(options?.dioceseName || 'Giáo Phận Xuân Lộc')}</div>
      <h1>GIẤY CHỨNG NHẬN BÍ TÍCH</h1>
      <p>${escapeHtml(student.holyName)} ${escapeHtml(student.fullName)}</p>
    </body>
    </html>
  `
}

/**
 * Backward-Compatible Browser Print Helper (delegates to ReportExportService)
 */
export function printHTMLReport(htmlContent: string) {
  ReportExportService.print(htmlContent)
}

export const PARENT_INVITATION_STYLES = `
  @page { size: A4 portrait; margin: 15mm; }
  body { font-family: 'Times New Roman', 'Arial', serif; color: #1E293B; margin: 0; padding: 24px; font-size: 13px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .invite { border: 2px solid #1E3A8A; border-radius: 8px; padding: 28px 32px; background: #FFFFFF; }
  .parish-header { display: flex; align-items: center; gap: 12px; justify-content: center; margin-bottom: 12px; }
  .parish-header.with-logo { gap: 14px; }
  .parish-header .parish-logo { width: 52px; height: 52px; object-fit: contain; flex-shrink: 0; }
  .parish-header-text { text-align: center; }
  .diocese-line { font-size: 12px; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
  .parish-name { font-size: 18px; font-weight: 800; color: #1E3A8A; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  .invite-title { text-align: center; font-size: 22px; font-weight: 800; color: #0F172A; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .invite-subtitle { text-align: center; font-size: 14px; color: #334155; font-style: italic; margin-bottom: 22px; }
  .body-text { text-align: justify; line-height: 1.8; margin-bottom: 16px; font-size: 14px; }
  .info-block { border: 1px solid #CBD5E1; border-radius: 8px; padding: 14px 18px; margin: 18px 0; background: #F8FAFC; font-size: 13.5px; }
  .info-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px stroke #F1F5F9; }
  .info-label { color: #64748B; font-weight: 500; }
  .info-value { font-weight: 700; color: #0F172A; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; margin-top: 36px; text-align: center; font-size: 13px; }
  .sig-box { font-weight: 700; color: #0F172A; margin-bottom: 60px; }
  .sig-role { color: #64748B; font-weight: 500; }
  .page-break { page-break-after: always; break-after: page; page-break-inside: avoid; }
  [WATERMARK]
`

function resolveClassName(student: Student): string {
  try {
    return useClassStore.getState().findClassById(student.classId)?.name || student.classId
  } catch {
    return student.classId
  }
}

/**
 * Generate a single Parent Invitation slip (Phiếu Mời Phụ Huynh, A5)
 * — mời họp phụ huynh cuối năm / sinh hoạt, kèm thông tin thiếu nhi.
 */
export function generateParentInvitationHTML(student: Student, options?: ReportOptions): string {
  if (!student) return ''
  const academicYear = options?.academicYear || normalizeAcademicYear(useAcademicYearStore.getState().currentYear) || getCurrentAcademicYear()
  const className = resolveClassName(student)
  const parents = student.parentName ? escapeHtml(student.parentName) : 'Quý Phụ Huynh'
  const studentName = escapeHtml(student.holyName ? `${student.holyName} ${student.fullName}` : student.fullName)

  const parishHeader = options?.parishName || useSettingsStore.getState().settings.parishName || 'Giáo Xứ Gia Tôn'
  const dioceseName = options?.dioceseName || useSettingsStore.getState().settings.dioceseName || 'Giáo Phận Xuân Lộc'

  const title = options?.title && options.title.trim() ? escapeHtml(options.title) : 'Phiếu Mời Phụ Huynh'
  const meetingTime = options?.meetingTime && options.meetingTime.trim() ? escapeHtml(options.meetingTime) : '...... giờ ......, ngày .... / .... / ..........'
  const meetingLocation = options?.meetingLocation && options.meetingLocation.trim() ? escapeHtml(options.meetingLocation) : '.................................................'
  const meetingReasonHtml = options?.meetingReason && options.meetingReason.trim()
    ? escapeHtml(options.meetingReason)
    : 'buổi <strong>họp phụ huynh</strong> của chi đoàn giáo lý để cùng trao đổi về tình hình học tập và sinh hoạt của thiếu nhi'

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>${title} - ${escapeHtml(student.fullName)}</title>
      <style>
        ${PARENT_INVITATION_STYLES.replace('[WATERMARK]', buildWatermarkBlock(parishHeader))}
      </style>
    </head>
    <body>
      <div class="invite">
        <div class="parish-header with-logo">
          ${parishLogoImgHtml(52)}
          <div class="parish-header-text">
            <div class="diocese-line">${escapeHtml(dioceseName)}</div>
            <div class="parish-name">${escapeHtml(parishHeader)}</div>
          </div>
        </div>

        <div class="invite-title">${title}</div>
        <div class="invite-subtitle">Năm học ${escapeHtml(academicYear)}</div>

        <div class="body-text">
          Kính gửi: <strong>${parents}</strong>,
          <br />Ban Giáo Lý xin trân trọng mời quý phụ huynh đến tham dự ${meetingReasonHtml}.
        </div>

        <div class="info-block">
          <div class="info-row"><span class="info-label">Thời gian:</span><span class="info-value">${meetingTime}</span></div>
          <div class="info-row"><span class="info-label">Địa điểm:</span><span class="info-value">${meetingLocation}</span></div>
          <div class="info-row"><span class="info-label">Thiếu nhi:</span><span class="info-value">${studentName}</span></div>
          <div class="info-row"><span class="info-label">Lớp:</span><span class="info-value">${escapeHtml(className)}</span></div>
          ${student.parentPhone ? `<div class="info-row"><span class="info-label">SĐT phụ huynh:</span><span class="info-value">${escapeHtml(student.parentPhone)}</span></div>` : ''}
          <div class="info-row"><span class="info-label">Mã thiếu nhi:</span><span class="info-value">${escapeHtml(student.code)}</span></div>
        </div>

        <div class="body-text">
          Sự hiện diện của quý phụ huynh là nguồn động viên quý báu cho thiếu nhi trong việc học giáo lý và sinh hoạt tại giáo xứ.
          <br />Trân trọng cảm ơn.
        </div>

        <div class="signatures">
          <div>
            <div class="sig-box">............................</div>
            <div class="sig-role">Giáo Lý Viên</div>
          </div>
          <div>
            <div class="sig-box">............................</div>
            <div class="sig-role">Tuyên Úy / Quản Xứ</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `
}

/**
 * Generate Batch Parent Invitation slips HTML (mỗi thiếu nhi một phiếu A5)
 */
export function generateBatchParentInvitationsHTML(students: Student[], options?: ReportOptions): string {
  if (!students || students.length === 0) {
    return `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <title>Phiếu Mời Phụ Huynh Hàng Loạt</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        </style>
      </head>
      <body>
        <h2>Không có thiếu nhi nào để in phiếu mời.</h2>
      </body>
      </html>
    `
  }

  const fragments = students.map((student, idx) => {
    const slipHtml = generateParentInvitationHTML(student, options)
    const pageBreak = idx < students.length - 1 ? '<div class="page-break"></div>' : ''
    return `${slipHtml}${pageBreak}`
  })

  const academicYear = options?.academicYear || normalizeAcademicYear(useAcademicYearStore.getState().currentYear) || getCurrentAcademicYear()

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Phiếu Mời Phụ Huynh Hàng Loạt - ${escapeHtml(academicYear)}</title>
      <style>
        ${PARENT_INVITATION_STYLES.replace('[WATERMARK]', '')}
      </style>
    </head>
    <body>
      ${fragments.join('')}
    </body>
    </html>
  `
}

/**
 * Generate single Photo Card HTML
 */
export function generatePhotoCardHTML(student: Student, options?: ReportOptions): string {
  const classInfo = useClassStore.getState().findClassById(student.classId)
  const branch = BRANCHES[student.branch]
  const sacStatus = getSacramentStatus(student)
  const age = getAge(student.dateOfBirth)
  const _academicYearDisplay = options?.academicYear || useAcademicYearStore.getState().currentYear

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Thẻ Thiếu Nhi - ${escapeHtml(student.holyName)} ${escapeHtml(student.fullName)}</title>
      <style>
        @page { size: A6 portrait; margin: 5mm; }
        body { font-family: Arial, sans-serif; color: #1E293B; margin: 0; padding: 10px; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .card { border: 2px solid #1E3A8A; border-radius: 12px; padding: 15px; max-width: 150px; margin: 0 auto; background: white; }
        .header { display: flex; align-items: center; gap: 8px; justify-content: center; margin-bottom: 10px; }
        .header .parish-logo { width: 36px; height: 36px; object-fit: contain; flex-shrink: 0; }
        .header-text { text-align: center; }
        .header-title { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #64748B; }
        .header-name { font-size: 14px; font-weight: 800; color: #1E3A8A; }
        .avatar { width: 60px; height: 60px; border-radius: 50%; background: #EFF6FF; border: 2px solid #1E3A8A; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px; font-size: 24px; font-weight: 800; color: #1E3A8A; }
        .info { text-align: center; margin-bottom: 8px; }
        .info-name { font-size: 12px; font-weight: 800; color: #0F172A; }
        .info-name .holy { color: #D97706; }
        .info-code { font-size: 9px; color: #64748B; }
        .details { font-size: 9px; border-top: 1px solid #E2E8F0; padding-top: 8px; }
        .detail-row { display: flex; justify-content: space-between; margin: 3px 0; }
        .detail-label { color: #64748B; }
        .detail-value { font-weight: 600; }
        .sacraments { font-size: 8px; border-top: 1px solid #E2E8F0; padding-top: 6px; margin-top: 6px; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; font-size: 8px; color: #64748B; margin-top: 10px; padding-top: 8px; border-top: 1px solid #E2E8F0; }
        .sig-box { font-weight: 600; color: #0F172A; margin-bottom: 15px; }
        .page-break { page-break-after: always; break-after: page; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          ${parishLogoImgHtml(36)}
          <div class="header-text">
            <div class="header-title">${escapeHtml(resolveParishName(options))}</div>
            <div class="header-name">Thiếu Nhi Thánh Thể</div>
          </div>
        </div>

        <div class="avatar">${student.holyName.charAt(0)}</div>
        <div class="info">
          <div class="info-name"><span class="holy">${student.holyName}</span> ${student.fullName}</div>
          <div class="info-code">Mã số: ${student.code}</div>
        </div>

        <div class="details">
          <div class="detail-row"><span class="detail-label">Ngành</span><span class="detail-value" style="color: ${branch?.textColor}">${branch?.name}</span></div>
          <div class="detail-row"><span class="detail-label">Lớp</span><span class="detail-value" style="color: #1E3A8A">${classInfo?.name}</span></div>
          <div class="detail-row"><span class="detail-label">Tuổi</span><span class="detail-value">${age}</span></div>
          <div class="detail-row"><span class="detail-label">Phụ huynh</span><span class="detail-value">${student.parentName}</span></div>
          <div class="detail-row"><span class="detail-label">SĐT</span><span class="detail-value">${student.parentPhone}</span></div>
        </div>

        <div class="sacraments">
          <div class="text-xs font-bold text-text-muted mb-1">Hành Trình Bí Tích</div>
          ${sacStatus.baptism.done ? `<div>✅ Rửa Tội: ${sacStatus.baptism.date}</div>` : ''}
          ${sacStatus.firstCommunion.done ? `<div>✅ Rước Lễ LĐ: ${sacStatus.firstCommunion.date}</div>` : ''}
          ${sacStatus.confirmation.done ? `<div>✅ Thêm Sức: ${sacStatus.confirmation.date}</div>` : ''}
        </div>

        <div class="signatures">
          <div>
            <div class="sig-box">Phụ Huynh</div>
            <div>(Ký, ghi rõ họ tên)</div>
          </div>
          <div>
            <div class="sig-box">Huynh Trưởng CN</div>
            <div>${classInfo?.catechistLeader || ''}</div>
          </div>
          <div>
            <div class="sig-box">Trưởng Ban GL</div>
            <div>Linh mục Tuyên Úy</div>
          </div>
        </div>

        <div style="text-align: center; margin-top: 8px; font-size: 8px; color: #64748B;">
          Niên học ${escapeHtml(_academicYearDisplay)}
        </div>
      </div>
    </body>
    </html>
  `
}

/**
 * Generate Batch Photo Cards HTML
 */
export function generateBatchPhotoCardsHTML(students: Student[], options?: ReportOptions): string {
  if (!students || students.length === 0) {
    return `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <title>Thẻ Thiếu Nhi Hàng Loạt</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        </style>
      </head>
      <body>
        <h2>Không có thiếu nhi nào để in thẻ.</h2>
      </body>
      </html>
    `
  }

  const cardFragments = students.map((student, idx) => {
    const cardHtml = generatePhotoCardHTML(student, options)
    const pageBreak = idx < students.length - 1 ? '<div class="page-break"></div>' : ''
    return `${cardHtml}${pageBreak}`
  })

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Thẻ Thiếu Nhi Hàng Loạt - ${escapeHtml(options?.academicYear || useAcademicYearStore.getState().currentYear)}</title>
      <style>
        @page { size: A6 portrait; margin: 5mm; }
        body { font-family: Arial, sans-serif; color: #1E293B; margin: 0; padding: 0; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .card { border: 2px solid #1E3A8A; border-radius: 12px; padding: 15px; max-width: 150px; margin: 0 auto; background: white; }
        .header { display: flex; align-items: center; gap: 8px; justify-content: center; margin-bottom: 10px; }
        .header .parish-logo { width: 36px; height: 36px; object-fit: contain; flex-shrink: 0; }
        .header-text { text-align: center; }
        .header-title { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #64748B; }
        .header-name { font-size: 14px; font-weight: 800; color: #1E3A8A; }
        .avatar { width: 60px; height: 60px; border-radius: 50%; background: #EFF6FF; border: 2px solid #1E3A8A; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px; font-size: 24px; font-weight: 800; color: #1E3A8A; }
        .info { text-align: center; margin-bottom: 8px; }
        .info-name { font-size: 12px; font-weight: 800; color: #0F172A; }
        .info-name .holy { color: #D97706; }
        .info-code { font-size: 9px; color: #64748B; }
        .details { font-size: 9px; border-top: 1px solid #E2E8F0; padding-top: 8px; }
        .detail-row { display: flex; justify-content: space-between; margin: 3px 0; }
        .detail-label { color: #64748B; }
        .detail-value { font-weight: 600; }
        .sacraments { font-size: 8px; border-top: 1px solid #E2E8F0; padding-top: 6px; margin-top: 6px; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; font-size: 8px; color: #64748B; margin-top: 10px; padding-top: 8px; border-top: 1px solid #E2E8F0; }
        .sig-box { font-weight: 600; color: #0F172A; margin-bottom: 15px; }
        .page-break { page-break-after: always; break-after: page; }
        ${buildWatermarkBlock(resolveParishName(options))}
      </style>
    </head>
    <body>
      ${cardFragments.join('')}
    </body>
    </html>
  `
}
