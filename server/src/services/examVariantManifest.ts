import { createHash } from 'node:crypto'

const VERSION_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
const OPTION_CODES = ['A', 'B', 'C', 'D'] as const
const ALGORITHM_VERSION = 'catevia-variant-v1' as const

type VersionCode = typeof VERSION_CODES[number]
type OptionCode = typeof OPTION_CODES[number]

export interface VariantQuestion {
  index: number
  question: string
  type?: 'multiple_choice' | 'essay'
  options?: Record<OptionCode, string>
  correctOption?: OptionCode
  explanation?: string
  points?: number
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
  algorithmVersion: typeof ALGORITHM_VERSION
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
  if (!question.options || !question.correctOption) throw new Error(`Câu ${question.index} thiếu options/correctOption.`)
  const values = OPTION_CODES.map(code => question.options![code].trim().toLocaleLowerCase('vi'))
  if (new Set(values).size !== values.length) throw new Error(`Câu ${question.index} có phương án trùng nội dung; không thể đảo an toàn.`)
  const positional = /(?:tất cả|cả\s+[abcd]|không có đáp án|all of|none of|both\s+[abcd])/iu
  if (values.some(value => positional.test(value))) {
    throw new Error(`Câu ${question.index} có phương án phụ thuộc vị trí (tất cả/không có đáp án); cần sửa trước khi đảo.`)
  }
}

export function generateExamVariantManifest(params: {
  questions: VariantQuestion[]
  questionCount: number
  variantCount: number
  seed: string
  generatedAt?: string
}): ExamVariantManifestSet {
  const { questions, questionCount, seed } = params
  if (!Number.isInteger(params.variantCount) || params.variantCount < 1 || params.variantCount > 8) {
    throw new Error('Số mã đề phải nằm trong khoảng 1..8.')
  }
  if (!seed.trim() || seed.length > 128) throw new Error('Seed mã đề không hợp lệ.')
  if (questions.length < 1 || questionCount < 1) throw new Error('Phiên chưa có ngân hàng câu hỏi trắc nghiệm để đảo đề.')

  const sorted = [...questions].sort((a, b) => a.index - b.index)
  const mc = sorted.filter(question => (question.type ?? 'multiple_choice') !== 'essay')
  const essay = sorted.filter(question => question.type === 'essay')
  if (mc.length !== questionCount) throw new Error(`Số câu trắc nghiệm (${mc.length}) không khớp questionCount (${questionCount}).`)
  mc.forEach(assertSafeOptions)

  const sourceHash = sha256(JSON.stringify(sorted))
  const sourceIds = new Map(sorted.map(question => [
    question.index,
    question.sourceQuestionId ?? `${question.index}:${sha256(JSON.stringify(question)).slice(0, 16)}`,
  ]))
  const variants: Partial<Record<VersionCode, ExamVariantEntry>> = {}

  for (let versionIndex = 0; versionIndex < params.variantCount; versionIndex++) {
    const version = VERSION_CODES[versionIndex]
    const identity = version === 'A'
    const orderedMc = identity ? mc : shuffled(mc, rngFor(seed, `${version}:questions`))
    const orderedSource = [...orderedMc, ...essay]
    const optionOrders: Record<number, OptionCode[]> = {}
    const answerKey: Record<number, OptionCode> = {}
    const materialized = orderedSource.map((source, zeroIndex) => {
      const index = zeroIndex + 1
      if (source.type === 'essay') return { ...source, index }
      const order = identity ? [...OPTION_CODES] : shuffled(OPTION_CODES, rngFor(seed, `${version}:options:${source.index}`))
      optionOrders[index] = order
      const nextOptions = Object.fromEntries(OPTION_CODES.map((target, position) => [target, source.options![order[position]]])) as Record<OptionCode, string>
      const correctPosition = order.indexOf(source.correctOption!)
      const correctOption = OPTION_CODES[correctPosition]
      answerKey[index] = correctOption
      return { ...source, index, options: nextOptions, correctOption }
    })
    variants[version] = {
      version,
      sourceQuestionOrder: orderedSource.map(question => question.index),
      sourceQuestionIds: orderedSource.map(question => sourceIds.get(question.index)!),
      optionOrders,
      questions: materialized,
      answerKey,
      contentHash: sha256(JSON.stringify(materialized)),
    }
  }

  return {
    schemaVersion: 1,
    algorithmVersion: ALGORITHM_VERSION,
    seed,
    sourceHash,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    variants,
  }
}
