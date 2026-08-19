import * as XLSX from 'xlsx'
import type { ExamQuestion, ExamAnswerVariants, ExamVersionCode, MultipleChoiceOption } from '../types'
import { escapeHtml } from './grades'
import { useSettingsStore } from '../stores/settingsStore'
import { useToastStore } from '../stores/toastStore'
import { EXAM_VERSION_CODES, normalizeAnswerVariants } from '../lib/examVariants'

export interface ExamExportOptions {
  subject: string
  classLabel?: string
  academicYear?: string
  semester?: number | string
  durationMinutes?: number
  maxScore?: number
  questions?: ExamQuestion[]
  questionCount?: number
  answerKey?: Record<number, MultipleChoiceOption>
  answerVariants?: Partial<ExamAnswerVariants>
  selectedVersion?: ExamVersionCode | 'ALL'
  includeAnswerKey?: boolean
  includeExplanations?: boolean
  includeStudentInfo?: boolean
  includeQuickAnswerGrid?: boolean
  layoutColumns?: 1 | 2
  parishName?: string
  dioceseName?: string
  scoreTypeLabel?: string
}

/**
 * Trả về danh sách câu hỏi hợp lệ (nếu rỗng nhưng có questionCount thì tạo fallback câu hỏi theo số câu).
 */
export function resolveExportQuestions(options: ExamExportOptions): ExamQuestion[] {
  if (options.questions && options.questions.length > 0) {
    return options.questions
  }
  const count = options.questionCount || (options.answerKey ? Object.keys(options.answerKey).length : 0) || 10
  const fallback: ExamQuestion[] = []
  for (let i = 1; i <= count; i++) {
    fallback.push({
      index: i,
      question: `Câu ${i}: (Nội dung câu hỏi ${i})`,
      options: {
        A: 'Lựa chọn A',
        B: 'Lựa chọn B',
        C: 'Lựa chọn C',
        D: 'Lựa chọn D',
      },
      correctOption: options.answerKey?.[i] || 'A',
    })
  }
  return fallback
}

/**
 * Lấy tên Giáo Phận & Giáo Xứ an toàn từ options hoặc settingsStore.
 */
function resolveParishHeaders(options: ExamExportOptions) {
  const settings = useSettingsStore.getState().settings
  const parishName = options.parishName || settings.parishName || 'Giáo Xứ'
  const dioceseName = options.dioceseName || settings.dioceseName || 'Giáo Phận'
  return { parishName, dioceseName }
}

import { buildExamQrPayload, generateExamQrDataUrl } from '../lib/qr'
import { integratedGridCols } from '../lib/answerSheetTemplate'
import { ReportExportService } from '../services/reportExportService'

/**
 * Xây dựng hàng ma trận ô tròn đáp án trắc nghiệm OMR tương thích hoàn toàn Microsoft Word.
 */
function buildWordOmrBubbleGrid(questions: ExamQuestion[], showAnswerKey: boolean, gridCols: number): string {
  const rows: string[] = []
  const rowCount = Math.ceil(questions.length / gridCols)

  for (let r = 0; r < rowCount; r++) {
    const cells: string[] = []
    for (let c = 0; c < gridCols; c++) {
      const qIdx = r * gridCols + c
      if (qIdx < questions.length) {
        const q = questions[qIdx]
        const correct = q.correctOption || 'A'
        const isA = showAnswerKey && correct === 'A'
        const isB = showAnswerKey && correct === 'B'
        const isC = showAnswerKey && correct === 'C'
        const isD = showAnswerKey && correct === 'D'

        const bubble = (letter: string, isCorrect: boolean) => `
          <span style="display: inline-block; width: 13px; height: 13px; line-height: 13px; border: 1pt solid #000000; border-radius: 50%; font-size: 7.5pt; font-weight: bold; text-align: center; margin: 0 1px; ${isCorrect ? 'background: #16a34a; color: #ffffff;' : 'background: #ffffff; color: #000000;'}">${letter}</span>
        `

        cells.push(`
          <td style="padding: 1.5pt 2.5pt; vertical-align: middle; white-space: nowrap; border: none; font-size: 8pt; text-align: left;">
            <strong style="font-size: 8.5pt;">C${q.index}:</strong>
            ${bubble('A', isA)}${bubble('B', isB)}${bubble('C', isC)}${bubble('D', isD)}
          </td>
        `)
      } else {
        cells.push(`<td style="border: none;">&nbsp;</td>`)
      }
    }
    rows.push(`<tr>${cells.join('')}</tr>`)
  }

  return rows.join('')
}

