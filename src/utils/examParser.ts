import { loadXlsx } from '../lib/xlsxLoader'
import type { ExamQuestion, MultipleChoiceOption } from '../types'

export interface ExamParseResult {
  ok: boolean
  questions: ExamQuestion[]
  /** Chỉ chứa đáp án của các câu TRẮC NGHIỆM (câu tự luận không có key). */
  answerKey: Record<number, MultipleChoiceOption>
  /** Tổng số câu đã nhận diện (TN + TL). */
  questionCount: number
  // ─── EXAM-MIXED: thống kê theo loại câu ───
  mcQuestionCount: number
  essayQuestionCount: number
  totalPoints: number
  mcPoints: number
  essayPoints: number
  errors: string[]
  warnings: string[]
  rawSubject?: string
}

const OPTION_KEYS: MultipleChoiceOption[] = ['A', 'B', 'C', 'D']
export const MAX_EXAM_QUESTIONS = 50

/**
 * EXAM-MIXED: nhận diện dòng tiêu đề phần ("PHẦN I. TRẮC NGHIỆM", "II. TỰ LUẬN",
 * "PART B - ESSAY"...). Trả về loại phần hoặc null nếu không phải tiêu đề phần.
 */
export function detectSectionMode(line: string): 'multiple_choice' | 'essay' | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 120) return null
  const hasPartPrefix = /^(?:phần|phan|part)\b/i.test(trimmed) || /^(?:[IVX]{1,5}|\d{1,2})\s*[.:)\-–]/i.test(trimmed)
  // Bỏ tiền tố "PHẦN I." để soi từ khóa phần.
  const content = trimmed
    .replace(/^(?:phần|phan|part)\s*/i, '')
    .replace(/^(?:[IVX]{1,5}|\d{1,2})\s*[.:)\-–]\s*/i, '')
    .trim()
  if (!content) return null
  const isMc = /trắc\s*nghiệm|trắc nghiệm|multiple[\s-]*choice|lựa chọn|objective/i.test(content) || /^\s*tn\s*$/i.test(content)
  const isEssay = /tự luận|tu\s*luan|essay|free[\s-]*response|open[\s-]*question|thuyết trình|viết\b/i.test(content) || /^\s*tl\s*$/i.test(content)
  // Phải có tiền tố phần HOẶC là nhãn ngắn không kết thúc câu → tránh bắt nhầm nội dung câu hỏi.
  const isLabelOnly = content.length <= 40 && !/[?.!]$/.test(content)
  if (!hasPartPrefix && !isLabelOnly) return null
  if (isMc && !isEssay) return 'multiple_choice'
  if (isEssay && !isMc) return 'essay'
  return null
}

