import type { ExamQuestion, ExamAnswerVariants, ExamVersionCode, MultipleChoiceOption, ExamVariantManifestSet } from '../types'
import { useSettingsStore } from '../stores/settingsStore'
import { useToastStore } from '../stores/toastStore'
import { EXAM_VERSION_CODES, normalizeAnswerVariants } from '../lib/examVariants'
import { assertContiguousQuestionIndexes, prepareExamDocumentForOutput } from '../lib/examPrintSafety'
import { loadXlsx } from '../lib/xlsxLoader'

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
  variantManifests?: ExamVariantManifestSet | string
  selectedVersion?: ExamVersionCode | 'ALL'
  includeAnswerKey?: boolean
  includeExplanations?: boolean
  includeStudentInfo?: boolean
  includeQuickAnswerGrid?: boolean
  layoutColumns?: 1 | 2
  parishName?: string
  dioceseName?: string
  scoreTypeLabel?: string
  sessionId?: string
  student?: { id: string; code: string; name: string }
  students?: { id: string; code: string; name: string }[]
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

import { ReportExportService, sanitizeFilename } from '../services/reportExportService'
import { buildExamPaperHtml, buildBatchExamPapersHtml, buildAllVariantsExamPapersHtml } from './examSheets'

function parseVariantManifest(value: ExamExportOptions['variantManifests']): ExamVariantManifestSet | undefined {
  if (!value) return undefined
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || parsed.schemaVersion !== 1 || !parsed.variants || typeof parsed.variants !== 'object') return undefined
    return parsed as ExamVariantManifestSet
  } catch {
    return undefined
  }
}

function resolveQuestionsForVersion(options: ExamExportOptions, version: ExamVersionCode): { questions: ExamQuestion[]; answerKey: Record<number, MultipleChoiceOption> } {
  const manifest = parseVariantManifest(options.variantManifests)
  const entry = manifest?.variants[version]
  const questions = entry?.questions?.length ? entry.questions : resolveExportQuestions(options)
  assertContiguousQuestionIndexes(questions)
  const variants = normalizeAnswerVariants(options.answerVariants, options.answerKey, questions.length)
  return {
    questions: [...questions].sort((a, b) => a.index - b.index),
    answerKey: entry?.answerKey || variants[version] || options.answerKey || {},
  }
}

function configuredExportVersions(options: ExamExportOptions): ExamVersionCode[] {
  const manifest = parseVariantManifest(options.variantManifests)
  const variants = normalizeAnswerVariants(options.answerVariants, options.answerKey, resolveExportQuestions(options).length)
  const versions = EXAM_VERSION_CODES.filter(code => Boolean(manifest?.variants[code]) || Boolean(variants[code]))
  return versions.length > 0 ? versions : (['A'] as ExamVersionCode[])
}

function answerKeyForVersion(options: ExamExportOptions, version: ExamVersionCode): Record<number, MultipleChoiceOption> {
  const manifest = parseVariantManifest(options.variantManifests)
  const variants = normalizeAnswerVariants(options.answerVariants, options.answerKey, resolveExportQuestions(options).length)
  return manifest?.variants[version]?.answerKey || variants[version] || options.answerKey || {}
}

function matrixSourceOrder(options: ExamExportOptions, version: ExamVersionCode, questions: ExamQuestion[]): number[] {
  const manifest = parseVariantManifest(options.variantManifests)
  const order = manifest?.variants[version]?.sourceQuestionOrder
  if (!order || order.length !== questions.length || new Set(order).size !== order.length) return questions.map(question => question.index)
  return order
}

function answerForSourceQuestion(options: ExamExportOptions, version: ExamVersionCode, sourceIndex: number): MultipleChoiceOption | '-' {
  const manifest = parseVariantManifest(options.variantManifests)
  const entry = manifest?.variants[version]
  if (entry) {
    const position = entry.sourceQuestionOrder.indexOf(sourceIndex)
    return position >= 0 ? (entry.answerKey[position + 1] || '-') : '-'
  }
  return answerKeyForVersion(options, version)[sourceIndex] || '-'
}

