import type { ExamQuestion, StructuredQuestionData } from '../types'
import { formatEssaySubparts, SUBPART_START_REGEX } from './essayStructure'

export type ResponseFormat = NonNullable<ExamQuestion['responseFormat']>

export function detectResponseFormat(text: string): ResponseFormat | undefined {
  if (/nối\s*(?:ý|cặp|cột|mỗi|các|nội\s*dung)|ghép\s*(?:ý|cặp|cột)|match(?:ing)?\b|cột\s*[AB12]\s*[|\t]/iu.test(text)) return 'matching'
  if (/điền\s*(?:từ|cụm\s*từ|vào|khuyết|chỗ)|fill[\s_-]*(?:in|blank|gap)|gap[\s-]*fill|cloze\b|_{3,}|[\p{L}\d][ \t]+\.{4,}[ \t]*\p{L}|[\p{L}\d][ \t]+…{2,}[ \t]*\p{L}|\{\{[^{}]+\}\}/iu.test(text)) return 'fill_blank'
  return undefined
}

export function questionFormatLabel(question: Pick<ExamQuestion, 'type' | 'responseFormat'>): string {
  return question.responseFormat === 'fill_blank' ? 'Điền khuyết'
    : question.responseFormat === 'matching' ? 'Nối / ghép cột'
    : question.type === 'essay' ? 'Tự luận' : 'Trắc nghiệm'
}

export function questionFormatSummary(questions: ExamQuestion[]): string {
  const counts = new Map<string, number>()
  for (const question of questions) {
    const label = questionFormatLabel(question)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts].map(([label, count]) => `${count} câu ${label.toLocaleLowerCase('vi')}`).join(' · ')
}

export function printableQuestionPrompt(question: Pick<ExamQuestion, 'question' | 'responseFormat'>): string {
  return question.responseFormat === 'fill_blank' ? question.question.replace(/\{\{([^{}]+)\}\}/gu, '($1) __________') : question.question
}

export function isObjectiveQuestion(question: ExamQuestion): boolean {
  return question.type !== 'essay' || Boolean(question.responseFormat)
}

export function extractEssaySubparts(text: string): NonNullable<StructuredQuestionData['subparts']> {
  const parts: NonNullable<StructuredQuestionData['subparts']> = []
  for (const line of formatEssaySubparts(text).split('\n')) {
    const match = line.trim().match(SUBPART_START_REGEX)
    if (!match) {
      if (parts.length) parts[parts.length - 1].text += `\n${line.trim()}`
      continue
    }
    const label = match[0].trim()
    const content = line.trim().slice(match[0].length)
    const pointMatch = content.match(/\(\s*(\d+(?:[.,]\d+)?)\s*(?:điểm|đ|points?)\s*\)/iu)
    parts.push({ label, text: content.trim(), ...(pointMatch ? { points: Number(pointMatch[1].replace(',', '.')) } : {}) })
  }
  return parts
}