/** Trích "(2 điểm)" / "(0,5 đ)" từ tiêu đề câu/phần; trả về điểm hoặc undefined. */
export function extractPointsHint(text: string): number | undefined {
  const match = text.match(/\(\s*(\d+(?:[.,]\d+)?)\s*(?:điểm|diem|đ|d|points?)\s*\)/i)
  if (!match) return undefined
  const value = parseFloat(match[1].replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : undefined
}

/**
 * UI-POLISH 2026-08-25: phạm vi import — tạo phiên cho phép nạp RIÊNG phần
 * trắc nghiệm và phần tự luận (2 ô import riêng), hoặc cả hai (đề gộp).
 */
export type ExamImportScope = 'multiple_choice' | 'essay' | 'both'

const isEssayQuestion = (q: ExamQuestion): boolean => (q.type ?? 'multiple_choice') === 'essay'

/**
 * Lọc kết quả parse theo phạm vi import:
 *  - 'multiple_choice': giữ câu TN (đánh lại index 1..N, rebuild answerKey theo index mới),
 *    bỏ câu TL kèm warning.
 *  - 'essay': giữ câu TL (đánh lại 1..M), bỏ câu TN + answerKey.
 *  - 'both': trả nguyên kết quả.
 * Không đủ câu theo phạm vi → ok=false + lỗi rõ ràng để modal chặn "Áp Dụng".
 */
export function scopeExamParseResult(result: ExamParseResult, scope: ExamImportScope): ExamParseResult {
  if (scope === 'both') return result

  const kept = result.questions.filter(q => scope === 'essay' ? isEssayQuestion(q) : !isEssayQuestion(q))
  const dropped = result.questions.length - kept.length
  const scopeLabel = scope === 'essay' ? 'tự luận' : 'trắc nghiệm'
  const warnings = [...result.warnings]
  if (dropped > 0) {
    warnings.unshift(`Đã bỏ qua ${dropped} câu ${scope === 'essay' ? 'trắc nghiệm' : 'tự luận'} — ô import này chỉ nhận phần ${scopeLabel}.`)
  }
  if (kept.length === 0) {
    return {
      ok: false,
      questions: [],
      answerKey: {},
      questionCount: 0,
      ...emptyStats(),
      errors: [`Không tìm thấy câu hỏi ${scopeLabel} nào trong nội dung đã dán. Kiểm tra lại đề hoặc dán vào ô import ${scope === 'essay' ? 'trắc nghiệm' : 'tự luận'}.`],
      warnings,
    }
  }

  // Đánh lại index 1..N trên phần giữ lại + rebuild answerKey theo index mới
  // (Data integrity: index là khóa của answerKey/OMR — không được lệch).
  const questions: ExamQuestion[] = kept.map((q, i) => ({ ...q, index: i + 1 }))
  const answerKey: Record<number, MultipleChoiceOption> = {}
  if (scope === 'multiple_choice') {
    kept.forEach((q, i) => {
      if (!isEssayQuestion(q) && q.correctOption) answerKey[i + 1] = q.correctOption
    })
  }
  const stats = computeStats(questions)
  return {
    ...result,
    ok: true,
    questions,
    answerKey,
    questionCount: kept.length,
    ...stats,
    warnings,
  }
}

function emptyStats() {
  return { mcQuestionCount: 0, essayQuestionCount: 0, totalPoints: 0, mcPoints: 0, essayPoints: 0 }
}

function computeStats(questions: ExamQuestion[]) {
  const stats = emptyStats()
  for (const q of questions) {
    const pts = q.points ?? 1
    stats.totalPoints += pts
    if ((q.type ?? 'multiple_choice') === 'essay') {
      stats.essayQuestionCount++
      stats.essayPoints += pts
    } else {
      stats.mcQuestionCount++
      stats.mcPoints += pts
    }
  }
  stats.totalPoints = Math.round(stats.totalPoints * 100) / 100
  stats.mcPoints = Math.round(stats.mcPoints * 100) / 100
  stats.essayPoints = Math.round(stats.essayPoints * 100) / 100
  return stats
}

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
      ...emptyStats(),
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
  // EXAM-MIXED: mỗi block ghi lại mode phần tại thời điểm bắt đầu (mặc định TN
  // cho đề thuần trắc nghiệm không có tiêu đề phần — giữ nguyên behavior cũ).
  interface QuestionBlockMeta { mode: 'multiple_choice' | 'essay' }
  const blockMetas: QuestionBlockMeta[] = []
  let currentBlock: string[] = []
  let currentSectionMode: 'multiple_choice' | 'essay' = 'multiple_choice'
  // Điểm khai báo ở TIÊU ĐỀ PHẦN "(6 điểm)" → chia đều cho các câu của phần đó
  // nếu câu không tự khai báo điểm riêng.
  interface SectionHint { mode: 'multiple_choice' | 'essay'; fromBlockIndex: number; points?: number }
  const sectionHints: SectionHint[] = []

  // Regex nhận diện bắt đầu một câu hỏi:
  // "Câu 1:", "Câu 1.", "Câu 1 -", "Bài 1:", "1.", "1)", "1:", "1/"
  // EXAM-MIXED: cho phép chú thích điểm giữa số câu và dấu câu —
  // "Câu 4 (5 điểm): ..." / "1. (0,5 đ) ..." là MỘT câu hỏi mới, không phải
  // phần tiếp theo của câu trước (trước đây bị dính khối làm sai số câu).
  const questionStartRegex = /^(?:(?:câu|bài|question)\s*(\d+)|(\d+))(?:\s*\([^)]*\))?\s*[:.)\-/]\s*(.*)$/i

  const parseLines = endKeyLineIndex !== -1 && hasEndKeySection ? lines.slice(0, endKeyLineIndex) : lines

  for (const line of parseLines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // EXAM-MIXED: tiêu đề phần ("PHẦN I. TRẮC NGHIỆM", "PHẦN II. TỰ LUẬN") đổi mode
    // phân tích và KHÔNG được coi là câu hỏi/nội dung.
    const secMode = detectSectionMode(trimmed)
    if (secMode) {
      if (currentBlock.length > 0) {
        questionBlocks.push(currentBlock)
        blockMetas.push({ mode: currentSectionMode })
        currentBlock = []
      }
      currentSectionMode = secMode
      sectionHints.push({ mode: secMode, fromBlockIndex: questionBlocks.length, points: extractPointsHint(trimmed) })
      continue
    }

    if (questionStartRegex.test(trimmed)) {
      if (currentBlock.length > 0) {
        questionBlocks.push(currentBlock)
        blockMetas.push({ mode: currentSectionMode })
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
    blockMetas.push({ mode: currentSectionMode })
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
          type: 'multiple_choice',
          options: { A: 'Phương án A', B: 'Phương án B', C: 'Phương án C', D: 'Phương án D' },
          correctOption: endKeyMap[i] || 'A',
        })
      }
      return {
        ok: true,
        questions: fallbackQuestions,
        answerKey: { ...endKeyMap },
        questionCount: qCount,
        ...computeStats(fallbackQuestions),
        errors: [],
        warnings: ['Chỉ tìm thấy bảng đáp án (không có nội dung câu hỏi chi tiết). Đã tạo danh sách câu hỏi mặc định.'],
      }
    }

    return {
      ok: false,
      questions: [],
      answerKey: {},
      questionCount: 0,
      ...emptyStats(),
      errors: ['Không tìm thấy câu hỏi nào. Hãy chắc chắn câu hỏi bắt đầu bằng "Câu 1:", "Câu 2:" hoặc "1.", "2.".'],
      warnings: [],
    }
  }

  const parsedQuestions: ExamQuestion[] = []
  const parsedAnswerKey: Record<number, MultipleChoiceOption> = {}
  // EXAM-MIXED: ánh xạ block index → question index (phục vụ phân bổ điểm theo phần).
  const blockIndexToQuestion: (number | undefined)[] = []

  // 3. Phân tích từng khối câu hỏi
  for (let bIndex = 0; bIndex < questionBlocks.length; bIndex++) {
    const block = questionBlocks[bIndex]
    const firstLine = block[0]
    const startMatch = firstLine.match(questionStartRegex)
    // EXAM-MIXED: mode của phần mà block này thuộc về.
    const blockMode = blockMetas[bIndex]?.mode ?? 'multiple_choice'

    const explicitIndex = startMatch ? parseInt(startMatch[1] || startMatch[2], 10) : bIndex + 1
    const questionIndex = isNaN(explicitIndex) ? bIndex + 1 : explicitIndex

    let questionText = startMatch ? (startMatch[3] || '').trim() : firstLine

    // ── EXAM-MIXED: câu TỰ LUẬN — toàn bộ khối là nội dung câu hỏi ──
    if (blockMode === 'essay') {
      let essayText = questionText
      for (let l = 1; l < block.length; l++) {
        const line = block[l].trim()
        if (!line) continue
        essayText += ' ' + line
      }
      // Điểm riêng của câu "(3 điểm)" nếu có; phần còn lại được phân bổ từ
      // tiêu đề phần ở pass sau. Chú ý: marker có thể nằm ở PREFIX dòng
      // ("Câu 4 (5 điểm): ...") nên soi cả dòng đầu đầy đủ.
      const ownPoints = extractPointsHint(firstLine) ?? extractPointsHint(essayText)
      // Gỡ chú thích điểm khỏi nội dung hiển thị.
      const cleanedText = essayText.replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*(?:điểm|diem|đ|points?)\s*\)/gi, '').trim()
      parsedQuestions.push({
        index: questionIndex,
        question: cleanedText || `Câu tự luận số ${questionIndex}`,
        type: 'essay',
        ...(ownPoints !== undefined ? { points: ownPoints } : {}),
      })
      blockIndexToQuestion[bIndex] = questionIndex
      continue
    }

    const options: { A: string; B: string; C: string; D: string } = {
      A: '',
      B: '',
      C: '',
      D: '',
    }
    let correctOption: MultipleChoiceOption | null = endKeyMap[questionIndex] || null

    // Regex nhận diện phương án: "A.", "A)", "A:", "[A]", "*A.", "*A)", "(A)"
    const optionRegex = /^(?:\*|\[|\()?([A-D])(?:\*|\]|\))?[\s.:)-]*(.*)$/i

    // Regex nhận diện dòng đáp án riêng: "Đáp án: A", "Đ/A: B", "Key: C", "Chọn: D"
    const inlineAnswerRegex = /(?:đáp\s*án|đ\/a|key|chọn|ans)\s*[:.-]?\s*([A-D])/i

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
      const multiOptMatches = Array.from(line.matchAll(/(?:^|[\s\t]+)(?:\*|\[|\()?([A-D])(?:\*|\]|\))?[\s.:)-]+([^A-D\n\r]*?)(?=(?:[\s\t]+(?:\*|\[|\()?[A-D](?:\*|\]|\))?[\s.:)-])|$)/gi))

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

    // Điểm riêng khai báo trên dòng câu hỏi "(0,5 điểm)" nếu có (kể cả ở prefix
    // "Câu 1 (0,5 điểm): ..." — phần prefix không vào questionText).
    const mcOwnPoints = extractPointsHint(firstLine)
    blockIndexToQuestion[bIndex] = questionIndex

    parsedQuestions.push({
      index: questionIndex,
      question: questionText || `Câu hỏi số ${questionIndex}`,
      type: 'multiple_choice',
      options: {
        A: options.A || 'Phương án A',
        B: options.B || 'Phương án B',
        C: options.C || 'Phương án C',
        D: options.D || 'Phương án D',
      },
      correctOption,
      ...(mcOwnPoints !== undefined ? { points: mcOwnPoints } : {}),
    })
  }

  // ── EXAM-MIXED: phân bổ điểm khai báo ở TIÊU ĐỀ PHẦN cho các câu chưa có điểm riêng ──
  for (let hIdx = 0; hIdx < sectionHints.length; hIdx++) {
    const hint = sectionHints[hIdx]
    if (hint.points === undefined) continue
    const startB = hint.fromBlockIndex
    const endB = sectionHints[hIdx + 1]?.fromBlockIndex ?? questionBlocks.length
    const memberIndexes = new Set<number>()
    for (let b = startB; b < endB; b++) {
      const qi = blockIndexToQuestion[b]
      if (qi !== undefined) memberIndexes.add(qi)
    }
    const members = parsedQuestions.filter(q => memberIndexes.has(q.index) && q.points === undefined)
    if (members.length > 0) {
      const each = Math.round((hint.points / members.length) * 100) / 100
      members.forEach(m => { m.points = each })
      warnings.push(`Phần ${hint.mode === 'essay' ? 'TỰ LUẬN' : 'TRẮC NGHIỆM'} (${hint.points}đ): chia đều ${each}đ/câu cho ${members.length} câu.`)
    }
  }

  // Sắp xếp theo thứ tự câu
  parsedQuestions.sort((a, b) => a.index - b.index)

  // Giới hạn tối đa 50 câu (khớp mẫu phiếu OMR)
  const clampedQuestions = parsedQuestions.slice(0, MAX_EXAM_QUESTIONS)
  if (parsedQuestions.length > MAX_EXAM_QUESTIONS) {
    warnings.push(`Đề thi có ${parsedQuestions.length} câu. Hệ thống đã giới hạn lấy ${MAX_EXAM_QUESTIONS} câu đầu tiên.`)
  }
  const mcClampedCount = clampedQuestions.filter(q => (q.type ?? 'multiple_choice') === 'multiple_choice').length
  if (mcClampedCount > MAX_EXAM_QUESTIONS) {
    warnings.push(`Phần trắc nghiệm có ${mcClampedCount} câu — vượt giới hạn ${MAX_EXAM_QUESTIONS} ô của phiếu OMR.`)
  }

  // Đồng bộ lại index 1..N và answerKey — CHỈ gồm câu TRẮC NGHIỆM.
  const finalAnswerKey: Record<number, MultipleChoiceOption> = {}
  clampedQuestions.forEach((q, idx) => {
    // Chuẩn hóa index từ 1..N
    const finalIndex = idx + 1
    q.index = finalIndex
    if ((q.type ?? 'multiple_choice') === 'multiple_choice' && q.correctOption) {
      finalAnswerKey[finalIndex] = q.correctOption
    }
  })

  const stats = computeStats(clampedQuestions)
  if (stats.essayQuestionCount > 0) {
    const orphanKeys = Object.keys(endKeyMap).filter(k => {
      const q = clampedQuestions.find(x => x.index === Number(k))
      return q && (q.type ?? 'multiple_choice') === 'essay'
    })
    if (orphanKeys.length > 0) {
      warnings.push(`Bảng đáp án chứa câu ${orphanKeys.join(', ')} thuộc phần tự luận — bỏ qua (câu tự luận không chấm bằng key).`)
    }
  }

  return {
    ok: clampedQuestions.length > 0,
    questions: clampedQuestions,
    answerKey: finalAnswerKey,
    questionCount: clampedQuestions.length,
    ...stats,
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
 * EXAM-MIXED — định dạng mở rộng (tương thích ngược với 7 cột cũ):
 * - Cột "Loại" (Trắc nghiệm/Tự luận) và cột "Điểm" là TÙY CHỌN. Thiếu "Loại"
 *   → toàn bộ hiểu là trắc nghiệm (giữ nguyên behavior cũ).
 */
export async function parseExamFromExcel(buffer: ArrayBuffer | Uint8Array): Promise<ExamParseResult> {
  // PERF-XLSX-1: lazy-load xlsx — chunk chỉ tải khi user import file Excel.
  const XLSX = await loadXlsx()
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
        ...emptyStats(),
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
        ...emptyStats(),
        errors: ['File Excel không có dữ liệu câu hỏi.'],
        warnings: [],
      }
    }

    // Bỏ qua dòng tiêu đề nếu dòng 1 chứa chữ "Câu", "Nội dung", "Question"...
    let startIndex = 0
    // EXAM-MIXED: map cột THEO TÊN HEADER khi có dòng tiêu đề — hỗ trợ cả layout
    // cũ 7 cột lẫn layout mở rộng có "Loại"/"Điểm" xen giữa. Không tìm được
    // header nào → fallback về vị trí cố định (tương thích ngược tuyệt đối).
    interface ColumnMap {
      question: number      // nội dung câu hỏi
      optionA: number       // các phương án
      optionB: number
      optionC: number
      optionD: number
      answer: number        // đáp án đúng
      type?: number         // loại câu (TN/TL)
      points?: number       // điểm câu
    }
    let columnMap: ColumnMap | null = null
    const firstRowStr = JSON.stringify(rows[0] || []).toLowerCase()
    if (firstRowStr.includes('câu') || firstRowStr.includes('nội dung') || firstRowStr.includes('question') || firstRowStr.includes('đáp án')) {
      startIndex = 1
      const headers: string[] = (rows[0] || []).map((h: unknown) => String(h ?? '').trim().toLowerCase())
      const findCol = (...patterns: RegExp[]): number =>
        headers.findIndex(h => h.length > 0 && patterns.some(p => p.test(h)))
      const questionCol = findCol(/nội\s*dung|noi\s*dung|câu\s*hỏi|question/)
      const optACol = findCol(/lựa\s*chọn\s*a|phương\s*án\s*a|^a$|^a\b/)
      const optBCol = findCol(/lựa\s*chọn\s*b|phương\s*án\s*b|^b$|^b\b/)
      const optCCol = findCol(/lựa\s*chọn\s*c|phương\s*án\s*c|^c$|^c\b/)
      const optDCol = findCol(/lựa\s*chọn\s*d|phương\s*án\s*d|^d$|^d\b/)
      const answerCol = findCol(/đáp\s*án|dap\s*an|answer|key/)
      const typeCol = findCol(/loại|loai|question\s*type|^type$/)
      const pointsCol = findCol(/điểm|^diem|point/)
      if (questionCol !== -1 && answerCol !== -1) {
        columnMap = {
          question: questionCol,
          optionA: optACol !== -1 ? optACol : 2,
          optionB: optBCol !== -1 ? optBCol : 3,
          optionC: optCCol !== -1 ? optCCol : 4,
          optionD: optDCol !== -1 ? optDCol : 5,
          answer: answerCol,
          ...(typeCol !== -1 ? { type: typeCol } : {}),
          ...(pointsCol !== -1 ? { points: pointsCol } : {}),
        }
      }
    }
    // Fallback vị trí cố định khi không nhận diện được header.
    const cols: ColumnMap = columnMap ?? { question: 1, optionA: 2, optionB: 3, optionC: 4, optionD: 5, answer: 6 }

    /** Chuẩn hóa ô "Loại": TL/Tự luận/Essay → essay; còn lại → multiple_choice. */
    const parseTypeCell = (cell: unknown): 'multiple_choice' | 'essay' => {
      const value = String(cell ?? '').trim().toLowerCase()
      if (/^tl\b|tự luận|tu luan|essay/.test(value)) return 'essay'
      return 'multiple_choice'
    }
    const parsePointsCell = (cell: unknown): number | undefined => {
      if (cell === null || cell === undefined || String(cell).trim() === '') return undefined
      const value = parseFloat(String(cell).replace(',', '.'))
      return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : undefined
    }

    const parsedQuestions: ExamQuestion[] = []
    const parsedAnswerKey: Record<number, MultipleChoiceOption> = {}

    for (let r = startIndex; r < rows.length; r++) {
      const row = rows[r]
      if (!row || row.length === 0 || !row[0]) continue

      // Hỗ trợ format 7 cột hoặc format 2 cột (Câu, Đáp án)
      const qIndex = parseInt(String(row[0]), 10) || parsedQuestions.length + 1
      const finalIndex = parsedQuestions.length + 1
      const qText = String(row[cols.question] || '').trim() || `Câu hỏi ${qIndex}`
      const optA = String(row[cols.optionA] || '').trim() || 'Phương án A'
      const optB = String(row[cols.optionB] || '').trim() || 'Phương án B'
      const optC = String(row[cols.optionC] || '').trim() || 'Phương án C'
      const optD = String(row[cols.optionD] || '').trim() || 'Phương án D'

      // EXAM-MIXED: loại câu hỏi từ cột "Loại" (mặc định trắc nghiệm khi thiếu cột).
      const rowType = cols.type !== undefined ? parseTypeCell(row[cols.type]) : 'multiple_choice'
      const rowPoints = cols.points !== undefined ? parsePointsCell(row[cols.points]) : undefined

      if (rowType === 'essay') {
        // Câu tự luận: không cần A–D/đáp án; nội dung khác trống là đủ.
        if (!String(row[1] || '').trim()) {
          warnings.push(`Dòng ${r + 1}: câu tự luận thiếu nội dung — bỏ qua.`)
          continue
        }
        parsedQuestions.push({
          index: finalIndex,
          question: qText,
          type: 'essay',
          ...(rowPoints !== undefined ? { points: rowPoints } : {}),
        })
        if (parsedQuestions.length >= MAX_EXAM_QUESTIONS) {
          warnings.push(`Đã đạt giới hạn ${MAX_EXAM_QUESTIONS} câu hỏi tối đa.`)
          break
        }
        continue
      }

      // QB-F1 (audit 2026-08-21): ô đáp án TRỐNG/KHÔNG HỢP LỆ phải mặc định 'A'
      // kèm warning — tuyệt đối KHÔNG fallback sang nội dung phương án A rồi trích
      // chữ [A-D] (trước đây "Bác Hồ" → B, "Du lịch biển" → D im lặng, làm hỏng
      // answerKey → đề in và chấm OMR sai theo). Chấp nhận dạng dài hợp lệ như
      // "Đáp án: C" bằng cách trích chữ trong CHÍNH Ô ĐÁP ÁN.
      const rawAnswerCell = String(row[cols.answer] ?? '').trim()
      let correctOption: MultipleChoiceOption
      if (!rawAnswerCell) {
        warnings.push(`Câu ${finalIndex}: Thiếu đáp án đúng trong file Excel. Mặc định gán là A.`)
        correctOption = 'A'
      } else {
        const normalizedAnswer = rawAnswerCell.toUpperCase()
        const answerMatch = normalizedAnswer.match(/^[A-D]$/) || normalizedAnswer.match(/[A-D]/)
        if (answerMatch) {
          correctOption = answerMatch[0] as MultipleChoiceOption
        } else {
          warnings.push(`Câu ${finalIndex}: Đáp án "${rawAnswerCell}" không hợp lệ (cần A/B/C/D). Mặc định gán là A.`)
          correctOption = 'A'
        }
      }

      parsedQuestions.push({
        index: finalIndex,
        question: qText,
        type: 'multiple_choice',
        options: { A: optA, B: optB, C: optC, D: optD },
        correctOption,
        ...(rowPoints !== undefined ? { points: rowPoints } : {}),
      })
      parsedAnswerKey[finalIndex] = correctOption

      if (parsedQuestions.length >= MAX_EXAM_QUESTIONS) {
        warnings.push(`Đã đạt giới hạn ${MAX_EXAM_QUESTIONS} câu hỏi tối đa cho mẫu phiếu OMR.`)
        break
      }
    }

    // Chuẩn hóa index liên tục 1..N sau khi bỏ qua dòng lỗi.
    parsedQuestions.forEach((q, idx) => {
      const finalIdx = idx + 1
      if ((q.type ?? 'multiple_choice') === 'multiple_choice' && q.correctOption) {
        parsedAnswerKey[finalIdx] = q.correctOption
        if (q.index !== finalIdx) delete parsedAnswerKey[q.index]
      }
      q.index = finalIdx
    })

    return {
      ok: parsedQuestions.length > 0,
      questions: parsedQuestions,
      answerKey: parsedAnswerKey,
      questionCount: parsedQuestions.length,
      ...computeStats(parsedQuestions),
      errors,
      warnings,
    }
  } catch (err: any) {
    return {
      ok: false,
      questions: [],
      answerKey: {},
      questionCount: 0,
      ...emptyStats(),
      errors: [`Lỗi đọc file Excel: ${err?.message || 'Định dạng không hợp lệ'}`],
      warnings: [],
    }
  }
}