/**
 * Chuyển đổi ExamExportOptions thành ExamPaperPrintOptions chuẩn cho engine in & xuất đề.
 */
function convertExportOptionsToPrintOptions(options: ExamExportOptions) {
  const { parishName, dioceseName } = resolveParishHeaders(options)
  const configuredVersions = configuredExportVersions(options)
  const requestedVersion: ExamVersionCode = options.selectedVersion && options.selectedVersion !== 'ALL' ? options.selectedVersion : 'A'
  const versionCode: ExamVersionCode = configuredVersions.includes(requestedVersion) ? requestedVersion : (configuredVersions[0] ?? 'A')
  const resolved = resolveQuestionsForVersion(options, versionCode)
  const mappedQuestions = resolved.questions.map(q => ({
    ...q,
    correctOption: resolved.answerKey[q.index] || q.correctOption || 'A',
  }))

  return {
    parishName: parishName || 'Giáo Xứ',
    dioceseName: dioceseName || 'Giáo Phận',
    subject: options.subject || 'BÀI KIỂM TRA',
    classLabel: options.classLabel || 'Lớp Giáo Lý',
    academicYear: options.academicYear || '',
    durationMinutes: options.durationMinutes || 45,
    questions: mappedQuestions,
    showAnswerKey: options.includeAnswerKey ?? false,
    includeExplanations: options.includeExplanations ?? true,
    includeStudentInfo: options.includeStudentInfo ?? true,
    includeAnswerGrid: options.includeQuickAnswerGrid ?? true,
    includeGradingBox: true,
    layoutColumns: options.layoutColumns || 2,
    examVersion: versionCode,
    sessionId: options.sessionId || 'SESS-001',
    student: options.student,
  }
}

/**
 * Tạo nội dung HTML của đề thi tương thích Microsoft Word (.doc format).
 * Word không phải scan-certified, nhưng vẫn đi qua safety gate để answer-key
 * không còn homography marker và malformed OMR rows không thể được xuất/in nhầm.
 */
export function generateExamWordHtml(options: ExamExportOptions): string {
  if (options.selectedVersion === 'ALL') {
    const { parishName, dioceseName } = resolveParishHeaders(options)
    const variantsData = configuredExportVersions(options).map(code => {
      const resolved = resolveQuestionsForVersion(options, code)
      return { examVersion: code, questions: resolved.questions.map(q => ({ ...q, correctOption: resolved.answerKey[q.index] || q.correctOption || 'A' })) }
    })
    return prepareExamDocumentForOutput(buildAllVariantsExamPapersHtml({
      parishName: parishName || 'Giáo Xứ', dioceseName: dioceseName || 'Giáo Phận',
      subject: options.subject || 'BÀI KIỂM TRA', classLabel: options.classLabel || 'Lớp Giáo Lý',
      academicYear: options.academicYear || '', durationMinutes: options.durationMinutes || 45,
      showAnswerKey: Boolean(options.includeAnswerKey), includeExplanations: Boolean(options.includeExplanations),
      layoutColumns: options.layoutColumns || 2, includeAnswerGrid: options.includeQuickAnswerGrid !== false,
      includeGradingBox: true, sessionId: options.sessionId || 'SESS-001', variants: variantsData,
    }))
  }
  const printOptions = convertExportOptionsToPrintOptions(options)
  return prepareExamDocumentForOutput(buildExamPaperHtml(printOptions))
}

/**
 * Tạo nội dung HTML xuất hàng loạt cho Microsoft Word (.doc format).
 */
export function generateBatchExamWordHtml(
  students: { id: string; code: string; name: string }[],
  options: ExamExportOptions
): string {
  if (options.selectedVersion === 'ALL') throw new Error('Word/HTML hàng loạt chưa hỗ trợ ALL; hãy chọn từng mã đề để không gán sai đề cho học sinh.')
  const printOptions = convertExportOptionsToPrintOptions(options)
  return prepareExamDocumentForOutput(buildBatchExamPapersHtml(students, printOptions))
}

