import { createHash } from 'node:crypto'
import { referencesAnswerOptions } from '../utils/examOptionReferences.js'
import { EXAM_SHUFFLE_POLICIES, planExamShuffle, type ExamShufflePolicy, type ShuffleQuestionSummary } from '../utils/examShufflePlan.js'

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
  algorithmVersion: 'catevia-variant-v1' | typeof ALGORITHM_VERSION | 'catevia-variant-v3'
  /** Missing on legacy manifests, which always shuffled both. */
  shuffleMode?: ExamShuffleMode
  shufflePolicy?: ExamShufflePolicy
  heldQuestionIndices?: number[]
  analysisHash?: string
  questionPlans?: Array<ShuffleQuestionSummary & { sourceContentHash: string }>
  orderReasons?: string[]
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

function assertSafeOptions(question: VariantQuestion, shuffleMode: ExamShuffleMode): void {
  if ((question.type ?? 'multiple_choice') === 'essay') return
  if (!question.options || !OPTION_CODES.includes(question.correctOption!) ||
    OPTION_CODES.some(code => typeof question.options![code] !== 'string' || !question.options![code].trim())) {
    throw new ExamVariantValidationError(`Câu ${question.index} thiếu lựa chọn A/B/C/D hoặc đáp án đúng hợp lệ.`)
  }
  const values = OPTION_CODES.map(code => normalizeText(question.options![code]).toLocaleLowerCase('vi'))
  if (new Set(values).size !== values.length) throw new ExamVariantValidationError(`Câu ${question.index} có phương án trùng nội dung; không thể đảo an toàn.`)
  const referenced = OPTION_CODES.filter(code => referencesAnswerOptions(question.options![code]))
  if (shuffleMode !== 'questions_only' && referenced.length > 0) {
    throw new ExamVariantValidationError(`Câu ${question.index}: Phương án ${referenced.join(', ')} phụ thuộc vị trí lựa chọn (ví dụ “cả A và B”, “các đáp án trên”). Hãy viết rõ nội dung hoặc chọn “Chỉ trộn câu”.`)
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

interface GenerateVariantParams {
  questions: VariantQuestion[]
  questionCount: number
  variantCount: number
  seed: string
  shuffleMode?: ExamShuffleMode
  generatedAt?: string
  algorithmVersion?: ExamVariantManifestSet['algorithmVersion']
  shufflePolicy?: ExamShufflePolicy
  heldQuestionIndices?: number[]
  /** Authoritative session identity, never accepted from the request body. */
  contextId?: string
}

function generateLegacyExamVariantManifest(params: GenerateVariantParams): ExamVariantManifestSet {
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
  mc.forEach(question => assertSafeOptions(question, shuffleMode))

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

/**
 * Saved v1/v2 manifests remain materialized. Pre-grading edits to those
 * definitions use their original policy instead of silently adopting v3.
 */
export function generateExamVariantManifest(params: GenerateVariantParams): ExamVariantManifestSet {
  if (params.algorithmVersion === 'catevia-variant-v1' || params.algorithmVersion === 'catevia-variant-v2') {
    return generateLegacyExamVariantManifest(params)
  }
  if (params.algorithmVersion !== undefined && params.algorithmVersion !== 'catevia-variant-v3') {
    throw new ExamVariantValidationError('Phiên bản thuật toán mã đề chưa được hỗ trợ; không tự hạ phiên bản khi sửa đề.')
  }
  if (process.env.EXAM_SMART_SHUFFLE_ENABLED === 'false' || process.env.EXAM_SMART_SHUFFLE_ENABLED === '0') {
    throw new ExamVariantValidationError('Bộ trộn thông minh đang tạm tắt; các mã đề đã lưu vẫn có thể in và chấm.')
  }
  const shuffleMode = params.shuffleMode ?? 'questions_and_options'
  const shufflePolicy = params.shufflePolicy ?? 'fixed_aggregates'
  if (!EXAM_SHUFFLE_MODES.includes(shuffleMode) || !EXAM_SHUFFLE_POLICIES.includes(shufflePolicy)) {
    throw new ExamVariantValidationError('Chính sách trộn đề không hợp lệ.')
  }
  if (!Number.isInteger(params.variantCount) || params.variantCount < 1 || params.variantCount > 8) {
    throw new ExamVariantValidationError('Số mã đề phải nằm trong khoảng 1..8.')
  }
  if (!params.seed.trim() || params.seed.length > 128) throw new ExamVariantValidationError('Seed mã đề không hợp lệ.')
  const { questions, questionCount } = params
  if (!Array.isArray(questions) || questions.length < 1 || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > 50) {
    throw new ExamVariantValidationError('Phiên cần từ 1 đến 50 câu trắc nghiệm để đảo đề.')
  }
  if (questions.some(q => !q || !Number.isInteger(q.index) || q.index < 1) || new Set(questions.map(q => q.index)).size !== questions.length) {
    throw new ExamVariantValidationError('Số thứ tự câu hỏi phải là số nguyên dương và không trùng nhau.')
  }
  if (questions.some(q => q.isPlaceholder || typeof q.question !== 'string' || !q.question.trim())) {
    throw new ExamVariantValidationError('Cần nhập nội dung câu hỏi thật trước khi tạo mã đề.')
  }
  const sorted = [...questions].sort((a, b) => a.index - b.index)
  const mc = sorted.filter(q => q.type !== 'essay')
  const essay = sorted.filter(q => q.type === 'essay')
  if (sorted.some(q => q.explanation !== undefined && typeof q.explanation !== 'string')) {
    throw new ExamVariantValidationError('Lời giải câu hỏi phải là văn bản.')
  }
  if (mc.length !== questionCount) throw new ExamVariantValidationError('Số câu trắc nghiệm không khớp questionCount.')
  // Structural validation is independent of positional semantics.
  mc.forEach(question => assertSafeOptions(question, 'questions_only'))
  const heldQuestionIndices = [...new Set(params.heldQuestionIndices ?? [])].sort((a, b) => a - b)
  if (heldQuestionIndices.some(index => !Number.isInteger(index) || !mc.some(q => q.index === index))) {
    throw new ExamVariantValidationError('Danh sách câu giữ lựa chọn không hợp lệ.')
  }
  const plan = planExamShuffle(sorted, shuffleMode, shufflePolicy, heldQuestionIndices, rngFor(params.seed, 'v3:layouts'))
  if (plan.orderReasons.length && sorted.some((q, index) => q.index !== index + 1)) {
    throw new ExamVariantValidationError('Đề có tham chiếu số câu; cần giữ số thứ tự nguồn liên tục trước khi tạo mã.')
  }
  if (params.variantCount > plan.layouts.length) {
    throw new ExamVariantValidationError(plan.capacityExact
      ? 'Chỉ có thể tạo ' + plan.layouts.length + ' mã đề khác nhau với các ràng buộc hiện tại. Hãy giảm số mã hoặc xem lại các câu giữ nguyên.'
      : 'Đã tìm được ' + plan.layouts.length + ' mã đề khác nhau; chưa xác định đủ số mã yêu cầu trong giới hạn lập kế hoạch. Hãy giảm số mã.')
  }
  const sourceHash = sha256(JSON.stringify(sorted))
  const questionPlans = plan.summaries.map(summary => ({ ...summary,
    sourceContentHash: sha256(JSON.stringify(sorted.find(q => q.index === summary.sourceIndex))) }))
  const analysisHash = sha256(JSON.stringify({ policyVersion: 1, contextId: params.contextId ?? null, sourceHash, shuffleMode, shufflePolicy, heldQuestionIndices,
    seed: params.seed, variantCount: params.variantCount, questionPlans, orderReasons: plan.orderReasons }))
  const sourceIds = new Map(sorted.map(question => [question.index,
    question.sourceQuestionId ?? question.index + ':' + sha256(JSON.stringify(question)).slice(0, 16)]))
  const variants: Partial<Record<VersionCode, ExamVariantEntry>> = {}
  for (let at = 0; at < params.variantCount; at++) {
    const version = VERSION_CODES[at]
    const layout = plan.layouts[at]
    const optionOrders: Record<number, OptionCode[]> = {}
    const answerKey: Record<number, OptionCode> = {}
    const materialized: VariantQuestion[] = layout.questions.map((item, index) => {
      const source = mc.find(q => q.index === item.sourceIndex)!
      optionOrders[index + 1] = [...item.order]
      const correctOption = OPTION_CODES[item.order.indexOf(source.correctOption!)]
      if (!correctOption) throw new ExamVariantValidationError('Không ánh xạ được khóa chấm từ lựa chọn nguồn.')
      answerKey[index + 1] = correctOption
      return { ...source, ...item.rendered, index: index + 1, correctOption }
    })
    materialized.push(...essay.map((question, index) => ({ ...question, index: questionCount + index + 1 })))
    const sourceQuestionOrder = [...layout.questions.map(item => item.sourceIndex), ...essay.map(q => q.index)]
    variants[version] = { version, sourceQuestionOrder, sourceQuestionIds: sourceQuestionOrder.map(index => sourceIds.get(index)!),
      optionOrders, questions: materialized, answerKey, contentHash: sha256(JSON.stringify(materialized)) }
  }
  return { schemaVersion: 1, algorithmVersion: 'catevia-variant-v3', shuffleMode, shufflePolicy, heldQuestionIndices,
    sourceHash, analysisHash, questionPlans, orderReasons: plan.orderReasons, seed: params.seed,
    generatedAt: params.generatedAt ?? new Date().toISOString(), variants }
}
