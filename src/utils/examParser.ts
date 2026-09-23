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
  /**
   * ESSAY-DECODE (2026-09-23): hình thức hệ thống TỰ NHẬN DIỆN từ nội dung đã
   * dán/đã đọc (TN / TL / kết hợp) — dùng để báo cho người dùng biết đề đã decode
   * thành gì trước khi áp dụng.
   */
  detectedForm?: ExamDetectedForm
}

/** Hình thức đề do parser nhận diện từ dữ liệu (không phải lựa chọn của người dùng). */
export type ExamDetectedForm = 'multiple_choice' | 'essay' | 'mixed'

/** Tuỳ chọn decode: `intent` = ô import người dùng đang dán vào (quyết định fallback). */
export interface ExamParseOptions {
  intent?: ExamImportScope
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

// ────────────────────────────────────────────────────────────────────────────
// ESSAY-DECODE (2026-09-23): nâng cấp cơ chế decode khi import đề TỰ LUẬN.
// Lỗi đã tái lập trước khi sửa (probe `examParser` trên đề thật):
//  1. Đề tự luận KHÔNG có tiêu đề phần ("PHẦN TỰ LUẬN") bị decode thành trắc
//     nghiệm với phương án giả + đáp án mặc định A → ô import "Phần Tự Luận"
//     báo "Không tìm thấy câu hỏi tự luận nào" (không import được).
//  2. Câu hỏi con đánh số lại trong câu ("1.", "2.") bị tách thành câu mới và
//     chia lại điểm sai (2 câu/10đ → 4 câu/20đ).
//  3. Khối "BIỂU ĐIỂM"/"ĐÁP ÁN"/"HƯỚNG DẪN CHẤM" ở cuối đề bị decode thành câu
//     hỏi rác; dòng "Đáp án: ..." trong đề bị in lẫn vào đề phát cho học sinh.
//  4. Excel có cột "Nội dung" không ở vị trí 1 → câu tự luận mất nội dung.
// Các hằng số/dò tìm dưới đây giữ nguyên hành vi cũ cho đề trắc nghiệm.
// ────────────────────────────────────────────────────────────────────────────

/** Ký tự vô hình (Word / Google Docs / Markdown) làm regex mốc câu hỏi không khớp. */
const INVISIBLE_CHARS_REGEX = /[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g
/** Khoảng trắng "lạ" (NBSP, narrow NBSP, ideographic space) → space thường. */
const ODD_SPACES_REGEX = /[\u00a0\u2007\u202f\u3000]/g

/**
 * Chuẩn hoá văn bản dán TRƯỚC khi decode: HTML entity, ký tự vô hình, NBSP,
 * ký tự full-width (chữ số/chữ cái/dấu câu do IME hoặc Word), heading + nhấn
 * mạnh Markdown, bullet chỉ khi phần còn lại thực sự là mốc câu hỏi.
 * KHÔNG đụng tới marker đáp án một sao `*A.` (bất biến QB-F1).
 */
export function normalizeExamText(raw: string): string {
  if (!raw) return ''
  const flattened = raw
    .replace(/\r\n?/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(INVISIBLE_CHARS_REGEX, '')
    .replace(ODD_SPACES_REGEX, ' ')
    // Full-width ！..～ (gồm ０-９ Ａ-Ｚ ： （ ）) → ASCII tương ứng.
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  return flattened
    .split('\n')
    .map(line => {
      let out = line.trimEnd()
      out = out.replace(/^\s{0,3}#{1,6}\s+/, '')          // "# Tiêu đề" / "## Phần II"
      out = out.replace(/\*\*/g, '').replace(/__/g, '')    // **đậm** / __đậm__
      return out.replace(/^\s*[-+*]\s+(?=(?:câu|bài|question)\s*\d|\d{1,2}\s*[.:)\-/–—])/i, '')
    })
    .join('\n')
}

/**
 * Mốc câu hỏi (TN + TL): "Câu 1:", "Câu hỏi 1.", "Bài 1)", "1.", "1/",
 * "Question 1 -". ESSAY-DECODE: thêm "câu hỏi" và gạch ngang en/em (Word
 * AutoCorrect biến "- " thành "– ").
 */
const QUESTION_START_REGEX = /^(?:(?:câu\s*hỏi|câu|bài|question)\s*(\d+)|(\d+))(?:\s*\([^)]*\))?\s*[:.)\-/–—]\s*(.*)$/i

/** Mốc TỰ LUẬN nới lỏng: "Câu 1 (2 điểm) Trình bày..." (thiếu dấu phân cách). */
const ESSAY_LOOSE_START_REGEX = /^(?:câu\s*hỏi|câu|bài|question)\s*(\d+)(?:\s*\([^)]*\))?\s*[-–—:.]?\s*(\S.*)$/i

/** Mốc số trần (không có chữ "Câu"): "1. Nêu 4 khẩu hiệu TNTT." */
const BARE_NUMBER_START_REGEX = /^(\d{1,2})(?:\s*\([^)]*\))?\s*[:.)\-/–—]\s*(\S.*)$/

