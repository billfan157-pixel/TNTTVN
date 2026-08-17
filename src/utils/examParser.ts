import * as XLSX from 'xlsx'
import type { ExamQuestion, MultipleChoiceOption } from '../types'

export interface ExamParseResult {
  ok: boolean
  questions: ExamQuestion[]
  answerKey: Record<number, MultipleChoiceOption>
  questionCount: number
  errors: string[]
  warnings: string[]
  rawSubject?: string
}

const OPTION_KEYS: MultipleChoiceOption[] = ['A', 'B', 'C', 'D']

/**
 * Parses an exam paper from raw text (Word paste, Markdown, plain text).
 * Handles flexible question headers (Câu 1, 1., 1/, Question 1...),
 * options (A., A), [A], *A), and answer keys (inline, marked, or end list).
 */
export function parseExamFromText(rawText: string): ExamParseResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!rawText || !rawText.trim()) {
    return {
      ok: false,
      questions: [],
      answerKey: {},
      questionCount: 0,
      errors: ['Nội dung đề thi đang rỗng. Hãy dán đề thi hoặc tải file Excel.'],
      warnings: [],
    }
  }

  const lines = rawText.split(/\r?\n/)
  
  // 1. Kiểm tra xem có bảng đáp án tổng hợp ở cuối đề không (VD: "BẢNG ĐÁP ÁN: 1A 2B 3C..." hoặc "ĐÁP ÁN: 1.A 2.B")
  const endKeyMap: Record<number, MultipleChoiceOption> = {}
  let hasEndKeySection = false

  const endKeyHeaderRegex = /(?:bảng\s+đáp\s+án|đáp\s+án\s+trắc\s+nghiệm|đáp\s+án\s+toàn\s+bộ|tổng\s+hợp\s+đáp\s+án|bảng\s+key|answer\s*key)/i
  let endKeyLineIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (endKeyHeaderRegex.test(line)) {
      endKeyLineIndex = i
      break
    }
    // Hoặc dòng chứa nhiều hơn 2 cặp số-đáp án (VD: "1A 2B 3C 4D...")
    const pairMatches = Array.from(line.matchAll(/(\d+)\s*[:.\-/)]?\s*([A-D])/gi))
    if (pairMatches.length >= 3 && !line.toLowerCase().startsWith('câu') && !line.toLowerCase().startsWith('bài')) {
      endKeyLineIndex = i
      break
    }
  }

  if (endKeyLineIndex !== -1) {
    const endKeyText = lines.slice(endKeyLineIndex).join(' ')
    // Tìm các cặp số-chữ như "1A", "1. A", "1: A", "1-A", "1/A"
    const pairRegex = /(\d+)\s*[:.\-/)]?\s*([A-D])/gi
    let match: RegExpExecArray | null
    while ((match = pairRegex.exec(endKeyText)) !== null) {
      const qNum = parseInt(match[1], 10)
      const ans = match[2].toUpperCase() as MultipleChoiceOption
      if (qNum >= 1 && qNum <= 50) {
        endKeyMap[qNum] = ans
        hasEndKeySection = true
      }
    }
  }

  // 2. Phân đoạn các câu hỏi (Questions Segmentation)
  const questionBlocks: string[][] = []
  let currentBlock: string[] = []

  // Regex nhận diện bắt đầu một câu hỏi:
  // "Câu 1:", "Câu 1.", "Câu 1 -", "Bài 1:", "1.", "1)", "1:", "1/"
  const questionStartRegex = /^(?:(?:câu|bài|question)\s*(\d+)|(\d+))\s*[:.)\-/]\s*(.*)$/i

  const parseLines = endKeyLineIndex !== -1 && hasEndKeySection ? lines.slice(0, endKeyLineIndex) : lines

  for (const line of parseLines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (questionStartRegex.test(trimmed)) {
      if (currentBlock.length > 0) {
        questionBlocks.push(currentBlock)
      }
      currentBlock = [trimmed]
    } else {
      if (currentBlock.length > 0) {
        currentBlock.push(trimmed)
      }
    }
  }
  if (currentBlock.length > 0) {
    questionBlocks.push(currentBlock)
  }

  if (questionBlocks.length === 0) {
    // Thử trích xuất nếu người dùng chỉ dán chuỗi đáp án (VD: 1A 2B 3C...)
    if (hasEndKeySection || Object.keys(endKeyMap).length > 0) {
      const qCount = Object.keys(endKeyMap).length
      const fallbackQuestions: ExamQuestion[] = []
      for (let i = 1; i <= qCount; i++) {
        fallbackQuestions.push({
          index: i,
          question: `Câu hỏi ${i}`,
          options: { A: 'Phương án A', B: 'Phương án B', C: 'Phương án C', D: 'Phương án D' },
          correctOption: endKeyMap[i] || 'A',
        })
      }
      return {
        ok: true,
        questions: fallbackQuestions,
        answerKey: endKeyMap,
        questionCount: qCount,
        errors: [],
        warnings: ['Chỉ tìm thấy bảng đáp án (không có nội dung câu hỏi chi tiết). Đã tạo danh sách câu hỏi mặc định.'],
      }
    }

    return {
      ok: false,
      questions: [],
      answerKey: {},
      questionCount: 0,
      errors: ['Không tìm thấy câu hỏi nào. Hãy chắc chắn câu hỏi bắt đầu bằng "Câu 1:", "Câu 2:" hoặc "1.", "2.".'],
      warnings: [],
    }
  }

  const parsedQuestions: ExamQuestion[] = []
  const parsedAnswerKey: Record<number, MultipleChoiceOption> = {}

  // 3. Phân tích từng khối câu hỏi
  for (let bIndex = 0; bIndex < questionBlocks.length; bIndex++) {
    const block = questionBlocks[bIndex]
    const firstLine = block[0]
    const startMatch = firstLine.match(questionStartRegex)
    
    const explicitIndex = startMatch ? parseInt(startMatch[1] || startMatch[2], 10) : bIndex + 1
    const questionIndex = isNaN(explicitIndex) ? bIndex + 1 : explicitIndex

    let questionText = startMatch ? (startMatch[3] || '').trim() : firstLine

    const options: { A: string; B: string; C: string; D: string } = {
      A: '',
      B: '',
      C: '',
      D: '',
    }
    let correctOption: MultipleChoiceOption | null = endKeyMap[questionIndex] || null

    // Regex nhận diện phương án: "A.", "A)", "A:", "[A]", "*A.", "*A)", "(A)"
    const optionRegex = /^(?:\*|\[|\()?([A-D])(?:\*|\]|\))?[\s.:)\-]*(.*)$/i

    // Regex nhận diện dòng đáp án riêng: "Đáp án: A", "Đ/A: B", "Key: C", "Chọn: D"
    const inlineAnswerRegex = /(?:đáp\s*án|đ\/a|key|chọn|ans)\s*[:.\-]?\s*([A-D])/i

    let currentOptionKey: MultipleChoiceOption | null = null

    for (let l = 1; l < block.length; l++) {
      const line = block[l].trim()
      if (!line) continue

      // Kiểm tra dòng đáp án
      const ansMatch = line.match(inlineAnswerRegex)
      if (ansMatch) {
        correctOption = ansMatch[1].toUpperCase() as MultipleChoiceOption
        continue
      }

      // Kiểm tra nếu dòng này là một phương án A, B, C, D
      // Cũng xử lý trường hợp 1 dòng có nhiều phương án: "A. Hà Nội   B. Huế   C. Sài Gòn   D. Đà Nẵng"
      const multiOptMatches = Array.from(line.matchAll(/(?:^|[\s\t]+)(?:\*|\[|\()?([A-D])(?:\*|\]|\))?[\s.:)\-]+([^A-D\n\r]*?)(?=(?:[\s\t]+(?:\*|\[|\()?[A-D](?:\*|\]|\))?[\s.:)\-])|$)/gi))

      if (multiOptMatches.length > 1) {
        for (const m of multiOptMatches) {
          const optLetter = m[1].toUpperCase() as MultipleChoiceOption
          const optContent = m[2].trim()
          options[optLetter] = optContent
          if (m[0].includes('*') || m[0].includes('[')) {
            correctOption = optLetter
          }
        }
        currentOptionKey = null
        continue
      }

      const optMatch = line.match(optionRegex)
      if (optMatch && OPTION_KEYS.includes(optMatch[1].toUpperCase() as any)) {
        currentOptionKey = optMatch[1].toUpperCase() as MultipleChoiceOption
        options[currentOptionKey] = optMatch[2].trim()

        // Nếu có đánh dấu sao *A hoặc [A] thì đó là đáp án đúng
        if (line.startsWith('*') || line.startsWith('[') || optMatch[0].startsWith('*') || optMatch[0].startsWith('[')) {
          correctOption = currentOptionKey
        }
      } else if (currentOptionKey) {
        // Dòng tiếp theo của phương án trước đó
        options[currentOptionKey] += ' ' + line
      } else {
        // Dòng tiếp theo của câu hỏi
        questionText += ' ' + line
      }
    }

    // Kiểm tra tính đầy đủ
    if (!options.A && !options.B) {
      warnings.push(`Câu ${questionIndex}: Chưa nhận diện được các lựa chọn A/B/C/D.`)
    }

    if (!correctOption) {
      warnings.push(`Câu ${questionIndex}: Chưa có đáp án đúng. Mặc định gán là A.`)
      correctOption = 'A'
    }

    parsedAnswerKey[questionIndex] = correctOption

    parsedQuestions.push({
      index: questionIndex,
      question: questionText || `Câu hỏi số ${questionIndex}`,
      options: {
        A: options.A || 'Phương án A',
        B: options.B || 'Phương án B',
        C: options.C || 'Phương án C',
        D: options.D || 'Phương án D',
      },
      correctOption,
    })
  }

  // Sắp xếp theo thứ tự câu
  parsedQuestions.sort((a, b) => a.index - b.index)

  // Giới hạn tối đa 50 câu (khớp mẫu phiếu OMR)
  const clampedQuestions = parsedQuestions.slice(0, 50)
  if (parsedQuestions.length > 50) {
    warnings.push(`Đề thi có ${parsedQuestions.length} câu. Hệ thống đã giới hạn lấy 50 câu đầu tiên để tương thích mẫu phiếu OMR.`)
  }

  // Đồng bộ lại answerKey theo clampedQuestions
  const finalAnswerKey: Record<number, MultipleChoiceOption> = {}
  clampedQuestions.forEach((q, idx) => {
    // Chuẩn hóa index từ 1..N
    const finalIndex = idx + 1
    q.index = finalIndex
    finalAnswerKey[finalIndex] = q.correctOption
  })

  return {
    ok: clampedQuestions.length > 0,
    questions: clampedQuestions,
    answerKey: finalAnswerKey,
    questionCount: clampedQuestions.length,
    errors,
    warnings,
  }
}

