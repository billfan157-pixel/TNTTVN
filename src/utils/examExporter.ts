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

import { buildExamPaperHtml, type ExamPaperPrintOptions } from './examSheets'

/**
 * Tạo nội dung HTML tương thích hoàn toàn với Microsoft Word (.doc format),
 * đảm bảo layout và các thành phần (Header, QR Code quét tự động, Khung thông tin học sinh,
 * Khung chấm điểm GLV, Khung 4 Marker OMR Homography, Ô tròn trắc nghiệm, và Bảng đáp án)
 * khớp 100% với bản đề thi dùng để quét chấm điểm trên app.
 */
export function generateExamWordHtml(options: ExamExportOptions): string {
  const { parishName, dioceseName } = resolveParishHeaders(options)
  const questions = resolveExportQuestions(options)
  const versionCode = options.selectedVersion && options.selectedVersion !== 'ALL' ? options.selectedVersion : 'A'

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

  const printOptions: ExamPaperPrintOptions = {
    parishName,
    dioceseName,
    subject: options.subject || 'BÀI KIỂM TRA',
    classLabel: options.classLabel || 'Lớp Giáo Lý',
    academicYear: options.academicYear || '',
    durationMinutes: options.durationMinutes || 45,
    questions: mappedQuestions,
    showAnswerKey: options.includeAnswerKey !== false,
    layoutColumns: options.layoutColumns || 2,
    includeAnswerGrid: options.includeQuickAnswerGrid !== false,
    includeGradingBox: true,
    includeStudentInfo: options.includeStudentInfo !== false,
    includeExplanations: options.includeExplanations !== false,
    sessionId: 'SESS-001',
    examVersion: versionCode,
  }

  const baseHtml = buildExamPaperHtml(printOptions)

  // Nhúng Word Office XML tags để Microsoft Word nhận diện khổ A4 portrait và lề in chuẩn
  const wordHeader = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(options.subject || 'Đề Thi')}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->`

  return baseHtml.replace(/^<!DOCTYPE html>\s*<html[^>]*>\s*<head>/i, wordHeader)
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