/**
 * Generates sample exam text template for users to copy/paste and test.
 * UI-POLISH 2026-08-25: theo scope — ô import TN chỉ dán mẫu TN, ô TL chỉ mẫu TL.
 */
export function generateSampleExamTemplateText(scope: ExamImportScope = 'both'): string {
  const header = `ĐỀ KIỂM TRA GIÁO LÝ & PHỤNG VỤ THIẾU NHI
Thời gian làm bài: 60 phút${scope === 'both' ? ' (Đề gồm 6 câu trắc nghiệm và 2 câu tự luận)' : scope === 'multiple_choice' ? ' (Phần trắc nghiệm)' : ' (Phần tự luận)'}

`

  const mcBlock = `PHẦN I. TRẮC NGHIỆM (3 điểm)

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

Câu 4: Khẩu hiệu của Phong trào Thiếu Nhi Thánh Thể Việt Nam là gì?
A. Hy Sinh - Cầu Nguyện
B. Yêu Thương - Phục Vụ
*C. Cầu Nguyện - Rước Lễ - Hy Sinh - Làm Tông Đồ
D. Vâng Lời - Khiêm Nhường

Câu 5: Màu áo khăn quàng của Ngành Thiếu Nhi là màu gì?
A. Màu hồng viền đỏ
B. Màu xanh biển viền vàng
C. Màu đỏ viền trắng
D. Màu tím
Đáp án: B

Câu 6: Mùa Phụng Vụ nào mở đầu cho một Năm Phụng Vụ mới?
*A. Mùa Vọng
B. Mùa Giáng Sinh
C. Mùa Chay
D. Mùa Phục Sinh
`

  const essayBlock = `PHẦN II. TỰ LUẬN (7 điểm)

Câu 1 (3 điểm): Trình bày ý nghĩa của Bí tích Thánh Thể đối với đời sống thiếu nhi TNTT.

Câu 2 (4 điểm): Nêu 4 khẩu hiệu của Phong trào Thiếu Nhi Thánh Thể Việt Nam và cho biết em hiểu như thế nào về khẩu hiệu ấy trong cuộc sống hằng ngày của em?
`

  if (scope === 'multiple_choice') return header + mcBlock
  if (scope === 'essay') return header + essayBlock
  // Đề gộp: câu TL tiếp thị số 7, 8 sau 6 câu TN (giữ format gốc).
  return header + mcBlock + '\n' + essayBlock
    .replace('Câu 1 (3 điểm)', 'Câu 7 (3 điểm)')
    .replace('Câu 2 (4 điểm)', 'Câu 8 (4 điểm)')
}

