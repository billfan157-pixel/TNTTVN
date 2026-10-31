import { createHash } from 'node:crypto'

const VERSION_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
const OPTION_CODES = ['A', 'B', 'C', 'D'] as const
const ALGORITHM_VERSION = 'catevia-variant-v2' as const
export const EXAM_SHUFFLE_MODES = ['questions_and_options', 'questions_only', 'options_only'] as const
export type ExamShuffleMode = typeof EXAM_SHUFFLE_MODES[number]

export class ExamVariantValidationError extends Error {
  readonly status = 400
}

type VersionCode = typeof VERSION_CODES[number]
type OptionCode = typeof OPTION_CODES[number]

export interface VariantQuestion {
  index: number
  question: string
  type?: 'multiple_choice' | 'essay'
  responseFormat?: 'fill_blank' | 'matching'
  answerData?: Record<string, unknown>
  options?: Record<OptionCode, string>
  correctOption?: OptionCode
  explanation?: string
  points?: number
  answerLineCount?: number
  isPlaceholder?: boolean
  /** Immutable Question Bank provenance. Legacy/imported questions omit these. */
  sourceQuestionId?: string
  sourceVersionId?: string
}

export interface ExamVariantEntry {
  version: VersionCode
  sourceQuestionOrder: number[]
  sourceQuestionIds: string[]
  optionOrders: Record<number, OptionCode[]>
  questions: VariantQuestion[]
  answerKey: Record<number, OptionCode>
  contentHash: string
}

export interface ExamVariantManifestSet {
  schemaVersion: 1
  algorithmVersion: 'catevia-variant-v1' | typeof ALGORITHM_VERSION
  /** Missing on legacy manifests, which always shuffled both. */
  shuffleMode?: ExamShuffleMode
  seed: string
  sourceHash: string
  generatedAt: string
  variants: Partial<Record<VersionCode, ExamVariantEntry>>
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function rngFor(seed: string, context: string): () => number {
  let state = Number.parseInt(sha256(`${seed}:${context}`).slice(0, 8), 16) >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

function assertSafeOptions(question: VariantQuestion): void {
  if ((question.type ?? 'multiple_choice') === 'essay') return
  if (!question.options || !OPTION_CODES.includes(question.correctOption!) ||
    OPTION_CODES.some(code => typeof question.options![code] !== 'string' || !question.options![code].trim())) {
    throw new ExamVariantValidationError(`Câu ${question.index} thiếu lựa chọn A/B/C/D hoặc đáp án đúng hợp lệ.`)
  }
  const values = OPTION_CODES.map(code => normalizeText(question.options![code]).toLocaleLowerCase('vi'))
  if (new Set(values).size !== values.length) throw new ExamVariantValidationError(`Câu ${question.index} có phương án trùng nội dung; không thể đảo an toàn.`)
  const positional = /(?:tất cả|cả\s+[abcd]|không có đáp án|all of|none of|both\s+[abcd])/iu
  if (values.some(value => positional.test(value))) {
    throw new ExamVariantValidationError(`Câu ${question.index} có phương án phụ thuộc vị trí (tất cả/không có đáp án); cần sửa trước khi đảo.`)
  }
}

function normalizeText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim()
}

// MC papers omit scoring weights as well as provenance, keys and explanations.
function paperQuestionSignature(question: VariantQuestion): string {
  return JSON.stringify([normalizeText(question.question), question.type ?? 'multiple_choice',
    OPTION_CODES.map(code => question.options ? normalizeText(question.options[code]) : null)])
}

function* permutations<T>(items: readonly T[], key: (item: T) => string): Generator<T[]> {
  const current = [...items].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)
  while (true) {
    yield [...current]
    let pivot = current.length - 2
    while (pivot >= 0 && key(current[pivot]) >= key(current[pivot + 1])) pivot--
    if (pivot < 0) return
    let successor = current.length - 1
    while (key(current[successor]) <= key(current[pivot])) successor--
    ;[current[pivot], current[successor]] = [current[successor], current[pivot]]
    const suffix = current.splice(pivot + 1).reverse()
    current.push(...suffix)
  }
}

