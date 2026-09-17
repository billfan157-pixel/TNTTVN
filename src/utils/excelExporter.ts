import type { Student, GradeRecord } from '../types'
import { calculateGradeAverage, escapeHtml, type GradeInput, type GradeWeightsConfig } from './grades'
import { normalizeAcademicYear, getCurrentAcademicYear } from './academicYear'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { useSettingsStore } from '../stores/settingsStore'
import { PARISH_LOGO_DATA_URI } from './parishLogo'

export interface ExportGradebookOptions {
  students: Student[]
  matrixData: Record<string, Partial<GradeRecord>>
  className?: string
  semester: number
  academicYear?: string
  authoritativeResults?: Record<string, { gpa: number | null; classification: string | null }>
}

/**
 * Generates and triggers a browser download for the Gradebook Excel spreadsheet (.xls / HTML format).
 * Includes parish header, styled table headers, score columns, calculated average and ranking.
 */
/** ADR-016: Format a score cell for Excel export — never emit NaN/null/undefined. */
function formatScoreCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const num = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(num)) return ''
  return String(num)
}

export function exportGradebookToExcel({
  students,
  matrixData,
  className = 'Tất cả các lớp',
  semester,
  academicYear: academicYearProp,
  authoritativeResults,
}: ExportGradebookOptions) {
  // ADR-017 (F4): Năm học chuẩn hóa 'YYYY-YYYY' — trước đây '' (chưa chọn năm)
  // hoặc 'YYYY - YYYY' làm tên file/header sai hoặc rỗng.
  const academicYear = normalizeAcademicYear(academicYearProp || useAcademicYearStore.getState().currentYear) || getCurrentAcademicYear()
  // ADR-017 (F3): Trọng số từ settings giáo xứ — khớp DesktopGradeMatrix & báo cáo.
  const gradeWeights: GradeWeightsConfig = useSettingsStore.getState().settings.gradeWeights
  // P0 (2026-08-14): Tên giáo phận/giáo xứ từ settings — trước đây hardcode 'GIÁO XỨ GIA TÔN'.
  const settings = useSettingsStore.getState().settings
  const parishName = settings.parishName || 'Giáo Xứ Gia Tôn'
  const dioceseName = settings.dioceseName || 'Giáo Phận Xuân Lộc'
  const semesterText = semester === 1 ? 'Học Kỳ I' : 'Học Kỳ II'
  const dateStr = new Date().toLocaleDateString('vi-VN')

  // Build rows data
  const rows = students.map((student, index) => {
    const rec = (matrixData[student.id] || {}) as Record<string, any>
    const gradeInput: GradeInput = {
      scoreOral: rec.scoreOral ?? null,
      score15m: rec.score15m ?? null,
      score1Period: rec.score1Period ?? null,
      scoreMidterm: rec.scoreMidterm ?? null,
      scoreFinal: rec.scoreFinal ?? null,
    }
    const calculated = calculateGradeAverage(gradeInput, gradeWeights)
    const authoritative = authoritativeResults?.[student.id]
    const avgResult = authoritative
      ? { score: authoritative.gpa, label: authoritative.classification || '' }
      : calculated

    return {
      stt: index + 1,
      code: student.code || '',
      holyName: escapeHtml(student.holyName || ''),
      fullName: escapeHtml(student.fullName || ''),
      gender: student.gender || '',
      dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString('vi-VN') : '',
      scoreOral: formatScoreCell(rec.scoreOral),
      score15m: formatScoreCell(rec.score15m),
      score1Period: formatScoreCell(rec.score1Period),
      scoreMidterm: formatScoreCell(rec.scoreMidterm),
      scoreFinal: formatScoreCell(rec.scoreFinal),
      scoreDaoDuc: formatScoreCell(rec.scoreDaoDuc),
      avg: avgResult.score !== null ? avgResult.score.toFixed(1) : '',
      rank: avgResult.label || '',
      comments: escapeHtml(rec.comments || ''),
    }
  })

  // Build Excel-compatible HTML Spreadsheet
  const htmlContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>Bảng Điểm ${className}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    .header-title { font-size: 16pt; font-weight: bold; color: #1E3A8A; text-align: center; }
    .header-sub { font-size: 11pt; color: #475569; text-align: center; font-style: italic; }
    .table-header { background-color: #1E3A8A; color: #FFFFFF; font-weight: bold; font-size: 10pt; text-align: center; vertical-align: middle; border: 0.5pt solid #94A3B8; }
    .cell-center { text-align: center; vertical-align: middle; border: 0.5pt solid #CBD5E1; }
    .cell-left { text-align: left; vertical-align: middle; border: 0.5pt solid #CBD5E1; }
    .cell-num { text-align: right; vertical-align: middle; border: 0.5pt solid #CBD5E1; }
    .cell-bold { font-weight: bold; background-color: #F1F5F9; border: 0.5pt solid #CBD5E1; text-align: center; }
    .row-even { background-color: #F8FAFC; }
  </style>
</head>
<body>
  <table>
    <tr>
      <td colspan="15" style="text-align:center;padding:6px 0 2px;"><img src="${PARISH_LOGO_DATA_URI}" width="64" height="64" style="width:64px;height:64px;object-fit:contain;" alt="Logo" /></td>
    </tr>
    <tr>
      <td colspan="15" class="header-title">${escapeHtml(dioceseName.toUpperCase())} • ${escapeHtml(parishName.toUpperCase())}</td>
    </tr>
    <tr>
      <td colspan="15" class="header-title">BẢNG ĐIỂM HỌC TẬP GIÁO LÝ — ${semesterText.toUpperCase()}</td>
    </tr>
    <tr>
      <td colspan="15" class="header-sub">Lớp: ${className} | Năm Học: ${academicYear} | Ngày Xuất: ${dateStr}</td>
    </tr>
    <tr><td colspan="15"></td></tr>
    <thead>
      <tr>
        <th class="table-header" style="width: 45px;">STT</th>
        <th class="table-header" style="width: 90px;">Mã TN</th>
        <th class="table-header" style="width: 110px;">Tên Thánh</th>
        <th class="table-header" style="width: 170px;">Họ và Tên</th>
        <th class="table-header" style="width: 50px;">Phái</th>
        <th class="table-header" style="width: 95px;">Ngày Sinh</th>
        <th class="table-header" style="width: 60px;">Miệng</th>
        <th class="table-header" style="width: 60px;">15 Phút</th>
        <th class="table-header" style="width: 60px;">1 Tiết</th>
        <th class="table-header" style="width: 60px;">Giữa Kỳ</th>
        <th class="table-header" style="width: 60px;">Cuối Kỳ</th>
        <th class="table-header" style="width: 65px;">Đạo Đức</th>
        <th class="table-header" style="width: 70px;">ĐTB</th>
        <th class="table-header" style="width: 95px;">Xếp Loại</th>
        <th class="table-header" style="width: 150px;">Ghi Chú</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r, idx) => `
      <tr class="${idx % 2 === 0 ? '' : 'row-even'}">
        <td class="cell-center">${r.stt}</td>
        <td class="cell-center">${r.code}</td>
        <td class="cell-left">${r.holyName}</td>
        <td class="cell-left" style="font-weight: 600;">${r.fullName}</td>
        <td class="cell-center">${r.gender}</td>
        <td class="cell-center">${r.dateOfBirth}</td>
        <td class="cell-center">${r.scoreOral}</td>
        <td class="cell-center">${r.score15m}</td>
        <td class="cell-center">${r.score1Period}</td>
        <td class="cell-center">${r.scoreMidterm}</td>
        <td class="cell-center">${r.scoreFinal}</td>
        <td class="cell-center">${r.scoreDaoDuc}</td>
        <td class="cell-bold">${r.avg}</td>
        <td class="cell-center" style="font-weight: 600;">${r.rank}</td>
        <td class="cell-left">${r.comments}</td>
      </tr>
      `,
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>
`

  // Create Blob & trigger browser file download
  const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const safeClassName = className.replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeSemester = semester === 1 ? 'HK1' : 'HK2'
  const filename = `BangDiem_${safeClassName}_${safeSemester}_${academicYear.replace(/\s+/g, '')}.xls`

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