/**
 * Bố cục câu hỏi đề thi dạng 2 cột (hoặc 1 cột) bằng cấu trúc Table tương thích Microsoft Word.
 */
function buildWordQuestionsLayout(questions: ExamQuestion[], layoutColumns: 1 | 2): string {
  const renderQ = (q: ExamQuestion) => `
    <div style="margin-bottom: 5pt; page-break-inside: avoid;">
      <div style="font-size: 10pt; line-height: 1.25;">
        <strong>Câu ${q.index}:</strong> ${escapeHtml(q.question)}
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 1.5pt; font-size: 9.5pt;">
        <tr>
          <td style="width: 50%; padding: 1pt 2pt; vertical-align: top;">
            <strong>A.</strong> ${escapeHtml(q.options?.A || '')}
          </td>
          <td style="width: 50%; padding: 1pt 2pt; vertical-align: top;">
            <strong>B.</strong> ${escapeHtml(q.options?.B || '')}
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 1pt 2pt; vertical-align: top;">
            <strong>C.</strong> ${escapeHtml(q.options?.C || '')}
          </td>
          <td style="width: 50%; padding: 1pt 2pt; vertical-align: top;">
            <strong>D.</strong> ${escapeHtml(q.options?.D || '')}
          </td>
        </tr>
      </table>
    </div>
  `

  if (layoutColumns === 1) {
    return questions.map(renderQ).join('')
  }

  const mid = Math.ceil(questions.length / 2)
  const col1 = questions.slice(0, mid)
  const col2 = questions.slice(mid)

  return `
    <table style="width: 100%; border-collapse: collapse; margin-top: 4pt;">
      <tr>
        <td style="width: 50%; vertical-align: top; padding-right: 6pt;">
          ${col1.map(renderQ).join('')}
        </td>
        <td style="width: 50%; vertical-align: top; padding-left: 6pt;">
          ${col2.map(renderQ).join('')}
        </td>
      </tr>
    </table>
  `
}

/**
 * Bảng đáp án chuẩn 10 cột dành cho Giáo Lý Viên bằng cấu trúc Table.
 */
function buildWordAnswerKeyTable(questions: ExamQuestion[]): string {
  const chunkSize = 10
  const tables: string[] = []

  for (let i = 0; i < questions.length; i += chunkSize) {
    const chunk = questions.slice(i, i + chunkSize)
    const headerCells = chunk.map(q => `<th style="border: 1pt solid #1e3a8a; padding: 2pt; background: #dbeafe; font-size: 8.5pt;">C${q.index}</th>`).join('')
    const ansCells = chunk.map(q => `<td style="border: 1pt solid #1e3a8a; padding: 2pt; font-weight: bold; color: #b91c1c; font-size: 9.5pt; height: 16pt;">${q.correctOption || 'A'}</td>`).join('')
    
    const emptyCount = chunkSize - chunk.length
    const emptyHeaders = emptyCount > 0 ? `<th colspan="${emptyCount}" style="border: 1pt solid #1e3a8a; background: #dbeafe;">&nbsp;</th>` : ''
    const emptyAns = emptyCount > 0 ? `<td colspan="${emptyCount}" style="border: 1pt solid #1e3a8a;">&nbsp;</td>` : ''

    tables.push(`
      <table style="width: 100%; border-collapse: collapse; text-align: center; margin-bottom: 2pt;">
        <tr>
          <th style="width: 60pt; border: 1pt solid #1e3a8a; background: #1e3a8a; color: #ffffff; font-size: 8.5pt;">Câu số</th>
          ${headerCells}${emptyHeaders}
        </tr>
        <tr>
          <th style="width: 60pt; border: 1pt solid #1e3a8a; background: #eff6ff; font-size: 8.5pt;">Đáp án</th>
          ${ansCells}${emptyAns}
        </tr>
      </table>
    `)
  }

  return tables.join('')
}