/** Phương án A–D (nhiều phương án trên 1 dòng) — dùng để nhận biết bằng chứng TN. */
/** Mốc phương án A-D CHỈ chữ HOA (đếm bằng chứng TN) + nhiều PA trên 1 dòng (tempered-greedy). */
const OPTION_MARKER_SOURCE = String.raw`(?:^|[\s\t]+)(?:\*|\[|\(|\()?([A-D])(?:\*|\]|\))?[\s.:)\-–—]+`;
const MULTI_OPTION_REGEX = new RegExp(
  OPTION_MARKER_SOURCE + String.raw`((?:(?![\s\t]+(?:\*|\[|\(|\()?([A-D])(?:\*|\]|\))?[\s.:)\-–—]).)*?)(?=[\s\t]+(?:\*|\[|\(|\()?([A-D])(?:\*|\]|\))?[\s.:)\-–—]|$)`,
  "gi",
);

/**
 * Dòng đáp án trắc nghiệm inline. ESSAY-DECODE: chặn hậu tố chữ cái để
 * "Đáp án: Cần nêu 4 ý" KHÔNG còn bị hiểu là đáp án C (cùng lớp lỗi QB-F1).
 */
const INLINE_ANSWER_REGEX = /(?:đáp\s*án|đ\/a|key|chọn|ans)\s*[:.-]?\s*([A-D])(?![A-Za-zÀ-ỹ])/i

/** Nhãn khối KHÔNG phải câu hỏi ở cuối đề — khớp CẢ dòng nhãn lẫn dòng mở đầu
 * khối đáp án/biểu điểm (VD "BIỂU ĐIỂM VÀ HƯỚNG DẪN CHẤM:", "Đáp án và biểu điểm"). */
const TRAILING_BLOCK_LABEL_REGEX = new RegExp(
  '^(?:(?:phần|phan|part)\\s*)?' +
  '(?:(?:[IVX]{1,5}|\\d{1,2})\\s*[.:)\\-–]\\s*)?' +
  '(?:đáp\\s*án(?:\\s*(?:và|&|,)\\s*(?:biểu\\s*điểm|thang\\s*điểm))?' +
  '|hướng\\s*dẫn\\s*chấm(?:\\s*bài)?' +
  '|biểu\\s*điểm|thang\\s*điểm' +
  '|gợi\\s*ý(?:\\s*(?:chấm|trả\\s*lời|làm\\s*bài))?' +
  '|answer\\s*key)' +
  '(?:\\s+(?:và|&|,)\\s+(?:biểu\\s*điểm|thang\\s*điểm|hướng\\s*dẫn\\s*chấm(?:\\s*bài)?|gợi\\s*ý(?:\\s*(?:chấm|trả\\s*lời|làm\\s*bài))?))*' +
  '\\s*(?:\\([^)]*\\))?\\s*[:.\\-–]?\\s*$',
  'i',
)

/** Dòng đáp án/tiêu chí chấm nằm TRONG câu tự luận → tách sang `explanation`. */
const RUBRIC_LINE_REGEX = /^\s*(?:đáp\s*án|đ\/a|hướng\s*dẫn\s*chấm|biểu\s*điểm|thang\s*điểm|gợi\s*ý(?:\s*(?:chấm|trả\s*lời|làm\s*bài))?|answer\s*key|answer)\s*[:.\-–]\s*(.+)$/i

/** Điểm chú thích "(3 điểm)" / "(0,5 đ)" — gỡ khỏi nội dung hiển thị. */
const POINTS_ANNOTATION_REGEX = /\s*\(\s*\d+(?:[.,]\d+)?\s*(?:điểm|diem|đ|d|points?)\s*\)/gi

interface QuestionEvidence {
  /** Số phương án A–D nhận diện được (>= 2 coi như bằng chứng trắc nghiệm). */
  optionMarkers: number
  /** Số dòng đáp án inline A–D. */
  answerLines: number
}

function collectEvidence(lines: string[]): QuestionEvidence {
  const evidence: QuestionEvidence = { optionMarkers: 0, answerLines: 0 }
  for (const line of lines) {
    evidence.optionMarkers += Array.from(line.matchAll(MULTI_OPTION_REGEX)).length
    if (INLINE_ANSWER_REGEX.test(line)) evidence.answerLines += 1
  }
  return evidence
}

/** Bằng chứng trắc nghiệm của một khối/câu hỏi (>= 2 phương án hoặc có dòng đáp án). */
function hasMultipleChoiceEvidence(lines: string[]): boolean {
  const evidence = collectEvidence(lines)
  return evidence.optionMarkers >= 2 || evidence.answerLines > 0
}