/**
 * Parses an exam from an Excel file (XLSX, XLS, CSV).
 * Expected columns:
 * - Col 1: Câu số (1, 2, 3...)
 * - Col 2: Nội dung câu hỏi
 * - Col 3: Phương án A
 * - Col 4: Phương án B
 * - Col 5: Phương án C
 * - Col 6: Phương án D
 * - Col 7: Đáp án đúng (A/B/C/D)
 */
export function parseExamFromExcel(buffer: ArrayBuffer | Uint8Array): ExamParseResult {
  const errors: string[] = []
  const warnings: string[] = []

  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      return {
        ok: false,
        questions: [],
        answerKey: {},
        questionCount: 0,
        errors: ['File Excel không có sheet nào.'],
        warnings: [],
      }
    }

    const sheet = workbook.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })

    if (!rows || rows.length <= 1) {
      return {
        ok: false,
        questions: [],
        answerKey: {},
        questionCount: 0,
        errors: ['File Excel không có dữ liệu câu hỏi.'],
        warnings: [],
      }
    }

    // Bỏ qua dòng tiêu đề nếu dòng 1 chứa chữ "Câu", "Nội dung", "Question"...
    let startIndex = 0
    const firstRowStr = JSON.stringify(rows[0] || []).toLowerCase()
    if (firstRowStr.includes('câu') || firstRowStr.includes('nội dung') || firstRowStr.includes('question') || firstRowStr.includes('đáp án')) {
      startIndex = 1
    }

    const parsedQuestions: ExamQuestion[] = []
    const parsedAnswerKey: Record<number, MultipleChoiceOption> = {}

    for (let r = startIndex; r < rows.length; r++) {
      const row = rows[r]
      if (!row || row.length === 0 || !row[0]) continue

      // Hỗ trợ format 7 cột hoặc format 2 cột (Câu, Đáp án)
      const qIndex = parseInt(String(row[0]), 10) || parsedQuestions.length + 1
      const qText = String(row[1] || '').trim() || `Câu hỏi ${qIndex}`
      const optA = String(row[2] || '').trim() || 'Phương án A'
      const optB = String(row[3] || '').trim() || 'Phương án B'
      const optC = String(row[4] || '').trim() || 'Phương án C'
      const optD = String(row[5] || '').trim() || 'Phương án D'

      let correct = String(row[6] || row[2] || 'A').trim().toUpperCase()
      if (correct.length > 1) {
        const match = correct.match(/[A-D]/)
        correct = match ? match[0] : 'A'
      }
      const correctOption: MultipleChoiceOption = ['A', 'B', 'C', 'D'].includes(correct)
        ? (correct as MultipleChoiceOption)
        : 'A'

      const finalIndex = parsedQuestions.length + 1
      parsedQuestions.push({
        index: finalIndex,
        question: qText,
        options: { A: optA, B: optB, C: optC, D: optD },
        correctOption,
      })
      parsedAnswerKey[finalIndex] = correctOption

      if (parsedQuestions.length >= 50) {
        warnings.push('Đã đạt giới hạn 50 câu hỏi tối đa cho mẫu phiếu OMR.')
        break
      }
    }

    return {
      ok: parsedQuestions.length > 0,
      questions: parsedQuestions,
      answerKey: parsedAnswerKey,
      questionCount: parsedQuestions.length,
      errors,
      warnings,
    }
  } catch (err: any) {
    return {
      ok: false,
      questions: [],
      answerKey: {},
      questionCount: 0,
      errors: [`Lỗi đọc file Excel: ${err?.message || 'Định dạng không hợp lệ'}`],
      warnings: [],
    }
  }
}

