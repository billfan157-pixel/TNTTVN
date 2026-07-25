import type { Student, GradeRecord } from '../types'
import { calculateGradeAverage, type GradeInput } from './grades'

export interface ExportGradebookOptions {
  students: Student[]
  matrixData: Record<string, Partial<GradeRecord>>
  className?: string
  semester: number
  academicYear?: string
}

/**
 * Generates and triggers a browser download for the Gradebook Excel spreadsheet (.xls / HTML format).
 * Includes parish header, styled table headers, score columns, calculated average and ranking.
 */
export function exportGradebookToExcel({
  students,
  matrixData,
  className = 'Tất cả các lớp',
  semester,
  academicYear = '2025 - 2026',
}: ExportGradebookOptions) {
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
    const avgResult = calculateGradeAverage(gradeInput)

    return {
      stt: index + 1,
      code: student.code || '',
      holyName: student.holyName || '',
      fullName: student.fullName || '',
      gender: student.gender || '',
      dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString('vi-VN') : '',
      scoreOral: rec.scoreOral !== null && rec.scoreOral !== undefined ? rec.scoreOral : '',
      score15m: rec.score15m !== null && rec.score15m !== undefined ? rec.score15m : '',
      score1Period: rec.score1Period !== null && rec.score1Period !== undefined ? rec.score1Period : '',
      scoreMidterm: rec.scoreMidterm !== null && rec.scoreMidterm !== undefined ? rec.scoreMidterm : '',
      scoreFinal: rec.scoreFinal !== null && rec.scoreFinal !== undefined ? rec.scoreFinal : '',
      scoreDaoDuc: rec.scoreDaoDuc !== null && rec.scoreDaoDuc !== undefined ? rec.scoreDaoDuc : '',
      avg: avgResult.score !== null ? avgResult.score.toFixed(1) : '',
      rank: avgResult.label || '',
      comments: rec.comments || '',
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
      <td colspan="15" class="header-title">GIÁO PHẬN • GIÁO XỨ GIA TÔN</td>
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

/**
 * Converts gradebook data to CSV format with UTF-8 BOM for universal spreadsheet compatibility.
 */
export function exportGradebookToCSV({
  students,
  matrixData,
  className = 'TatCa',
  semester,
  academicYear = '2025-2026',
}: ExportGradebookOptions) {
  const headers = [
    'STT',
    'Mã Thiếu Nhi',
    'Tên Thánh',
    'Họ và Tên',
    'Phái',
    'Ngày Sinh',
    'Điểm Miệng',
    'Điểm 15P',
    'Điểm 1 Tiết',
    'Điểm Giữa Kỳ',
    'Điểm Cuối Kỳ',
    'Điểm Đạo Đức',
    'Điểm Trung Bình',
    'Xếp Loại',
    'Ghi Chú',
  ]

  const csvRows = students.map((student, index) => {
    const rec = (matrixData[student.id] || {}) as Record<string, any>
    const gradeInput: GradeInput = {
      scoreOral: rec.scoreOral ?? null,
      score15m: rec.score15m ?? null,
      score1Period: rec.score1Period ?? null,
      scoreMidterm: rec.scoreMidterm ?? null,
      scoreFinal: rec.scoreFinal ?? null,
    }
    const avgResult = calculateGradeAverage(gradeInput)

    return [
      index + 1,
      `"${student.code || ''}"`,
      `"${student.holyName || ''}"`,
      `"${student.fullName || ''}"`,
      `"${student.gender || ''}"`,
      `"${student.dateOfBirth || ''}"`,
      rec.scoreOral !== null && rec.scoreOral !== undefined ? rec.scoreOral : '',
      rec.score15m !== null && rec.score15m !== undefined ? rec.score15m : '',
      rec.score1Period !== null && rec.score1Period !== undefined ? rec.score1Period : '',
      rec.scoreMidterm !== null && rec.scoreMidterm !== undefined ? rec.scoreMidterm : '',
      rec.scoreFinal !== null && rec.scoreFinal !== undefined ? rec.scoreFinal : '',
      rec.scoreDaoDuc !== null && rec.scoreDaoDuc !== undefined ? rec.scoreDaoDuc : '',
      avgResult.score !== null ? avgResult.score.toFixed(1) : '',
      `"${avgResult.label || ''}"`,
      `"${rec.comments || ''}"`,
    ].join(',')
  })

  const csvContent = '\uFEFF' + [headers.join(','), ...csvRows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const safeClassName = className.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filename = `BangDiem_${safeClassName}_HK${semester}.csv`

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
