import type { QuestionBankMutationInput } from '../lib/api'
import type { QuestionBankItem, QuestionBankType, QuestionDifficulty } from '../types'
import { findQuestionBlockForLevel, type QuestionBlockOption } from './questionBlock'
import { extractEssaySubparts, parseStructuredQuestion, structuredQuestionText } from './structuredQuestions'

export interface QuestionClassOption {
  id: string
  name: string
  branchId: string
  academicYear: string
}

export interface QuestionBranchOption {
  id: string
  name: string
}

export type QuestionForm = {
  questionType: QuestionBankType
  stem: string
  options: Array<{ id: string; text: string }>
  correctOptionIds: string[]
  trueFalseAnswer: boolean
  acceptedAnswers: string
  explanation: string
  branchId: string
  blockId: string
  curriculumLevel: string
  book: string
  chapter: string
  lesson: string
  lessonOrder: string
  topic: string
  difficulty: QuestionDifficulty
  tags: string
  source: string
  structuredAnswers: string
  wordBank: string
  answerLineCount: string
}

export const EMPTY_QUESTION: QuestionForm = {
  questionType: 'multiple_choice',
  stem: '',
  options: ['A', 'B', 'C', 'D'].map(id => ({ id, text: '' })),
  correctOptionIds: ['A'],
  trueFalseAnswer: true,
  acceptedAnswers: '',
  explanation: '',
  branchId: '',
  blockId: '',
  curriculumLevel: '',
  book: '',
  chapter: '',
  lesson: '',
  lessonOrder: '',
  topic: '',
  difficulty: 'recognition',
  tags: '',
  source: '',
  structuredAnswers: '',
  wordBank: '',
  answerLineCount: '',
}

export function mutationFromQuestionForm(form: QuestionForm): QuestionBankMutationInput {
  const structured = form.questionType === 'fill_blank' || form.questionType === 'matching'
    ? parseStructuredQuestion(`${form.stem}${form.wordBank.trim() && form.questionType === 'fill_blank' ? `\nTừ cho sẵn: ${form.wordBank}` : ''}`, form.questionType, form.structuredAnswers) : null
  return {
    questionType: form.questionType,
    stem: structured?.question ?? form.stem,
    answerData: form.questionType === 'multiple_choice' || form.questionType === 'multiple_select'
      ? { options: form.options.map(option => ({ ...option })), correctOptionIds: [...form.correctOptionIds] }
      : form.questionType === 'true_false' ? { correct: form.trueFalseAnswer }
      : form.questionType === 'short_answer' ? { acceptedAnswers: form.acceptedAnswers.split('\n').map(answer => answer.trim()).filter(Boolean) }
      : structured ? { ...structured.answerData, rubric: form.explanation || undefined }
        : { rubric: form.explanation || undefined, subparts: extractEssaySubparts(form.stem), ...(form.answerLineCount !== '' ? { answerLineCount: Number(form.answerLineCount) } : {}) },
    explanation: form.explanation || null,
    branchId: form.branchId || null,
    curriculumLevel: form.curriculumLevel || null,
    book: form.book || null,
    chapter: form.chapter || null,
    lesson: form.lesson || null,
    lessonOrder: form.lessonOrder ? Number(form.lessonOrder) : null,
    topic: form.topic || null,
    difficulty: form.difficulty,
    tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    source: form.source || null,
    provenance: 'human',
  }
}

export function questionFormFromItem(item: QuestionBankItem, blocks: QuestionBlockOption[]): QuestionForm {
  const answer = item.current.answerData
  const options = Array.isArray(answer.options) ? answer.options as Array<{ id: string; text: string }> : []
  const matchedBlock = findQuestionBlockForLevel(blocks, item.curriculumLevel)
  return {
    questionType: item.current.questionType,
    stem: item.current.questionType === 'matching' ? structuredQuestionText({ index: 1, question: item.current.stem, type: 'essay', responseFormat: 'matching', answerData: answer }) : item.current.stem,
    options: options.length ? options.map(option => ({ ...option })) : EMPTY_QUESTION.options.map(option => ({ ...option })),
    correctOptionIds: Array.isArray(answer.correctOptionIds) ? answer.correctOptionIds.map(String) : ['A'],
    trueFalseAnswer: answer.correct === true,
    acceptedAnswers: Array.isArray(answer.acceptedAnswers) ? answer.acceptedAnswers.join('\n') : '',
    explanation: item.current.explanation ?? (typeof answer.rubric === 'string' ? answer.rubric : ''),
    branchId: item.branchId ?? '',
    blockId: matchedBlock?.id ?? '',
    curriculumLevel: matchedBlock?.label ?? item.curriculumLevel ?? '',
    book: item.book ?? '',
    chapter: item.chapter ?? '',
    lesson: item.lesson ?? '',
    lessonOrder: item.lessonOrder == null ? '' : String(item.lessonOrder),
    topic: item.topic ?? '',
    difficulty: item.difficulty ?? 'recognition',
    tags: item.tags.join(', '),
    source: item.source ?? '',
    structuredAnswers: item.current.questionType === 'fill_blank'
      ? (Array.isArray(answer.blanks) ? (answer.blanks as Array<{ id: string; acceptedAnswers: string[] }>).map(blank => `${blank.id}: ${blank.acceptedAnswers.join(' | ')}`).join('; ') : Array.isArray(answer.acceptedAnswers) ? answer.acceptedAnswers.join(' | ') : '')
      : item.current.questionType === 'matching' && Array.isArray(answer.pairs) ? (answer.pairs as Array<{ leftId: string; rightId: string }>).map(pair => `${pair.leftId}-${pair.rightId}`).join('; ') : '',
    wordBank: Array.isArray(answer.wordBank) ? answer.wordBank.join(', ') : '',
    answerLineCount: typeof answer.answerLineCount === 'number' ? String(answer.answerLineCount) : '',
  }
}