/**
 * Generates sample Excel workbook for downloading.
 */
export async function generateSampleExcelWorkbook(): Promise<Uint8Array> {
  const XLSX = await loadXlsx()
  const data = [
    // EXAM-MIXED: 9 cột gồm "Loại" (TN/TL) và "Điểm" — tùy chọn, có thể bỏ trống.
    ['Câu Số', 'Loại', 'Nội Dung Câu Hỏi', 'Lựa Chọn A', 'Lựa Chọn B', 'Lựa Chọn C', 'Lựa Chọn D', 'Đáp Án Đúng (A/B/C/D)', 'Điểm'],
    [1, 'Trắc nghiệm', 'Bí tích nào là cội nguồn và chóp đỉnh của đời sống Kitô hữu?', 'Bí tích Rửa Tội', 'Bí tích Thánh Thể', 'Bí tích Thêm Sức', 'Bí tích Hòa Giải', 'B', 0.5],
    [2, 'Trắc nghiệm', 'Chúa Giêsu lập Bí tích Thánh Thể trong dịp nào?', 'Tiệc cưới Cana', 'Bữa Tiệc Ly', 'Sau khi sống lại', 'Trên đồi Can-vê', 'B', 0.5],
    [3, 'Trắc nghiệm', 'Mười Điều Răn Đức Chúa Trời được ban cho ai trên núi Sinai?', 'Ông Môsê', 'Ông Abraham', 'Vua Đavít', 'Ngôn sứ Êlia', 'A', 0.5],
    [4, 'Trắc nghiệm', 'Khẩu hiệu của Thiếu Nhi Thánh Thể là gì?', 'Hy Sinh - Bác Ái', 'Yêu Thương - Phục Vụ', 'Cầu Nguyện - Rước Lễ - Hy Sinh - Làm Tông Đồ', 'Vâng Lời - Khiêm Nhường', 'C', 0.5],
    [5, 'Tự luận', 'Trình bày ý nghĩa của Bí tích Thánh Thể đối với đời sống thiếu nhi.', '', '', '', '', '', 4],
    [6, 'Tự luận', 'Nêu 4 khẩu hiệu của Phong trào TNTT và ý nghĩa với đời sống hằng ngày.', '', '', '', '', '', 6],
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 45 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 20 },
    { wch: 10 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_De_Thi')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Uint8Array(out)
}