export function generateExamVariantManifest(params: {
  questions: VariantQuestion[]
  questionCount: number
  variantCount: number
  seed: string
  shuffleMode?: ExamShuffleMode
  generatedAt?: string
}): ExamVariantManifestSet {
  const { questions, questionCount, seed } = params
  const shuffleMode = params.shuffleMode ?? 'questions_and_options'
  if (!EXAM_SHUFFLE_MODES.includes(shuffleMode)) throw new ExamVariantValidationError('Kiểu trộn đề không hợp lệ.')
  if (!Number.isInteger(params.variantCount) || params.variantCount < 1 || params.variantCount > 8) {
    throw new ExamVariantValidationError('Số mã đề phải nằm trong khoảng 1..8.')
  }
  if (!seed.trim() || seed.length > 128) throw new ExamVariantValidationError('Seed mã đề không hợp lệ.')
  if (questions.length < 1 || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > 50) throw new ExamVariantValidationError('Phiên cần từ 1 đến 50 câu trắc nghiệm để đảo đề.')
  if (questions.some(q => !q || !Number.isInteger(q.index) || q.index < 1) || new Set(questions.map(q => q.index)).size !== questions.length) {
    throw new ExamVariantValidationError('Số thứ tự câu hỏi phải là số nguyên dương và không trùng nhau.')
  }
  if (questions.some(q => q.isPlaceholder || typeof q.question !== 'string' || !q.question.trim())) {
    throw new ExamVariantValidationError('Cần nhập nội dung câu hỏi thật trước khi tạo mã đề.')
  }

  const sorted = [...questions].sort((a, b) => a.index - b.index)
  const mc = sorted.filter(question => (question.type ?? 'multiple_choice') !== 'essay')
  const essay = sorted.filter(question => question.type === 'essay')
  if (mc.length !== questionCount) throw new ExamVariantValidationError(`Số câu trắc nghiệm (${mc.length}) không khớp questionCount (${questionCount}).`)
  mc.forEach(assertSafeOptions)

  const questionOrders: VariantQuestion[][] = []
  if (shuffleMode === 'questions_only') {
    for (const order of permutations(mc, paperQuestionSignature)) {
      questionOrders.push(order)
      if (questionOrders.length === 8) break
    }
    if (params.variantCount > questionOrders.length) {
      throw new ExamVariantValidationError(`Chỉ có thể tạo ${questionOrders.length} mã đề khác nhau khi chỉ trộn câu. Hãy giảm số mã hoặc chọn trộn cả đáp án.`)
    }
  }

  const sourceHash = sha256(JSON.stringify(sorted))
  const sourceIds = new Map(sorted.map(question => [
    question.index,
    question.sourceQuestionId ?? `${question.index}:${sha256(JSON.stringify(question)).slice(0, 16)}`,
  ]))
  const variants: Partial<Record<VersionCode, ExamVariantEntry>> = {}
  const paperSignatures = new Set<string>()

  function materialize(version: VersionCode, orderedMc: VariantQuestion[], fallbackOptions?: OptionCode[]): ExamVariantEntry {
    const identity = version === 'A'
    const orderedSource = [...orderedMc, ...essay]
    const optionOrders: Record<number, OptionCode[]> = {}
    const answerKey: Record<number, OptionCode> = {}
    const materialized = orderedSource.map((source, zeroIndex) => {
      const index = zeroIndex + 1
      if (source.type === 'essay') return { ...source, index }
      const order = identity || shuffleMode === 'questions_only' ? [...OPTION_CODES]
        : fallbackOptions ? (zeroIndex === 0 ? fallbackOptions : [...OPTION_CODES])
        : shuffled(OPTION_CODES, rngFor(seed, `${version}:options:${source.index}`))
      optionOrders[index] = order
      const nextOptions = Object.fromEntries(OPTION_CODES.map((target, position) => [target, source.options![order[position]]])) as Record<OptionCode, string>
      const correctPosition = order.indexOf(source.correctOption!)
      const correctOption = OPTION_CODES[correctPosition]
      answerKey[index] = correctOption
      return { ...source, index, options: nextOptions, correctOption }
    })
    return {
      version,
      sourceQuestionOrder: orderedSource.map(question => question.index),
      sourceQuestionIds: orderedSource.map(question => sourceIds.get(question.index)!),
      optionOrders,
      questions: materialized,
      answerKey,
      contentHash: sha256(JSON.stringify(materialized)),
    }
  }

  for (let versionIndex = 0; versionIndex < params.variantCount; versionIndex++) {
    const version = VERSION_CODES[versionIndex]
    const orderedMc = version === 'A' || shuffleMode === 'options_only' ? mc : shuffled(mc, rngFor(seed, `${version}:questions`))
    let entry = materialize(version, orderedMc)
    const signature = (candidate: ExamVariantEntry) => JSON.stringify(candidate.questions.map(paperQuestionSignature))
    if (paperSignatures.has(signature(entry))) {
      // A finite fallback guarantees distinct papers even for one/two-question exams.
      const candidates = shuffleMode === 'questions_only'
        ? questionOrders.map(order => materialize(version, order))
        : Array.from(permutations(OPTION_CODES, code => code), order => materialize(version, mc, order))
      const distinct = candidates.find(candidate => !paperSignatures.has(signature(candidate)))
      if (!distinct) throw new ExamVariantValidationError('Không đủ hoán vị khác nhau để tạo số mã đề đã chọn.')
      entry = distinct
    }
    paperSignatures.add(signature(entry))
    variants[version] = entry
  }

  return {
    schemaVersion: 1,
    algorithmVersion: ALGORITHM_VERSION,
    shuffleMode,
    seed,
    sourceHash,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    variants,
  }
}