/**
 * Tạo nội dung HTML tương thích hoàn toàn với Microsoft Word (.doc format),
 * đảm bảo layout và các thành phần (Header, QR Code quét tự động, Khung thông tin học sinh,
 * Khung chấm điểm GLV, Khung 4 Marker OMR Homography, Ô tròn trắc nghiệm, và Bảng đáp án)
 * khớp 100% với bản đề thi dùng để quét chấm điểm trên app.
 */
export function generateExamWordHtml(options: ExamExportOptions): string {
  const { parishName, dioceseName } = resolveParishHeaders(options)
  const questions = resolveExportQuestions(options)
  const subject = options.subject || 'BÀI KIỂM TRA'
  const classLabel = options.classLabel || 'Lớp Giáo Lý'
  const academicYear = options.academicYear || ''
  const durationMinutes = options.durationMinutes || 45
  const versionCode = options.selectedVersion && options.selectedVersion !== 'ALL' ? options.selectedVersion : 'A'
  const layoutColumns = options.layoutColumns || 2
  const includeStudentInfo = options.includeStudentInfo !== false
  const includeQuickAnswerGrid = options.includeQuickAnswerGrid !== false
  const includeAnswerKey = options.includeAnswerKey !== false
  const includeExplanations = options.includeExplanations !== false
  const includeGradingBox = true

  // Đồng bộ đáp án chuẩn cho mã đề đang chọn nếu có cấu hình answerVariants
  const variants = normalizeAnswerVariants(options.answerVariants, options.answerKey, questions.length)
  const activeKey = variants[versionCode] || options.answerKey || {}
  const mappedQuestions = questions.map((q, idx) => {
    const qNum = q.index || idx + 1
    return {
      ...q,
      index: qNum,
      correctOption: activeKey[qNum] || q.correctOption || 'A',
    }
  })

  // Sinh QR code payload và Base64 Data URL (Word hỗ trợ render ảnh Base64 natively)
  const qrPayload = buildExamQrPayload('SESS-001', 'GENERIC', {
    templateMode: 'integrated',
    questionCount: Math.max(1, mappedQuestions.length),
    examVersion: versionCode,
  })
  const qrDataUrl = generateExamQrDataUrl(qrPayload, 3)

  const gridCols = integratedGridCols(mappedQuestions.length)

  return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)} (${escapeHtml(classLabel)}) - Mã đề ${escapeHtml(versionCode)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 210mm 297mm;
      margin: 8mm 8mm 8mm 8mm;
      mso-header-margin: 0pt;
      mso-footer-margin: 0pt;
      mso-paper-source: 0;
    }
    div.Section1 {
      page: Section1;
    }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 11pt;
      line-height: 1.25;
      color: #000000;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    .watermark {
      text-align: center;
      color: #f1f5f9;
      font-size: 32pt;
      font-weight: bold;
      letter-spacing: 6px;
      margin-bottom: 2pt;
    }
  </style>