/**
 * Generates sample exam text template for users to copy/paste and test.
 */
export function generateSampleExamTemplateText(): string {
  return `ĐỀ KIỂM TRA GIÁO LÝ & PHỤNG VỤ THIẾU NHI
Thời gian làm bài: 45 phút (Đề gồm 10 câu trắc nghiệm)

Câu 1: Bí tích nào là cội nguồn và chóp đỉnh của đời sống Kitô hữu?
A. Bí tích Rửa Tội
*B. Bí tích Thánh Thể
C. Bí tích Thêm Sức
D. Bí tích Hòa Giải

Câu 2: Chúa Giêsu lập Bí tích Thánh Thể trong dịp nào?
A. Tiệc cưới Cana
B. Bữa Tiệc Ly
C. Sau khi Người sống lại
D. Khi Người biến hình trên núi Tabôrê
Đáp án: B

Câu 3: Ai là người có quyền truyền chức Linh Mục trong Hội Thánh?
A. Cha Quản Xứ
B. Đức Giám Mục
C. Cha Tuyên Úy
D. Bề Trên Dòng
Đáp án: B

Câu 4: Mười Điều Răn Đức Chúa Trời được ban cho ai trên núi Sinai?
*A. Ông Môsê
B. Ông Abraham
C. Vua Đavít
D. Ngôn sứ Êlia

Câu 5: Khẩu hiệu của Phong trào Thiếu Nhi Thánh Thể Việt Nam là gì?
A. Hy Sinh - Cầu Nguyện
B. Yêu Thương - Phục Vụ
C. Cầu Nguyện - Rước Lễ - Hy Sinh - Làm Tông Đồ
D. Vâng Lời - Khiêm Nhường
Đáp án: C

Câu 6: Màu áo khăn quàng của Ngành Thiếu Nhi là màu gì?
A. Màu hồng viền đỏ
B. Màu xanh biển viền vàng
C. Màu đỏ viền trắng
D. Màu tím
Đáp án: B

Câu 7: Mùa Phụng Vụ nào mở đầu cho một Năm Phụng Vụ mới?
*A. Mùa Vọng
B. Mùa Giáng Sinh
C. Mùa Chay
D. Mùa Phục Sinh

Câu 8: Bí tích nào tha thứ tội tổ tông và đưa con người vào Hội Thánh?
A. Bí tích Thêm Sức
B. Bí tích Rửa Tội
C. Bí tích Giải Tội
D. Bí tích Truyền Chức
Đáp án: B

Câu 9: Thánh Lễ gồm có mấy phần chính?
A. 1 phần
*B. 2 phần (Phụng vụ Lời Chúa và Phụng vụ Thánh Thể)
C. 3 phần
D. 4 phần

Câu 10: Giới răn quan trọng nhất mà Chúa Giêsu dạy là gì?
A. Giữ chay và kiêng thịt
B. Đi lễ các ngày Chúa Nhật
C. Mến Chúa hết lòng và yêu thương người khác như chính mình
D. Dâng cúng tiền của vào đền thờ
Đáp án: C
`
}

