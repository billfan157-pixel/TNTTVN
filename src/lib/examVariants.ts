import type { ExamAnswerVariants, ExamVersionCode, MultipleChoiceOption } from '../types'

export const EXAM_VERSION_CODES: ExamVersionCode[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function normalizeAnswerKey(value: unknown, questionCount?: number): Record<number, MultipleChoiceOption> | undefined {
  if (typeof value === 'string') {
    try { return normalizeAnswerKey(JSON.parse(value), questionCount) } catch { return undefined }
  }
  const object = parseObject(value)
  if (!object) return undefined
  const key: Record<number, MultipleChoiceOption> = {}
  for (const [rawIndex, option] of Object.entries(object)) {
    const index = Number(rawIndex)
    if (!Number.isInteger(index) || index < 1 || (questionCount && index > questionCount)) return undefined
    if (option !== 'A' && option !== 'B' && option !== 'C' && option !== 'D') return undefined
    key[index] = option
  }
  return Object.keys(key).length > 0 ? key : undefined
}

export function normalizeAnswerVariants(
  answerVariants: unknown,
  fallbackAnswerKey?: unknown,
  questionCount?: number,
): Partial<ExamAnswerVariants> {
  let raw = answerVariants
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { raw = undefined }
  }
  const normalized: Partial<ExamAnswerVariants> = {}
  const object = parseObject(raw)
  if (object) {
    for (const code of EXAM_VERSION_CODES) {
      const key = normalizeAnswerKey(object[code], questionCount)
      if (key) normalized[code] = key
    }
  }
  if (!normalized.A) {
    const fallback = normalizeAnswerKey(fallbackAnswerKey, questionCount)
    if (fallback) normalized.A = fallback
  }
  return normalized
}

export function getConfiguredExamVersions(answerVariants: unknown, fallbackAnswerKey?: unknown, questionCount?: number): ExamVersionCode[] {
  const variants = normalizeAnswerVariants(answerVariants, fallbackAnswerKey, questionCount)
  return EXAM_VERSION_CODES.filter(code => Boolean(variants[code]))
}