</head>
<body>
<div class="Section1">

  <div class="watermark">${escapeHtml(parishName || 'TNTT')}</div>

  <!-- Header Đề Thi & Mã QR Quét Tự Động -->
  <table style="width: 100%; border-bottom: 2pt solid #000000; padding-bottom: 4pt; margin-bottom: 4pt;">
    <tr>
      <td style="width: 36%; vertical-align: top; text-align: center; font-size: 10pt; line-height: 1.2;">
        <div style="font-weight: bold; text-transform: uppercase;">${escapeHtml(dioceseName)}</div>
        <div style="font-weight: 800; color: #1e3a8a; text-transform: uppercase;">${escapeHtml(parishName)}</div>
        <div style="font-size: 9.5pt;">XỨ ĐOÀN THIẾU NHI THÁNH THỂ</div>
        <div style="margin-top: 2pt;">Lớp: <strong>${escapeHtml(classLabel)}</strong> · Mã đề: <strong>${escapeHtml(versionCode)}</strong></div>
      </td>
      <td style="width: 44%; vertical-align: top; text-align: center; line-height: 1.2;">
        <div style="font-size: 12.5pt; font-weight: 800; color: #b91c1c; text-transform: uppercase;">${escapeHtml(subject)}</div>
        <div style="font-size: 10pt; font-weight: bold;">Niên Khóa: ${escapeHtml(academicYear)}</div>
        <div style="font-size: 9.5pt; font-style: italic;">Thời gian: ${durationMinutes} phút (${mappedQuestions.length} câu)</div>
      </td>
      <td style="width: 20%; vertical-align: top; text-align: center;">
        <div style="border: 1pt solid #0f172a; padding: 1pt; display: inline-block; background: #ffffff;">
          <img src="${qrDataUrl}" width="105" height="105" style="width: 105px; height: 105px; display: block;" alt="QR" />
        </div>
        <div style="font-size: 6.5pt; font-weight: bold; color: #475569; margin-top: 1pt;">MÃ QUÉT TỰ ĐỘNG</div>
      </td>
    </tr>
  </table>

  <!-- Khung Thông Tin Học Sinh & Bảng Điểm GLV -->
  ${includeStudentInfo || includeGradingBox ? `
  <table style="width: 100%; margin-bottom: 4pt;">
    <tr>
      ${includeStudentInfo ? `
      <td style="width: 48%; vertical-align: top; border: 1pt solid #cbd5e1; padding: 3pt 6pt; font-size: 9.5pt; background: #f8fafc;" class="student-info-box">
        <div style="margin-bottom: 2pt;">
          Họ & tên: ........................................................................
        </div>
        <div style="margin-bottom: 2pt;">
          Mã TN: ................................... Lớp: <strong>${escapeHtml(classLabel)}</strong>
        </div>
        <div>
          Phòng: .............. Ngày thi: ........................
        </div>
      </td>` : ''}
      ${includeStudentInfo && includeGradingBox ? '<td style="width: 2%;"></td>' : ''}
      ${includeGradingBox ? `
      <td style="width: ${includeStudentInfo ? '50%' : '100%'}; vertical-align: top;">
        <table style="width: 100%; border: 1pt solid #000000; text-align: center; font-size: 9pt;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="border: 1pt solid #000000; padding: 2pt; font-weight: bold; width: 25%;">TRẮC NGHIỆM</th>
              <th style="border: 1pt solid #000000; padding: 2pt; font-weight: bold; width: 25%;">TỰ LUẬN</th>
              <th style="border: 1pt solid #000000; padding: 2pt; font-weight: bold; width: 25%;">TỔNG ĐIỂM</th>
              <th style="border: 1pt solid #000000; padding: 2pt; font-weight: bold; width: 25%;">LỜI PHÊ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1pt solid #000000; height: 18pt;"></td>
              <td style="border: 1pt solid #000000; height: 18pt;"></td>
              <td style="border: 1pt solid #000000; height: 18pt;"></td>
              <td style="border: 1pt solid #000000; height: 18pt;"></td>
            </tr>
          </tbody>
        </table>
      </td>` : ''}
    </tr>
  </table>` : ''}

  <!-- Khung OMR Tích Hợp (4 Marker Đen Homography + Ma Trận Bubble) -->
  ${includeQuickAnswerGrid && mappedQuestions.length > 0 ? `
  <div style="margin: 4pt 0 6pt 0;">
    <div style="font-size: 9.5pt; font-weight: bold; margin-bottom: 2pt;">
      <span style="background: #1e40af; color: #ffffff; padding: 1pt 4pt; font-size: 8pt; font-weight: 800;">OMR SCAN</span>
      BẢNG TRẢ LỜI TRẮC NGHIỆM (${mappedQuestions.length} CÂU)
      <span style="font-size: 8.5pt; font-weight: normal; font-style: italic; color: #475569;">* Tô kín 01 ô (A, B, C, D) bằng bút chì đậm hoặc bút xanh/đen:</span>
    </div>

    <table style="width: 100%; border: 1.5pt solid #0f172a; border-collapse: collapse; background: #ffffff;">
      <tr>
        <td style="width: 18px; height: 18px; background: #000000; padding: 0; margin: 0; font-size: 0; line-height: 0;" class="omr-corner-marker omr-marker-tl">&nbsp;</td>
        <td style="padding: 2pt 4pt; vertical-align: middle;" rowspan="2">
          <table style="width: 100%; border-collapse: collapse;">
            ${buildWordOmrBubbleGrid(mappedQuestions, includeAnswerKey, gridCols)}
          </table>
        </td>
        <td style="width: 18px; height: 18px; background: #000000; padding: 0; margin: 0; font-size: 0; line-height: 0;" class="omr-corner-marker omr-marker-tr">&nbsp;</td>
      </tr>
      <tr>
        <td style="width: 18px; height: 18px; background: #000000; padding: 0; margin: 0; font-size: 0; line-height: 0;" class="omr-corner-marker omr-marker-bl">&nbsp;</td>
        <td style="width: 18px; height: 18px; background: #000000; padding: 0; margin: 0; font-size: 0; line-height: 0;" class="omr-corner-marker omr-marker-br">&nbsp;</td>
      </tr>
    </table>
  </div>` : ''}

  <!-- Nội Dung Câu Hỏi Đề Thi (1 Cột hoặc 2 Cột Table) -->
  <div class="questions-wrapper">
    ${buildWordQuestionsLayout(mappedQuestions, layoutColumns)}
  </div>

  <!-- Bảng Đáp Án Chuẩn & Giải Thích Chi Tiết Cho Giáo Lý Viên -->
  ${includeAnswerKey ? `
  <div style="margin-top: 8pt; page-break-inside: avoid;">
    <div style="background: #1e3a8a; color: #ffffff; padding: 2.5pt 6pt; font-weight: bold; font-size: 9.5pt; text-align: center;">
      BẢNG ĐÁP ÁN CHUẨN DÀNH CHO GIÁO LÝ VIÊN (${mappedQuestions.length} CÂU)
    </div>
    <div style="margin-top: 2pt;">
      ${buildWordAnswerKeyTable(mappedQuestions)}
    </div>
    ${includeExplanations && mappedQuestions.some(q => Boolean(q.explanation)) ? `
    <div style="margin-top: 5pt; border-top: 1pt dashed #94a3b8; padding-top: 3pt;">
      <div style="font-weight: bold; color: #1e3a8a; font-size: 9pt; margin-bottom: 2pt;">💡 HƯỚNG DẪN GIẢI CHI TIẾT:</div>
      ${mappedQuestions.filter(q => Boolean(q.explanation)).map(q => `
        <div style="font-size: 8.5pt; margin-bottom: 2pt; line-height: 1.25;">
          <strong>Câu ${q.index} (${q.correctOption}):</strong> <em>${escapeHtml(q.explanation || '')}</em>
        </div>
      `).join('')}
    </div>` : ''}
  </div>` : ''}