/** Parse explicit answer labels; never infer a key from item order. */
export function parseStructuredQuestion(
  text: string,
  format: ResponseFormat,
  answerText = '',
): { question: string; answerData: StructuredQuestionData; warnings: string[]; explanation?: string } {
  const content: string[] = []
  const answers: string[] = answerText ? [answerText] : []
  const rubrics: string[] = []
  for (const line of text.split('\n')) {
    const key = line.match(/^\s*(?:đáp\s*án|đ\/a|answer(?:\s*key)?|hướng\s*dẫn\s*chấm)\s*[:：]\s*(.*)$/iu)
    if (key) {
      answers.push(key[1])
      if (/hướng\s*dẫn\s*chấm/iu.test(line)) rubrics.push(key[1])
    }
    else content.push(line)
  }
  const warnings: string[] = []
  const keyText = answers.join('; ')
  if (format === 'fill_blank') {
    const wordBank = content.find(line => /^(?:từ\s*cho\s*sẵn|ngân\s*hàng\s*từ|word\s*bank)\s*:/iu.test(line))
    const stem = content.filter(line => line !== wordBank).join('\n').trim()
    const markers = Array.from(stem.matchAll(/(?:\((\d+)\)\s*)?(?:_{3,}|\.{4,}|…{2,})|\{\{([^{}]+)\}\}/gu))
    const blanks = markers.map((marker, i) => ({ id: marker[1] ?? marker[2]?.trim() ?? String(i + 1), acceptedAnswers: [] as string[] }))
    if (!blanks.length) warnings.push('Chưa thấy vị trí ô trống; dùng ___ hoặc {{1}} trong nội dung.')
    const keyed = Array.from(keyText.matchAll(/(?:^|[;\n])\s*([\p{L}\d_-]+)\s*[:=.)-]\s*([^;\n]+)/gu))
    for (const match of keyed) {
      const blank = blanks.find(item => item.id === match[1])
      if (blank) blank.acceptedAnswers = match[2].split('|').map(value => value.trim()).filter(Boolean)
    }
    if (!keyed.length && blanks.length === 1 && keyText.trim()) blanks[0].acceptedAnswers = keyText.split('|').map(value => value.trim()).filter(Boolean)
    if (blanks.some(blank => !blank.acceptedAnswers.length)) warnings.push('Có ô trống chưa có đáp án; kiểm tra và bổ sung trước khi duyệt câu hỏi.')
    if (new Set(blanks.map(blank => blank.id)).size !== blanks.length) warnings.push('Nhãn ô trống bị trùng; hãy đặt nhãn duy nhất cho từng ô.')
    return { question: stem, answerData: { blanks, ...(wordBank ? { wordBank: wordBank.replace(/^[^:]+:/u, '').split(/[,;|]/u).map(value => value.trim()).filter(Boolean) } : {}) }, warnings, ...(rubrics.length ? { explanation: rubrics.join('\n') } : {}) }
  }

  const left: NonNullable<StructuredQuestionData['left']> = []
  const right: NonNullable<StructuredQuestionData['right']> = []
  const stem: string[] = []
  let column: 'left' | 'right' | undefined
  const itemPattern = /^\s*\(?([\p{L}\d]+)[.):\]]\s*(.+)$/u
  const add = (cell: string, side?: 'left' | 'right'): boolean => {
    const match = cell.match(itemPattern)
    if (!match) return false
    const target = side ?? (/^\d+$/u.test(match[1]) ? 'left' : 'right')
    ;(target === 'left' ? left : right).push({ id: match[1], text: match[2].trim() })
    return true
  }
  for (const line of content) {
    const cells = line.replace(/^\s*\||\|\s*$/gu, '').split(/\t+|\s*\|\s*|\s{3,}/u).filter(Boolean)
    if (cells.length >= 2 && /cột\s*[A1]|column\s*[A1]/iu.test(cells[0]) && /cột\s*[B2]|column\s*[B2]/iu.test(cells[1])) continue
    if (/^\s*(?:cột|column)\s*[A1]\s*:?[\s]*$/iu.test(line)) { column = 'left'; continue }
    if (/^\s*(?:cột|column)\s*[B2]\s*:?[\s]*$/iu.test(line)) { column = 'right'; continue }
    if (/^\s*[-:|\s]+\s*$/u.test(line)) continue
    if (cells.length >= 2 && cells[0].match(itemPattern) && cells[1].match(itemPattern)) { add(cells[0], 'left'); add(cells[1], 'right'); continue }
    if (!add(line, column)) stem.push(line)
  }
  const pairs = Array.from(keyText.matchAll(/([\p{L}\d]+)\s*[-–—=:→]\s*([\p{L}\d]+)/gu)).map(match => ({ leftId: match[1], rightId: match[2] }))
  if (left.length < 2 || right.length < 2) warnings.push('Chưa đọc đủ hai cột ghép; giữ nội dung gốc để kiểm tra lại.')
  if (!pairs.length) warnings.push('Chưa có đáp án ghép cột; nhập dạng 1-A; 2-B, không suy đoán theo thứ tự hàng.')
  return { question: left.length >= 2 && right.length >= 2 ? stem.join('\n').trim() || 'Nối nội dung cột A với cột B.' : content.join('\n').trim(), answerData: { left, right, pairs }, warnings, ...(rubrics.length ? { explanation: rubrics.join('\n') } : {}) }
}

/** Student-facing text used by every exporter; answer mappings are opt-in. */
export function structuredQuestionText(question: ExamQuestion, showAnswers = false): string {
  const data = question.answerData
  const lines = [printableQuestionPrompt(question)]
  if (question.responseFormat === 'fill_blank' && data?.wordBank?.length) lines.push(`Từ cho sẵn: ${data.wordBank.join(', ')}`)
  if (question.responseFormat === 'matching' && data?.left?.length && data.right?.length) {
    lines.push('Cột A | Cột B')
    for (let i = 0; i < Math.max(data.left.length, data.right.length); i++) lines.push(`${data.left[i] ? `${data.left[i].id}. ${data.left[i].text}` : ''} | ${data.right[i] ? `${data.right[i].id}. ${data.right[i].text}` : ''}`)
  }
  if (showAnswers && question.responseFormat === 'fill_blank') lines.push(`Đáp án: ${data?.blanks?.map(blank => `${blank.id}: ${blank.acceptedAnswers.join(' | ') || 'Chưa nhập'}`).join('; ') ?? ''}`)
  if (showAnswers && question.responseFormat === 'matching') lines.push(`Đáp án: ${data?.pairs?.map(pair => `${pair.leftId}-${pair.rightId}`).join('; ') ?? ''}`)
  return lines.join('\n')
}
