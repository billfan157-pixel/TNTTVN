import type { QuestionBankMutationInput } from '../lib/api'
import type { ExamParseResult } from './examParser'
import { parseExamFromExcel, parseExamFromText } from './examParser'
import type { QuestionDifficulty } from '../types'

export type QuestionBankImportKind = 'excel' | 'word'
export const MAX_QUESTION_BANK_IMPORT_BYTES = 5 * 1024 * 1024

export interface QuestionBankImportDefaults {
  branchId: string
  curriculumLevel: string
  difficulty: QuestionDifficulty
  tags?: string[]
  lesson?: string | null
  lessonOrder?: number | null
  topic?: string | null
}

export interface QuestionBankFileParseResult {
  kind: QuestionBankImportKind
  fileName: string
  parsed: ExamParseResult
  extractorWarnings: string[]
}

export async function parseQuestionBankFile(file: File): Promise<QuestionBankFileParseResult> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['docx', 'xlsx', 'xls', 'csv'].includes(extension ?? '')) {
    throw new Error('Chỉ hỗ trợ file Excel (.xlsx, .xls, .csv) hoặc Word (.docx).')
  }
  if (file.size > MAX_QUESTION_BANK_IMPORT_BYTES) {
    throw new Error('File import không được vượt quá 5 MB.')
  }
  const buffer = await file.arrayBuffer()

  if (extension === 'docx') {
    // Lazy import keeps the DOCX ZIP/XML parser out of the normal application
    // path. Only raw text is extracted; images/macros/embedded objects are not
    // executed or uploaded.
    const module = await import('mammoth')
    const mammoth = module.default
    const result = await mammoth.extractRawText({ arrayBuffer: buffer })
    return {
      kind: 'word',
      fileName: file.name,
      parsed: parseExamFromText(result.value),
      extractorWarnings: result.messages.map(message => message.message),
    }
  }

  if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
    return {
      kind: 'excel',
      fileName: file.name,
      parsed: await parseExamFromExcel(buffer),
      extractorWarnings: [],
    }
  }

  throw new Error('Định dạng file import không hợp lệ.')
}

export function toQuestionBankImportItems(
  result: QuestionBankFileParseResult,
  defaults: QuestionBankImportDefaults,
): QuestionBankMutationInput[] {
  const source = result.kind === 'word' ? 'Import Word (.docx)' : 'Import Excel'
  return result.parsed.questions.map(question => {
    const isEssay = (question.type ?? 'multiple_choice') === 'essay'
    return {
      questionType: isEssay ? 'essay' : 'multiple_choice',
      stem: question.question,
      answerData: isEssay
        ? { rubric: null }
        : {
            options: (['A', 'B', 'C', 'D'] as const).map(id => ({ id, text: question.options?.[id] ?? '' })),
            correctOptionIds: [question.correctOption ?? 'A'],
          },
      explanation: null,
      branchId: defaults.branchId,
      curriculumLevel: defaults.curriculumLevel,
      lesson: defaults.lesson ?? null,
      lessonOrder: defaults.lessonOrder ?? null,
      topic: defaults.topic ?? null,
      difficulty: defaults.difficulty,
      tags: defaults.tags ?? [],
      source,
      provenance: 'import',
      changeNote: `Imported from ${result.kind}`,
    }
  })
}