</div>
</body>
</html>`
}

/**
 * Xuất đề thi ra file HTML độc lập (.html) có thể mở trên mọi trình duyệt và in chuẩn A4.
 */
export function exportExamToHtml(options: ExamExportOptions): void {
  try {
    const html = generateExamWordHtml(options)
    const filename = `De_Thi_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}_${(options.classLabel || 'Lop').replace(/\s+/g, '_')}_Ma${options.selectedVersion || 'A'}.html`
    ReportExportService.downloadHTML(html, filename)
    useToastStore.getState().addToast(`Đã xuất file HTML đề thi: ${filename}`, 'success')
  } catch (err) {
    console.error('Error exporting exam to HTML:', err)
    useToastStore.getState().addToast('Lỗi khi xuất file HTML!', 'error')
  }
}

/**
 * Xuất đề thi ra file Microsoft Word (.doc).
 */
export function exportExamToWord(options: ExamExportOptions): void {
  try {
    const html = generateExamWordHtml(options)
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = `De_Thi_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}_${(options.classLabel || 'Lop').replace(/\s+/g, '_')}_Ma${options.selectedVersion || 'A'}.doc`
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
    useToastStore.getState().addToast(`Đã xuất file Word: ${filename}`, 'success')
  } catch (err) {
    console.error('Error exporting exam to Word:', err)
    useToastStore.getState().addToast('Lỗi khi xuất file Word!', 'error')
  }
}

/**
 * Sinh Workbook Excel (.xlsx) chứa câu hỏi, bảng đáp án ma trận các mã đề, và metadata.
 */
export function generateExamExcelWorkbook(options: ExamExportOptions): Uint8Array {
  const { parishName, dioceseName } = resolveParishHeaders(options)
  const questions = resolveExportQuestions(options)
  const variants = normalizeAnswerVariants(options.answerVariants, options.answerKey, questions.length)
  const activeCodes = EXAM_VERSION_CODES.filter(code => Boolean(variants[code]))
  if (activeCodes.length === 0) activeCodes.push('A')

  const wb = XLSX.utils.book_new()

  // 1. Sheet 1: Danh sách câu hỏi chi tiết (chuẩn format để import lại được vào app)
  const questionsData = [
    ['Câu Số', 'Nội Dung Câu Hỏi', 'Lựa Chọn A', 'Lựa Chọn B', 'Lựa Chọn C', 'Lựa Chọn D', 'Đáp Án Đúng (A/B/C/D)', 'Điểm', 'Giải Thích Chi Tiết'],
    ...questions.map((q, idx) => {
      const qNum = q.index || idx + 1
      const correct = options.answerKey?.[qNum] || q.correctOption || 'A'
      return [
        qNum,
        q.question || '',
        q.options?.A || '',
        q.options?.B || '',
        q.options?.C || '',
        q.options?.D || '',
        correct,
        q.points ?? 1,
        q.explanation || '',
      ]
    }),
  ]

  const wsQuestions = XLSX.utils.aoa_to_sheet(questionsData)
  wsQuestions['!cols'] = [
    { wch: 8 },  // Câu Số
    { wch: 45 }, // Nội Dung Câu Hỏi
    { wch: 25 }, // A
    { wch: 25 }, // B
    { wch: 25 }, // C
    { wch: 25 }, // D
    { wch: 20 }, // Đáp Án Đúng
    { wch: 8 },  // Điểm
    { wch: 35 }, // Giải Thích
  ]
  XLSX.utils.book_append_sheet(wb, wsQuestions, 'Danh_Sach_Cau_Hoi')

  // 2. Sheet 2: Ma Trận Bảng Đáp Án Các Mã Đề (Mã A, B, C, D...)
  const matrixHeaders = ['Câu Số', ...activeCodes.map(c => `Mã Đề ${c}`)]
  const matrixRows: (string | number)[][] = [matrixHeaders]

  for (let i = 1; i <= questions.length; i++) {
    const row: (string | number)[] = [i]
    for (const code of activeCodes) {
      const keyForCode = variants[code] || {}
      row.push(keyForCode[i] || '-')
    }
    matrixRows.push(row)
  }

  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixRows)
  wsMatrix['!cols'] = [{ wch: 10 }, ...activeCodes.map(() => ({ wch: 14 }))]
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'Bang_Dap_An_Ma_De')

  // 3. Sheet 3: Thông Tin Chung Đề Thi (Metadata)
  const metaData = [
    ['THÔNG TIN ĐỀ THI VÀ KỲ THI', ''],
    ['Giáo Phận', dioceseName],
    ['Giáo Xứ', parishName],
    ['Môn Học / Nội Dung', options.subject || ''],
    ['Lớp Học', options.classLabel || ''],
    ['Niên Khóa', options.academicYear || ''],
    ['Học Kỳ', options.semester ? `Học Kỳ ${options.semester}` : ''],
    ['Thời Gian Làm Bài', `${options.durationMinutes || 45} phút`],
    ['Thang Điểm Tối Đa', options.maxScore ?? 10],
    ['Tổng Số Câu Hỏi', questions.length],
    ['Danh Sách Mã Đề', activeCodes.join(', ')],
    ['Ngày Xuất', new Date().toLocaleString('vi-VN')],
  ]
  const wsMeta = XLSX.utils.aoa_to_sheet(metaData)
  wsMeta['!cols'] = [{ wch: 25 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Thong_Tin_De_Thi')

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Uint8Array(out)
}

/**
 * Xuất đề thi ra file Excel (.xlsx).
 */
export function exportExamToExcel(options: ExamExportOptions): void {
  try {
    const bytes = generateExamExcelWorkbook(options)
    const blob = new Blob([bytes as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = `De_Thi_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}_${(options.classLabel || 'Lop').replace(/\s+/g, '_')}.xlsx`
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
    useToastStore.getState().addToast(`Đã xuất file Excel: ${filename}`, 'success')
  } catch (err) {
    console.error('Error exporting exam to Excel:', err)
    useToastStore.getState().addToast('Lỗi khi xuất file Excel!', 'error')
  }
}

/**
 * Xuất đề thi dạng văn bản thuần Text (.txt).
 */
export function exportExamToText(options: ExamExportOptions): string {
  const { parishName, dioceseName } = resolveParishHeaders(options)
  const questions = resolveExportQuestions(options)
  const subject = options.subject || 'BÀI KIỂM TRA'
  const classLabel = options.classLabel || 'Lớp Giáo Lý'
  const academicYear = options.academicYear || ''
  const duration = options.durationMinutes || 45
  const versionCode = options.selectedVersion && options.selectedVersion !== 'ALL' ? options.selectedVersion : 'A'
  const includeKey = options.includeAnswerKey !== false
  const includeExp = options.includeExplanations !== false

  const variants = normalizeAnswerVariants(options.answerVariants, options.answerKey, questions.length)
  const activeKey = variants[versionCode] || options.answerKey || {}

  let text = `${dioceseName.toUpperCase()} - ${parishName.toUpperCase()}\n`
  text += `BAN GIÁO LÝ - THIẾU NHI THÁNH THỂ\n`
  text += `-------------------------------------------\n`
  text += `ĐỀ KIỂM TRA: ${subject.toUpperCase()}\n`
  text += `LỚP: ${classLabel.toUpperCase()}${academicYear ? ` | NIÊN KHÓA: ${academicYear}` : ''}\n`
  text += `Thời gian làm bài: ${duration} phút | Mã đề: ${versionCode}\n`
  text += `===========================================\n\n`

  if (options.includeStudentInfo !== false) {
    text += `Họ và tên: ............................................ Lớp: ${classLabel}\n`
    text += `Tên thánh: ............................................ Mã số: ................\n\n`
  }

  questions.forEach((q, idx) => {
    const qNum = q.index || idx + 1
    text += `Câu ${qNum}: ${q.question}\n`
    text += `A. ${q.options?.A || ''}\n`
    text += `B. ${q.options?.B || ''}\n`
    text += `C. ${q.options?.C || ''}\n`
    text += `D. ${q.options?.D || ''}\n\n`
  })

  if (includeKey) {
    text += `===========================================\n`
    text += `BẢNG ĐÁP ÁN & HƯỚNG DẪN CHẤM (MÃ ĐỀ ${versionCode}):\n`
    const keyPairs = questions.map((q, idx) => {
      const qNum = q.index || idx + 1
      const ans = activeKey[qNum] || q.correctOption || 'A'
      return `${qNum}.${ans}`
    })
    text += `${keyPairs.join('   ')}\n\n`

    if (includeExp) {
      questions.forEach((q, idx) => {
        if (q.explanation) {
          const qNum = q.index || idx + 1
          text += `* Câu ${qNum} (Đáp án ${activeKey[qNum] || q.correctOption}): ${q.explanation}\n`
        }
      })
    }
  }

  return text
}

/**
 * Tải file văn bản Text (.txt).
 */
export function downloadExamText(options: ExamExportOptions): void {
  try {
    const content = exportExamToText(options)
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = `De_Thi_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}_${(options.classLabel || 'Lop').replace(/\s+/g, '_')}_Ma${options.selectedVersion || 'A'}.txt`
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
    useToastStore.getState().addToast(`Đã xuất file Text: ${filename}`, 'success')
  } catch (err) {
    console.error('Error downloading exam text:', err)
    useToastStore.getState().addToast('Lỗi khi tải file Text!', 'error')
  }
}

/**
 * Xuất đề thi dạng Markdown (.md).
 */
export function exportExamToMarkdown(options: ExamExportOptions): string {
  const { parishName, dioceseName } = resolveParishHeaders(options)
  const questions = resolveExportQuestions(options)
  const subject = options.subject || 'BÀI KIỂM TRA'
  const classLabel = options.classLabel || 'Lớp Giáo Lý'
  const academicYear = options.academicYear || ''
  const duration = options.durationMinutes || 45
  const versionCode = options.selectedVersion && options.selectedVersion !== 'ALL' ? options.selectedVersion : 'A'
  const includeKey = options.includeAnswerKey !== false
  const includeExp = options.includeExplanations !== false

  const variants = normalizeAnswerVariants(options.answerVariants, options.answerKey, questions.length)
  const activeKey = variants[versionCode] || options.answerKey || {}

  let md = `# ${dioceseName.toUpperCase()} - ${parishName.toUpperCase()}\n`
  md += `### BAN GIÁO LÝ - THIẾU NHI THÁNH THỂ\n\n`
  md += `---\n\n`
  md += `## ĐỀ KIỂM TRA: ${subject.toUpperCase()}\n`
  md += `**Lớp**: ${classLabel} ${academicYear ? `| **Niên khóa**: ${academicYear}` : ''} | **Thời gian**: ${duration} phút | **Mã đề**: **${versionCode}**\n\n`

  if (options.includeStudentInfo !== false) {
    md += `> **Họ và tên**: ...................................................... | **Lớp**: ${classLabel} | **Điểm**: ............\n\n`
  }

  questions.forEach((q, idx) => {
    const qNum = q.index || idx + 1
    md += `#### Câu ${qNum}: ${q.question}\n`
    md += `- **A.** ${q.options?.A || ''}\n`
    md += `- **B.** ${q.options?.B || ''}\n`
    md += `- **C.** ${q.options?.C || ''}\n`
    md += `- **D.** ${q.options?.D || ''}\n\n`
  })

  if (includeKey) {
    md += `---\n\n`
    md += `### 📋 BẢNG ĐÁP ÁN (MÃ ĐỀ ${versionCode})\n\n`
    md += `| Câu | Đáp Án | Nội Dung |\n`
    md += `| :---: | :---: | :--- |\n`
    questions.forEach((q, idx) => {
      const qNum = q.index || idx + 1
      const ans = activeKey[qNum] || q.correctOption || 'A'
      const text = q.options?.[ans] || ''
      md += `| **${qNum}** | **${ans}** | ${text} |\n`
    })
    md += `\n`

    if (includeExp) {
      const hasExp = questions.some(q => Boolean(q.explanation))
      if (hasExp) {
        md += `### 💡 Hướng Dẫn Giải Chi Tiết\n\n`
        questions.forEach((q, idx) => {
          if (q.explanation) {
            const qNum = q.index || idx + 1
            md += `- **Câu ${qNum}**: ${q.explanation}\n`
          }
        })
      }
    }
  }

  return md
}