/**
 * Xuất đề thi ra file HTML độc lập (.html) có thể mở trên mọi trình duyệt và in chuẩn A4,
 * sử dụng trực tiếp engine SSOT để đảm bảo 100% đồng nhất với bản xem trước và bản in.
 */
export function exportExamToHtml(options: ExamExportOptions): void {
  try {
    const isBatch = Boolean(options.students && options.students.length > 0)
    const html = isBatch
      ? generateBatchExamWordHtml(options.students!, options)
      : generateExamWordHtml(options)
    const filename = sanitizeFilename(`De_Thi_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}_${(options.classLabel || 'Lop').replace(/\s+/g, '_')}_${isBatch ? `CaLop_${options.students!.length}Em` : `Ma${options.selectedVersion || 'A'}`}.html`)
    ReportExportService.downloadHTML(html, filename)
    useToastStore.getState().addToast(`Đã xuất file HTML đề thi: ${filename}`, 'success')
  } catch (err) {
    console.error('Error exporting exam to HTML:', err)
    useToastStore.getState().addToast(err instanceof Error ? err.message : 'Lỗi khi xuất file HTML!', 'error', 7000)
  }
}

/**
 * Xuất đề thi ra file Microsoft Word (.doc), hỗ trợ cả xuất đơn và xuất hàng loạt cho toàn bộ học sinh.
 * Tài liệu Word vẫn là định dạng chỉnh sửa, không được coi là scan-certified.
 */
export function exportExamToWord(options: ExamExportOptions): void {
  try {
    const isBatch = Boolean(options.students && options.students.length > 0)
    const html = isBatch
      ? generateBatchExamWordHtml(options.students!, options)
      : generateExamWordHtml(options)
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = sanitizeFilename(`De_Thi_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}_${(options.classLabel || 'Lop').replace(/\s+/g, '_')}_${isBatch ? `CaLop_${options.students!.length}Em` : `Ma${options.selectedVersion || 'A'}`}.doc`)
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
    useToastStore.getState().addToast(`Đã xuất file Word ${isBatch ? `cho ${options.students!.length} học sinh` : ''}: ${filename}`, 'success')
  } catch (err) {
    console.error('Error exporting exam to Word:', err)
    useToastStore.getState().addToast(err instanceof Error ? err.message : 'Lỗi khi xuất file Word!', 'error', 7000)
  }
}

/**
 * Sinh Workbook Excel (.xlsx) chứa câu hỏi, bảng đáp án ma trận các mã đề, và metadata.
 */