/** Ký tự mở đầu "đủ tin" để coi là mốc câu tự luận khi thiếu dấu phân cách. */
function startsLikePrompt(text: string): boolean {
  const first = text.trim().charAt(0)
  if (!first) return false
  if (/[0-9"'“”‘’([]/.test(first)) return true
  return first !== first.toLowerCase()
}

type QuestionMode = 'multiple_choice' | 'essay'

interface SectionRange {
  /** 'auto' = không có tiêu đề phần → resolve theo bằng chứng nội dung. */
  mode: QuestionMode | 'auto'
  startLine: number
  endLine: number
  points?: number
}

/** Cắt văn bản thành các phần theo tiêu đề phần; không có tiêu đề → 1 phần 'auto'. */
function buildSectionRanges(lines: string[]): SectionRange[] {
  const ranges: SectionRange[] = []
  let current: SectionRange | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const mode = line ? detectSectionMode(line) : null
    if (mode) {
      if (current) {
        current.endLine = i
        ranges.push(current)
      }
      current = { mode, startLine: i + 1, endLine: lines.length, points: extractPointsHint(line) }
      continue
    }
    if (!current) current = { mode: 'auto', startLine: 0, endLine: lines.length }
  }
  if (current) {
    current.endLine = lines.length
    ranges.push(current)
  }
  return ranges
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
  const otherLabel = scope === 'essay' ? 'trắc nghiệm' : 'tự luận'
  const warnings = [...result.warnings]
  if (dropped > 0) {
    warnings.unshift(`Đã bỏ qua ${dropped} câu ${otherLabel} — ô import này chỉ nhận phần ${scopeLabel}.`)
  }
  if (kept.length === 0) {
    // ESSAY-DECODE: lỗi phải nói rõ hệ thống đã decode được GÌ để người dùng biết
    // dán vào ô nào (trước đây chỉ báo "không tìm thấy" — không hành động được).
    const detected = result.detectedForm ?? detectedFormOf(result)
    const otherCount = result.questions.filter(q => scope === 'essay' ? !isEssayQuestion(q) : isEssayQuestion(q)).length
    const hint = otherCount > 0
      ? `Nội dung đã dán được nhận diện là ${otherLabel.toUpperCase()} (${otherCount} câu${scope === 'essay' ? ' có phương án A–D/đáp án trắc nghiệm' : ''}) — hãy dán vào ô "Phần ${scope === 'essay' ? 'Trắc Nghiệm' : 'Tự Luận'}".`
      : 'Chưa nhận diện được câu hỏi nào — mỗi câu cần bắt đầu bằng "Câu 1:", "1." hoặc "Bài 1:".'
    return {
      ok: false,
      questions: [],
      answerKey: {},
      questionCount: 0,
      ...emptyStats(),
      detectedForm: detected,
      errors: [`Không tìm thấy câu hỏi ${scopeLabel} nào trong nội dung đã dán. ${hint}`],
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
    // Keep recognition of the original document for the preview even when a
    // TN/TL import box filters the other question type from the applied data.
    detectedForm: result.detectedForm ?? detectedFormOf(result),
    warnings,
  }
}

function emptyStats() {
  return { mcQuestionCount: 0, essayQuestionCount: 0, totalPoints: 0, mcPoints: 0, essayPoints: 0 }
}

/** Hình thức nhận diện từ số câu TN/TL đã decode. */
function detectedFormOf(stats: { mcQuestionCount: number; essayQuestionCount: number }): ExamDetectedForm {
  if (stats.essayQuestionCount === 0) return 'multiple_choice'
  if (stats.mcQuestionCount === 0) return 'essay'
  return 'mixed'
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
  return { ...stats, detectedForm: detectedFormOf(stats) }
}

/**
 * Parses an exam paper from raw text (Word paste, Markdown, plain text).
 * Handles flexible question headers (Câu 1, 1., 1/, Question 1...),
 * options (A., A), [A], *A), and answer keys (inline, marked, or end list).
 *
 * ESSAY-DECODE (2026-09-23): `options.intent` cho biết ô import người dùng đang
 * dán vào — dùng để cứu phần tự luận khi đề không có tiêu đề phần:
 *  - Không tiêu đề phần + KHÔNG có phương án A–D/đáp án nào → toàn bộ là TỰ LUẬN
 *    (trước đây bị decode thành TN với phương án giả + đáp án A).
 *  - `intent='essay'` → câu không có bằng chứng trắc nghiệm (kể cả dãy câu cuối
 *    của đề gộp dán chung không tiêu đề) được decode thành tự luận.
 *  - `intent='multiple_choice'` → giữ nguyên hành vi cũ cho đề trắc nghiệm.
 */
export function parseExamFromText(rawText: string, options: ExamParseOptions = {}): ExamParseResult {
  const intent = options.intent ?? 'both'
  const errors: string[] = []
  const warnings: string[] = []

  if (!rawText || !rawText.trim()) {
    return {
      ok: false,
      questions: [],
      answerKey: {},
      questionCount: 0,
      ...emptyStats(),
      detectedForm: 'multiple_choice',
      errors: ['Nội dung đề thi đang rỗng. Hãy dán đề thi hoặc tải file Excel.'],
      warnings: [],
    }
  }

  // 0. Chuẩn hoá text trước khi decode (ký tự vô hình / full-width / Markdown).
  const lines = normalizeExamText(rawText).split('\n')

  // 1. Phần "đáp án / biểu điểm / hướng dẫn chấm" ở CUỐI đề: cắt khỏi vùng câu
  // hỏi. Trước đây chỉ cắt khi có bảng đáp án TN; khối biểu điểm của đề tự luận
  // bị decode thành câu hỏi rác (VD "Câu 1: 4 điểm" thành 1 câu hỏi).
  const endKeyMap: Record<number, MultipleChoiceOption> = {}
  let hasEndKeySection = false

  const endKeyHeaderRegex = /(?:bảng\s+đáp\s+án|đáp\s+án\s+trắc\s+nghiệm|đáp\s+án\s+toàn\s+bộ|tổng\s+hợp\s+đáp\s+án|bảng\s+key|answer\s*key)/i
  let endKeyLineIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (endKeyHeaderRegex.test(line) || TRAILING_BLOCK_LABEL_REGEX.test(line)) {
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
  // EXAM-MIXED: mỗi block ghi lại mode phần tại thời điểm bắt đầu.
  interface QuestionBlockMeta { mode: 'multiple_choice' | 'essay' }
  const blockMetas: QuestionBlockMeta[] = []
  // Điểm khai báo ở TIÊU ĐỀ PHẦN "(6 điểm)" → chia đều cho các câu của phần đó
  // nếu câu không tự khai báo điểm riêng.
  interface SectionHint { mode: 'multiple_choice' | 'essay'; fromBlockIndex: number; points?: number }
  const sectionHints: SectionHint[] = []

  const parseLines = endKeyLineIndex !== -1 ? lines.slice(0, endKeyLineIndex) : lines

  // EXAM-MIXED + ESSAY-DECODE: chia phần theo tiêu đề; phần KHÔNG có tiêu đề
  // ('auto') được resolve theo bằng chứng nội dung thay vì luôn mặc định TN.
  const ranges = buildSectionRanges(parseLines)
  const docEvidence = collectEvidence(parseLines)
  const docLooksMultipleChoice = docEvidence.optionMarkers >= 2 || docEvidence.answerLines > 0 || hasEndKeySection
  const hasExplicitSection = ranges.some(range => range.mode !== 'auto')
  for (const range of ranges) {
    if (range.mode !== 'auto') continue
    const evidence = collectEvidence(parseLines.slice(range.startLine, range.endLine))
    const sectionHasEvidence = evidence.optionMarkers >= 2 || evidence.answerLines > 0
    // Ô import Tự Luận: câu không có bằng chứng trắc nghiệm là câu tự luận (kể cả
    // khi phần còn lại của đề là trắc nghiệm).
    if (intent === 'essay' && !sectionHasEvidence) {
      range.mode = 'essay'
      continue
    }
    // Không tiêu đề + không có bất kỳ bằng chứng trắc nghiệm nào → đề tự luận.
    range.mode = !sectionHasEvidence && !docLooksMultipleChoice ? 'essay' : 'multiple_choice'
  }
  if (!hasExplicitSection && ranges.length === 1 && ranges[0].mode === 'essay') {
    warnings.push('Không thấy tiêu đề phần và không có phương án A–D/đáp án trắc nghiệm → đã nhận diện toàn bộ nội dung là ĐỀ TỰ LUẬN.')
  }


  for (const range of ranges) {
    const mode: QuestionMode = range.mode === 'auto' ? 'multiple_choice' : range.mode
    sectionHints.push({ mode, fromBlockIndex: questionBlocks.length, points: range.points })
    const sectionLines = parseLines.slice(range.startLine, range.endLine).map(line => line.trim())
    const nonEmpty = sectionLines.filter(line => line.length > 0)
    // Phần tự luận KHÔNG có mốc câu nào (giáo viên chỉ ngăn cách bằng dòng trống)
    // → mỗi đoạn văn được coi là 1 câu hỏi.
    const hasMarker = nonEmpty.some(line =>
      QUESTION_START_REGEX.test(line) ||
      (mode === 'essay' && (ESSAY_LOOSE_START_REGEX.test(line) || BARE_NUMBER_START_REGEX.test(line))),
    )
    const paragraphMode = mode === 'essay' && !hasMarker
    if (paragraphMode) {
      warnings.push('Phần tự luận không có mốc "Câu 1:" — hệ thống tách câu theo đoạn (mỗi đoạn cách nhau bởi dòng trống là 1 câu). Kiểm tra lại số câu trong xem trước.')
    }

    let currentBlock: string[] = []
    let explicitSeen = false
    let expectedBare = 1
    let prevLine = ''
    // Chốt block hiện tại (dùng chung cho mốc câu + chế độ đoạn văn).
    const flushBlock = () => {
      if (currentBlock.length === 0) return
      questionBlocks.push(currentBlock)
      blockMetas.push({ mode })
      currentBlock = []
    }

    for (const line of sectionLines) {
      if (!line) {
        // Chế độ đoạn văn: dòng trống kết thúc câu.
        if (paragraphMode) flushBlock()
        continue
      }
      let isNewQuestion = false
      const startMatch = line.match(QUESTION_START_REGEX)
      // Mốc có CHỮ ("Câu 1:", "Bài 1:", "Câu hỏi 1.") = group 1; số trần ("1.") = group 2.
      const hasWordMarker = Boolean(startMatch && startMatch[1] !== undefined)
      if (hasWordMarker) {
        isNewQuestion = true
        explicitSeen = true
        const markerNumber = parseInt(startMatch![1], 10)
        if (Number.isFinite(markerNumber)) expectedBare = markerNumber + 1
      } else if (mode === 'essay') {
        // ESSAY-DECODE: mốc tự luận nới lỏng ("Câu 1 (2 điểm) Trình bày...").
        const looseMatch = line.match(ESSAY_LOOSE_START_REGEX)
        if (looseMatch && startsLikePrompt(looseMatch[2])) {
          isNewQuestion = true
          explicitSeen = true
          expectedBare = parseInt(looseMatch[1], 10) + 1
        } else if (!explicitSeen) {
          // Phần tự luận đánh số trần: "1. ...", "2. ..." — chỉ cắt khi số TIẾP NỐI
          // đúng thứ tự, để câu hỏi con ("1. Ý nghĩa...") trong câu "Câu 1:" không
          // bị tách thành câu mới (lỗi chia điểm 2 câu/10đ → 4 câu/20đ).
          const bareMatch = line.match(BARE_NUMBER_START_REGEX)
          if (bareMatch) {
            const num = parseInt(bareMatch[1], 10)
            const isSequential = num >= expectedBare && num <= expectedBare + 2
            const isSubItemAfterPrompt = prevLine.endsWith(':') && bareMatch[2].length <= 80 && !/[?!:]$/.test(bareMatch[2])
            if (isSequential && !isSubItemAfterPrompt) {
              isNewQuestion = true
              expectedBare = num + 1
            }
          }
        }
      } else if (startMatch) {
        // Đề trắc nghiệm: số trần vẫn là mốc câu mới (giữ nguyên hành vi cũ).
        isNewQuestion = true
        explicitSeen = true
        const markerNumber = parseInt(startMatch[2], 10)
        if (Number.isFinite(markerNumber)) expectedBare = markerNumber + 1
      }
      if (isNewQuestion) {
        flushBlock()
        currentBlock = [line]
      } else if (currentBlock.length > 0) {
        currentBlock.push(line)
      }
      prevLine = line
    }
    flushBlock()
  }

  // ESSAY-DECODE: đề gộp dán chung KHÔNG tiêu đề (ô import Tự Luận) — dãy câu
  // cuối không có phương án A–D là phần tự luận. Chỉ áp dụng cho intent='essay'
  // và chỉ ở ĐUÔI đề nên không thể làm lệch các câu trắc nghiệm phía trước.
  if (intent === 'essay' && !hasExplicitSection) {
    let tailStart = questionBlocks.length
    for (let b = questionBlocks.length - 1; b >= 0; b--) {
      if (blockMetas[b].mode === 'essay') break
      const block = questionBlocks[b]
      if (hasMultipleChoiceEvidence(block)) break
      const joined = block.join(' ')
      const looksEssay = extractPointsHint(joined) !== undefined || joined.length >= 40
      if (!looksEssay) break
      tailStart = b
    }
    if (tailStart < questionBlocks.length) {
      for (let b = tailStart; b < questionBlocks.length; b++) blockMetas[b] = { mode: 'essay' }
      const tailCount = questionBlocks.length - tailStart
      warnings.push(`Không thấy tiêu đề phần "TỰ LUẬN" — ${tailCount} câu cuối không có phương án A–D được nhận diện là câu tự luận. Kiểm tra lại trong xem trước.`)
    }
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
      detectedForm: intent === 'essay' ? 'essay' : 'multiple_choice',
      errors: [intent === 'essay'
        ? 'Không tìm thấy câu hỏi tự luận nào. Mỗi câu cần bắt đầu bằng "Câu 1:", "Bài 1:", "1." hoặc cách nhau bằng dòng trống (mỗi đoạn là 1 câu).'
        : 'Không tìm thấy câu hỏi nào. Hãy chắc chắn câu hỏi bắt đầu bằng "Câu 1:", "Câu 2:" hoặc "1.", "2.".'],
      warnings: [],
    }
  }

  const parsedQuestions: ExamQuestion[] = []
  const parsedAnswerKey: Record<number, MultipleChoiceOption> = {}
  // EXAM-MIXED: ánh xạ block index → câu hỏi đã tạo (phân bổ điểm theo phần).
  const blockToQuestion: (ExamQuestion | undefined)[] = []
  let detachedRubricLines = 0

  // 3. Phân tích từng khối câu hỏi
  for (let bIndex = 0; bIndex < questionBlocks.length; bIndex++) {
    const block = questionBlocks[bIndex]
    const firstLine = block[0]
    // EXAM-MIXED: mode của phần mà block này thuộc về.
    const blockMode = blockMetas[bIndex]?.mode ?? 'multiple_choice'

    const startMatch = firstLine.match(QUESTION_START_REGEX)
      ?? (blockMode === 'essay' ? firstLine.match(ESSAY_LOOSE_START_REGEX) : null)
      ?? (blockMode === 'essay' ? firstLine.match(BARE_NUMBER_START_REGEX) : null)

    const explicitIndex = startMatch ? parseInt(startMatch[startMatch[1] !== undefined ? 1 : 2] ?? '', 10) : bIndex + 1
    const questionIndex = isNaN(explicitIndex) ? bIndex + 1 : explicitIndex

    // ESASSAY-DECODE: group nội dung của mốc lỏng/số trần nằm ở group cuối.
    let questionText = startMatch
      ? (startMatch[startMatch.length - 1] || '').trim()
      : firstLine

    // ── EXAM-MIXED: câu TỰ LUẬN — toàn bộ khối là nội dung câu hỏi ──
    if (blockMode === 'essay') {
      // ESSAY-DECODE: giữ nguyên cấu trúc dòng (câu hỏi con a)/b), "1." "2." nằm
      // trong cùng câu) để đề in ra đọc được; trước đây nối bằng space nên các ý
      // bị dính thành một đoạn.
      const contentLines: string[] = []
      const rubricLines: string[] = []
      const essayLines = [questionText, ...block.slice(1).map(line => line.trim())]
      for (const line of essayLines) {
        if (!line) continue
        // Dòng "Đáp án: ..."/"Hướng dẫn chấm: ..." trong đề → chuyển sang Lời giải
        // của giáo viên (không in lẫn vào đề phát cho học sinh).
        const rubric = line.match(RUBRIC_LINE_REGEX)
        if (rubric) {
          const rubricText = rubric[1].trim()
          if (rubricText) {
            rubricLines.push(rubricText)
            detachedRubricLines++
          }
          continue
        }
        contentLines.push(line.replace(POINTS_ANNOTATION_REGEX, '').trim())
      }
      // Điểm riêng của câu "(3 điểm)" nếu có; phần còn lại được phân bổ từ
      // tiêu đề phần ở pass sau. Chú ý: marker có thể nằm ở PREFIX dòng
      // ("Câu 4 (5 điểm): ...") nên soi cả dòng đầu đầy đủ.
      const ownPoints = extractPointsHint(firstLine) ?? extractPointsHint(block.join(' '))
      const cleanedText = contentLines.filter(line => line.length > 0).join('\n').trim()
      const essayQuestion: ExamQuestion = {
        index: questionIndex,
        question: cleanedText || `Câu tự luận số ${questionIndex}`,
        type: 'essay',
        ...(ownPoints !== undefined ? { points: ownPoints } : {}),
        ...(rubricLines.length > 0 ? { explanation: rubricLines.join('\n') } : {}),
      }
      parsedQuestions.push(essayQuestion)
      blockToQuestion[bIndex] = essayQuestion
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

    let currentOptionKey: MultipleChoiceOption | null = null

    for (let l = 1; l < block.length; l++) {
      const line = block[l].trim()
      if (!line) continue

      // Kiểm tra dòng đáp án ("Đáp án: A", "Đ/A: B", "Key: C", "Chọn: D")
      const ansMatch = line.match(INLINE_ANSWER_REGEX)
      if (ansMatch) {
        correctOption = ansMatch[1].toUpperCase() as MultipleChoiceOption
        continue
      }

      // Kiểm tra nếu dòng này là một phương án A, B, C, D
      // Cũng xử lý trường hợp 1 dòng có nhiều phương án: "A. Hà Nội   B. Huế   C. Sài Gòn   D. Đà Nẵng"
      const multiOptMatches = Array.from(line.matchAll(MULTI_OPTION_REGEX))

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

    const mcQuestion: ExamQuestion = {
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
    }
    blockToQuestion[bIndex] = mcQuestion
    parsedQuestions.push(mcQuestion)
  }

  if (detachedRubricLines > 0) {
    warnings.push(`Đã tách ${detachedRubricLines} dòng đáp án/hướng dẫn chấm khỏi nội dung câu tự luận (chuyển vào "Lời giải" của giáo viên — không in vào đề phát cho học sinh).`)
  }

  // ── EXAM-MIXED: phân bổ điểm khai báo ở TIÊU ĐỀ PHẦN cho các câu chưa có điểm riêng ──
  for (let hIdx = 0; hIdx < sectionHints.length; hIdx++) {
    const hint = sectionHints[hIdx]
    if (hint.points === undefined) continue
    const startB = hint.fromBlockIndex
    const endB = sectionHints[hIdx + 1]?.fromBlockIndex ?? questionBlocks.length
    // Dùng trực tiếp đối tượng câu hỏi theo block (không qua index) — đề có thể
    // đánh số lại từ 1 ở mỗi phần (ESSAY-DECODE) nên index không còn là duy nhất.
    const members: ExamQuestion[] = []
    for (let b = startB; b < endB; b++) {
      const question = blockToQuestion[b]
      if (question && question.points === undefined && !members.includes(question)) members.push(question)
    }
    if (members.length > 0) {
      const each = Math.round((hint.points / members.length) * 100) / 100
      members.forEach(m => { m.points = each })
      warnings.push(`Phần ${hint.mode === 'essay' ? 'TỰ LUẬN' : 'TRẮC NGHIỆM'} (${hint.points}đ): chia đều ${each}đ/câu cho ${members.length} câu.`)
    }
  }

  // Sắp xếp theo thứ tự câu. ESSAY-DECODE: đề chia phần thường ĐÁNH LẠI SỐ từ 1
  // ở mỗi phần (PHẦN 1..N rồi TL 1..M) → sort theo index sẽ xen kẽ 2 phần và làm
  // answerKey trỏ sai câu. Khi phát hiện trùng số, giữ nguyên thứ tự thực tế.
  const indexValues = parsedQuestions.map(q => q.index)
  const hasDuplicateIndex = new Set(indexValues).size !== indexValues.length
  if (hasDuplicateIndex) {
    warnings.push('Đề đánh số câu trùng giữa các phần (mỗi phần đánh lại từ 1) — hệ thống giữ đúng thứ tự câu trong đề và đánh lại số 1..N.')
  } else {
    parsedQuestions.sort((a, b) => a.index - b.index)
  }

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
export async function parseExamFromExcel(buffer: ArrayBuffer | Uint8Array, options: ExamParseOptions = {}): Promise<ExamParseResult> {
  // PERF-XLSX-1: lazy-load xlsx — chunk chỉ tải khi user import file Excel.
  const XLSX = await loadXlsx()
  const intent = options.intent ?? 'both'
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
        detectedForm: intent === 'essay' ? 'essay' : 'multiple_choice',
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
        detectedForm: intent === 'essay' ? 'essay' : 'multiple_choice',
        errors: ['File Excel không có dữ liệu câu hỏi.'],
        warnings: [],
      }
    }

    // Bỏ qua dòng tiêu đề nếu dòng 1 chứa chữ "Câu", "Nội dung", "Question"...
    let startIndex = 0
    // EXAM-MIXED: map cột THEO TÊN HEADER khi có dòng tiêu đề — hỗ trợ cả layout
    // cũ 7 cột lẫn layout mở rộng có "Loại"/"Điểm" xen giữa. Không tìm được
    // header nào → fallback về vị trí cố định (tương thích ngược tuyệt đối).
    // ESSAY-DECODE: header KHÔNG cần cột đáp án — file tự luận 2 cột
    // (Câu, Nội dung) cũng phải map được cột nội dung.
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
    if (firstRowStr.includes('câu') || firstRowStr.includes('nội dung') || firstRowStr.includes('question') || firstRowStr.includes('đáp án') || firstRowStr.includes('đề bài') || firstRowStr.includes('loại') || firstRowStr.includes('điểm')) {
      startIndex = 1
      const headers: string[] = (rows[0] || []).map((h: unknown) => String(h ?? '').trim().toLowerCase())
      const findCol = (...patterns: RegExp[]): number =>
        headers.findIndex(h => h.length > 0 && patterns.some(p => p.test(h)))
      const questionCol = findCol(/nội\s*dung|noi\s*dung|câu\s*hỏi|question|đề\s*bài|de\s*bai/)
      // ESSAY-DECODE: mốc phương án phải có ngữ cảnh "lựa chọn/phương án/đáp án A"
      // — header "Nội Dung Câu Hỏi" chứa chữ "Câu"/"u..." dễ bắt nhầm `^a\b`-style.
      const findOptionCol = (letter: string) => findCol(
        new RegExp(`^(?:lựa\\s*chọn|phương\\s*án|đáp\\s*án)\\s*${letter}\\b`),
        new RegExp(`^option\\s*${letter}\\b`),
        new RegExp(`^${letter}(?:\\s*[:.)-])?$`),
      )
      const optACol = findOptionCol('a')
      const optBCol = findOptionCol('b')
      const optCCol = findOptionCol('c')
      const optDCol = findOptionCol('d')
      const answerCol = findCol(/đáp\s*án|dap\s*an|answer|key/)
      const typeCol = findCol(/loại|loai|question\s*type|^type$/)
      const pointsCol = findCol(/điểm|^diem|point/)
      if (questionCol !== -1) {
        columnMap = {
          question: questionCol,
          optionA: optACol !== -1 ? optACol : 2,
          optionB: optBCol !== -1 ? optBCol : 3,
          optionC: optCCol !== -1 ? optCCol : 4,
          optionD: optDCol !== -1 ? optDCol : 5,
          answer: answerCol !== -1 ? answerCol : 6,
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

    // ESSAY-DECODE (2026-09-23): file KHÔNG có cột "Loại" và TOÀN BỘ dữ liệu không
    // có phương án A–D lẫn đáp án → đây là bảng câu hỏi TỰ LUẬN. Trước đây mỗi
    // dòng thành 1 câu TN với "Phương án A…D" + đáp án mặc định A, nên file tự luận
    // 2 cột (Câu, Nội dung) không decode được và còn tạo answerKey giả.
    // Chỉ soi các cột A–D/đáp án có header THỰC (không soi fallback 2..6 —
    // file 2 cột không có các cột đó, soi fallback sẽ đọc nhầm ô nội dung).
    const sheetHasMcEvidence = (() => {
      if (cols.type !== undefined) return true
      const optCols: number[] = []
      if (columnMap) {
        if (/lựa\s*chọn\s*a|phương\s*án\s*a|đáp\s*án\s*a|option\s*a/i.test(String(rows[0]?.[columnMap.optionA] ?? ''))) optCols.push(columnMap.optionA)
        if (/lựa\s*chọn\s*b|phương\s*án\s*b|đáp\s*án\s*b|option\s*b/i.test(String(rows[0]?.[columnMap.optionB] ?? ''))) optCols.push(columnMap.optionB)
        if (/lựa\s*chọn\s*c|phương\s*án\s*c|đáp\s*án\s*c|option\s*c/i.test(String(rows[0]?.[columnMap.optionC] ?? ''))) optCols.push(columnMap.optionC)
        if (/lựa\s*chọn\s*d|phương\s*án\s*d|đáp\s*án\s*d|option\s*d/i.test(String(rows[0]?.[columnMap.optionD] ?? ''))) optCols.push(columnMap.optionD)
      }
      const answerColHasHeader = columnMap
        ? /đáp\s*án|dap\s*an|answer|key/i.test(String(rows[0]?.[columnMap.answer] ?? ''))
        : true
      for (let r = startIndex; r < rows.length; r++) {
        const row = rows[r]
        if (!row || row.length === 0) continue
        for (const col of optCols) {
          if (String(row[col] ?? '').trim()) return true
        }
        if (answerColHasHeader && String(row[cols.answer] ?? '').trim()) return true
      }
      return false
    })()
    if (!sheetHasMcEvidence) {
      warnings.push('File không có cột "Loại" và không có phương án A–D/đáp án nào → đã nhận diện toàn bộ là câu hỏi TỰ LUẬN.')
    }

    for (let r = startIndex; r < rows.length; r++) {
      const row = rows[r]
      if (!row || row.length === 0) continue

      // Assign positions from accepted rows so blank/spacer rows cannot create gaps.
      const finalIndex = parsedQuestions.length + 1
      // ESSAY-DECODE: đọc nội dung theo CỘT ĐÃ MAP (trước đây hard-code row[1] nên
      // file có cột "Nội dung" ở vị trí khác làm câu tự luận mất nội dung).
      const rawQuestionCell = String(row[cols.question] ?? '').trim()
      if (!rawQuestionCell) continue
      const qText = rawQuestionCell
      const optA = String(row[cols.optionA] || '').trim() || 'Phương án A'
      const optB = String(row[cols.optionB] || '').trim() || 'Phương án B'
      const optC = String(row[cols.optionC] || '').trim() || 'Phương án C'
      const optD = String(row[cols.optionD] || '').trim() || 'Phương án D'

      // EXAM-MIXED: loại câu hỏi từ cột "Loại"; thiếu cột → suy từ bằng chứng
      // toàn file (ESSAY-DECODE), mặc định trắc nghiệm như cũ.
      const rowType = cols.type !== undefined
        ? parseTypeCell(row[cols.type])
        : (sheetHasMcEvidence ? 'multiple_choice' : 'essay')
      const rowPoints = cols.points !== undefined ? parsePointsCell(row[cols.points]) : undefined

      if (rowType === 'essay') {
        // Câu tự luận: không cần A–D/đáp án; chỉ cần nội dung câu hỏi.
        if (!rawQuestionCell) {
          warnings.push(`Dòng ${r + 1}: câu tự luận thiếu nội dung (cột "Nội dung") — bỏ qua.`)
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
      detectedForm: intent === 'essay' ? 'essay' : 'multiple_choice',
      errors: [`Lỗi đọc file Excel: ${err?.message || 'Định dạng không hợp lệ'}`],
      warnings: [],
    }
  }
}

/**
 * ESSAY-DECODE (2026-09-23): đọc đề từ file Word (.docx) — định dạng giáo viên
 * thực tế hay dùng cho đề tự luận. Chỉ trích RAW TEXT (mammoth, lazy-load):
 * ảnh/macro/đối tượng nhúng không được thực thi hay tải lên server.
 */
export async function parseExamFromDocx(
  buffer: ArrayBuffer | Uint8Array,
  options: ExamParseOptions = {},
): Promise<ExamParseResult> {
  const intent = options.intent ?? 'both'
  try {
    const module = await import('mammoth')
    const mammoth = module.default ?? module
    // Mammoth's browser entry accepts ArrayBuffer. Copy typed-array inputs so
    // this API never depends on Node Buffer or on the caller's backing store.
    const arrayBuffer = buffer instanceof Uint8Array
      ? Uint8Array.from(buffer).buffer as ArrayBuffer
      : buffer
    const extraction = await mammoth.extractRawText({ arrayBuffer })
    const parsed = parseExamFromText(extraction.value ?? '', options)
    const extractorWarnings = (extraction.messages ?? [])
      .map(message => message.message)
      .filter((message): message is string => Boolean(message && message.trim()))
    return extractorWarnings.length > 0
      ? { ...parsed, warnings: [...parsed.warnings, ...extractorWarnings] }
      : parsed
  } catch (err: any) {
    return {
      ok: false,
      questions: [],
      answerKey: {},
      questionCount: 0,
      ...emptyStats(),
      detectedForm: intent === 'essay' ? 'essay' : 'multiple_choice',
      errors: [`Lỗi đọc file Word (.docx): ${err?.message || 'Định dạng không hợp lệ. Hãy lưu lại file dưới dạng .docx rồi thử lại.'}`],
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