/**
 * Tải file Markdown (.md).
 */
export function downloadExamMarkdown(options: ExamExportOptions): void {
  try {
    const content = exportExamToMarkdown(options)
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = `De_Thi_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}_${(options.classLabel || 'Lop').replace(/\s+/g, '_')}_Ma${options.selectedVersion || 'A'}.md`
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
    useToastStore.getState().addToast(`Đã xuất file Markdown: ${filename}`, 'success')
  } catch (err) {
    console.error('Error downloading exam markdown:', err)
    useToastStore.getState().addToast('Lỗi khi tải file Markdown!', 'error')
  }
}

/**
 * Sinh chuỗi JSON có cấu trúc chứa thông tin đề thi, đáp án và danh sách câu hỏi.
 */
export function generateExamJsonString(options: ExamExportOptions): string {
  const questions = resolveExportQuestions(options)
  const payload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    metadata: {
      subject: options.subject,
      classLabel: options.classLabel,
      academicYear: options.academicYear,
      semester: options.semester,
      durationMinutes: options.durationMinutes || 45,
      maxScore: options.maxScore ?? 10,
      parishName: options.parishName,
      dioceseName: options.dioceseName,
      questionCount: questions.length,
    },
    answerKey: options.answerKey,
    answerVariants: options.answerVariants,
    questions,
  }
  return JSON.stringify(payload, null, 2)
}

/**
 * Xuất gói dữ liệu đề thi JSON (.json) phục vụ backup hoặc tích hợp.
 */
export function exportExamToJson(options: ExamExportOptions): void {
  try {
    const jsonStr = generateExamJsonString(options)
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = `De_Thi_JSON_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}.json`
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
    useToastStore.getState().addToast(`Đã xuất file JSON: ${filename}`, 'success')
  } catch (err) {
    console.error('Error exporting exam to JSON:', err)
    useToastStore.getState().addToast('Lỗi khi xuất file JSON!', 'error')
  }
}