export async function generateExamExcelWorkbook(options: ExamExportOptions): Promise<Uint8Array> {
  if (options.selectedVersion === 'ALL') throw new Error('Excel không thể biểu diễn nhiều mã đề trong một bảng; hãy chọn một mã đề cụ thể.')
  // PERF-XLSX-1: lazy-load xlsx — chunk chỉ tải khi user export Excel.
  const XLSX = await loadXlsx()
  const { parishName, dioceseName } = resolveParishHeaders(options)
  const selectedVersion = options.selectedVersion || 'A'
  const resolved = resolveQuestionsForVersion(options, selectedVersion)
  const questions = resolved.questions
  const activeCodes = configuredExportVersions(options)
  const baseKey = resolved.answerKey

  const wb = XLSX.utils.book_new()

  // 1. Sheet 1: Danh sách câu hỏi chi tiết (chuẩn format để import lại được vào app)
  // EXAM-MIXED: thêm cột "Loại" (Trắc nghiệm/Tự luận) — parser import map theo tên header.
  const questionsData = [
    ['Câu Số', 'Loại', 'Nội Dung Câu Hỏi', 'Lựa Chọn A', 'Lựa Chọn B', 'Lựa Chọn C', 'Lựa Chọn D', 'Đáp Án Đúng (A/B/C/D)', 'Điểm', 'Giải Thích Chi Tiết'],
    ...questions.map((q, idx) => {
      const qNum = q.index || idx + 1
      const isEssay = q.type === 'essay'
      return [
        qNum,
        isEssay ? 'Tự luận' : 'Trắc nghiệm',
        q.question || '',
        q.options?.A || '',
        q.options?.B || '',
        q.options?.C || '',
        q.options?.D || '',
         isEssay ? '' : (baseKey[qNum] || q.correctOption || 'A'),

        q.points ?? 1,
        q.explanation || '',
      ]
    }),
  ]

  const wsQuestions = XLSX.utils.aoa_to_sheet(questionsData)
  wsQuestions['!cols'] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 45 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 20 },
    { wch: 8 },
    { wch: 35 },
  ]
  XLSX.utils.book_append_sheet(wb, wsQuestions, 'Danh_Sach_Cau_Hoi')

  // 2. Sheet 2: Ma Trận Bảng Đáp Án Các Mã Đề (Mã A, B, C, D...)
  const matrixHeaders = ['Câu Số', ...activeCodes.map(c => `Mã Đề ${c}`)]
  const matrixRows: (string | number)[][] = [matrixHeaders]

  const sourceOrder = matrixSourceOrder(options, selectedVersion, questions)
  for (const sourceIndex of sourceOrder) {
    const row: (string | number)[] = [sourceIndex]
    for (const code of activeCodes) row.push(answerForSourceQuestion(options, code, sourceIndex))
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

/** Xuất đề thi ra file Excel (.xlsx). Async do lazy-load xlsx (PERF-XLSX-1). */
export async function exportExamToExcel(options: ExamExportOptions): Promise<void> {
  try {
    const bytes = await generateExamExcelWorkbook(options)
    const blob = new Blob([bytes as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = sanitizeFilename(`De_Thi_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}_${(options.classLabel || 'Lop').replace(/\s+/g, '_')}.xlsx`)
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

/** Xuất đề thi dạng văn bản thuần Text (.txt). */
export function exportExamToText(options: ExamExportOptions): string {
  if (options.selectedVersion === 'ALL') throw new Error('Text không thể gộp nhiều mã đề an toàn; hãy chọn một mã đề cụ thể.')
  const { parishName, dioceseName } = resolveParishHeaders(options)
  const versionCode = options.selectedVersion || 'A'
  const resolved = resolveQuestionsForVersion(options, versionCode)
  const questions = resolved.questions
  const subject = options.subject || 'BÀI KIỂM TRA'
  const classLabel = options.classLabel || 'Lớp Giáo Lý'
  const academicYear = options.academicYear || ''
  const duration = options.durationMinutes || 45
  const includeKey = options.includeAnswerKey !== false
  const includeExp = options.includeExplanations !== false
  const activeKey = resolved.answerKey

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
    // EXAM-MIXED: câu tự luận không in phương án — in dòng trống trình bày.
    if (q.type === 'essay') {
      text += `Câu ${qNum}${q.points !== undefined ? ` (${q.points} điểm)` : ''}: ${q.question}\n\n`
      return
    }
    text += `Câu ${qNum}: ${q.question}\n`
    text += `A. ${q.options?.A || ''}\n`
    text += `B. ${q.options?.B || ''}\n`
    text += `C. ${q.options?.C || ''}\n`
    text += `D. ${q.options?.D || ''}\n\n`
  })

  if (includeKey) {
    text += `===========================================\n`
    text += `BẢNG ĐÁP ÁN & HƯỚNG DẪN CHẤM (MÃ ĐỀ ${versionCode}):\n`
    const keyPairs = questions
      .filter(q => q.type !== 'essay')
      .map((q, idx) => {
        const qNum = q.index || idx + 1
        const ans = activeKey[qNum] || q.correctOption || 'A'
        return `${qNum}.${ans}`
      })
    text += `${keyPairs.join('   ')}\n`
    const essayList = questions.filter(q => q.type === 'essay')
    if (essayList.length > 0) {
      text += `\nPHẦN TỰ LUẬN (chấm bằng nhập điểm tay trên hệ thống):\n`
      essayList.forEach(q => {
        const qNum = q.index || 0
        text += `- Câu ${qNum}${q.points !== undefined ? ` (${q.points}đ)` : ''}\n`
      })
    }
    text += '\n'

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

/** Tải file văn bản Text (.txt). */
export function downloadExamText(options: ExamExportOptions): void {
  try {
    const content = exportExamToText(options)
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = sanitizeFilename(`De_Thi_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}_${(options.classLabel || 'Lop').replace(/\s+/g, '_')}_Ma${options.selectedVersion || 'A'}.txt`)
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

/** Xuất đề thi dạng Markdown (.md). */
export function exportExamToMarkdown(options: ExamExportOptions): string {
  if (options.selectedVersion === 'ALL') throw new Error('Markdown không thể gộp nhiều mã đề an toàn; hãy chọn một mã đề cụ thể.')
  const { parishName, dioceseName } = resolveParishHeaders(options)
  const versionCode = options.selectedVersion || 'A'
  const resolved = resolveQuestionsForVersion(options, versionCode)
  const questions = resolved.questions
  const subject = options.subject || 'BÀI KIỂM TRA'
  const classLabel = options.classLabel || 'Lớp Giáo Lý'
  const academicYear = options.academicYear || ''
  const duration = options.durationMinutes || 45
  const includeKey = options.includeAnswerKey !== false
  const includeExp = options.includeExplanations !== false
  const activeKey = resolved.answerKey

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
    // EXAM-MIXED: câu tự luận không in phương án.
    if (q.type === 'essay') {
      md += `#### Câu ${qNum}${q.points !== undefined ? ` (${q.points} điểm)` : ''}: ${q.question}\n\n`
      return
    }
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
    questions.filter(q => q.type !== 'essay').forEach((q, idx) => {
      const qNum = q.index || idx + 1
      const ans = activeKey[qNum] || q.correctOption || 'A'
      const optionText = q.options?.[ans] || ''
      md += `| **${qNum}** | **${ans}** | ${optionText} |\n`
    })
    const essayList = questions.filter(q => q.type === 'essay')
    if (essayList.length > 0) {
      md += `\n**PHẦN TỰ LUẬN** — chấm bằng nhập điểm tay trên hệ thống:\n\n`
      essayList.forEach(q => {
        const qNum = q.index || 0
        md += `- **Câu ${qNum}**${q.points !== undefined ? ` (${q.points}đ)` : ''}\n`
      })
    }
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

/** Tải file Markdown (.md). */
export function downloadExamMarkdown(options: ExamExportOptions): void {
  try {
    const content = exportExamToMarkdown(options)
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = sanitizeFilename(`De_Thi_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}_${(options.classLabel || 'Lop').replace(/\s+/g, '_')}_Ma${options.selectedVersion || 'A'}.md`)
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

/** Sinh chuỗi JSON có cấu trúc chứa thông tin đề thi, đáp án và danh sách câu hỏi. */
export function generateExamJsonString(options: ExamExportOptions): string {
  const questions = resolveExportQuestions(options)
  // EP-F3 (audit 2026-08-21): đánh dấu khi danh sách câu hỏi là PLACEHOLDER được
  // bịa ra (phiên key-only không có ngân hàng câu hỏi) để backup/tích hợp không
  // nhầm với dữ liệu thật.
  const syntheticQuestions = !(options.questions && options.questions.length > 0)
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
      syntheticQuestions,
    },
     answerKey: options.answerKey,
     answerVariants: options.answerVariants,
     variantManifests: parseVariantManifest(options.variantManifests) || options.variantManifests || null,
     questions,

  }
  return JSON.stringify(payload, null, 2)
}

/** Xuất gói dữ liệu đề thi JSON (.json) phục vụ backup hoặc tích hợp. */
export function exportExamToJson(options: ExamExportOptions): void {
  try {
    const jsonStr = generateExamJsonString(options)
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = sanitizeFilename(`De_Thi_JSON_${(options.subject || 'Mon_Hoc').replace(/\s+/g, '_')}.json`)
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