/**
 * Generates sample Excel workbook for downloading.
 */
export function generateSampleExcelWorkbook(): Uint8Array {
  const data = [
    ['Câu Số', 'Nội Dung Câu Hỏi', 'Lựa Chọn A', 'Lựa Chọn B', 'Lựa Chọn C', 'Lựa Chọn D', 'Đáp Án Đúng (A/B/C/D)'],
    [1, 'Bí tích nào là cội nguồn và chóp đỉnh của đời sống Kitô hữu?', 'Bí tích Rửa Tội', 'Bí tích Thánh Thể', 'Bí tích Thêm Sức', 'Bí tích Hòa Giải', 'B'],
    [2, 'Chúa Giêsu lập Bí tích Thánh Thể trong dịp nào?', 'Tiệc cưới Cana', 'Bữa Tiệc Ly', 'Sau khi sống lại', 'Trên đồi Can-vê', 'B'],
    [3, 'Mười Điều Răn Đức Chúa Trời được ban cho ai trên núi Sinai?', 'Ông Môsê', 'Ông Abraham', 'Vua Đavít', 'Ngôn sứ Êlia', 'A'],
    [4, 'Khẩu hiệu của Thiếu Nhi Thánh Thể là gì?', 'Hy Sinh - Bác Ái', 'Yêu Thương - Phục Vụ', 'Cầu Nguyện - Rước Lễ - Hy Sinh - Làm Tông Đồ', 'Vâng Lời - Khiêm Nhường', 'C'],
    [5, 'Mùa Phụng Vụ nào mở đầu Năm Phụng Vụ mới?', 'Mùa Vọng', 'Mùa Giáng Sinh', 'Mùa Chay', 'Mùa Phục Sinh', 'A'],
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [
    { wch: 8 },
    { wch: 45 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 20 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_De_Thi')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Uint8Array(out)
}
