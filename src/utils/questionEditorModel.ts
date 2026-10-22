import type { QuestionBankMutationInput } from '../lib/api'
import type { QuestionBankItem, QuestionDifficulty } from '../types'
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
  questionType: 'multiple_choice' | 'essay' | 'fill_blank' | 'matching'
  stem: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  correctOption: 'A' | 'B' | 'C' | 'D'
  explanation: string
  branchId: string
  blockId: string
  curriculumLevel: string
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
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correctOption: 'A',
  explanation: '',
  branchId: '',
  blockId: '',
  curriculumLevel: '',
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
    answerData: form.questionType === 'multiple_choice'
      ? { options: ['A', 'B', 'C', 'D'].map(id => ({ id, text: form[`option${id}` as keyof QuestionForm] })), correctOptionIds: [form.correctOption] }
      : structured ? { ...structured.answerData, rubric: form.explanation || undefined }
        : { rubric: form.explanation || undefined, subparts: extractEssaySubparts(form.stem), ...(form.answerLineCount !== '' ? { answerLineCount: Number(form.answerLineCount) } : {}) },
    explanation: form.explanation || null,
    branchId: form.branchId || null,
    curriculumLevel: form.curriculumLevel || null,
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
  const option = (id: string) => options.find(value => value.id === id)?.text ?? ''
  const correct = Array.isArray(answer.correctOptionIds) ? String(answer.correctOptionIds[0] ?? 'A') : 'A'
  const matchedBlock = findQuestionBlockForLevel(blocks, item.curriculumLevel)
  return {
    questionType: ['essay', 'fill_blank', 'matching'].includes(item.current.questionType) ? item.current.questionType as QuestionForm['questionType'] : 'multiple_choice',
    stem: item.current.questionType === 'matching' ? structuredQuestionText({ index: 1, question: item.current.stem, type: 'essay', responseFormat: 'matching', answerData: answer }) : item.current.stem,
    optionA: option('A'),
    optionB: option('B'),
    optionC: option('C'),
    optionD: option('D'),
    correctOption: /^[A-D]$/.test(correct) ? correct as 'A' | 'B' | 'C' | 'D' : 'A',
    explanation: item.current.explanation ?? '',
    branchId: item.branchId ?? '',
    blockId: matchedBlock?.id ?? '',
    curriculumLevel: matchedBlock?.label ?? item.curriculumLevel ?? '',
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
