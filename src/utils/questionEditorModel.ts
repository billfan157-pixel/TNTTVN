import type { QuestionBankMutationInput } from '../lib/api'
import type { QuestionBankItem, QuestionDifficulty } from '../types'

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
  questionType: 'multiple_choice' | 'essay'
  stem: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  correctOption: 'A' | 'B' | 'C' | 'D'
  explanation: string
  branchId: string
  classId: string
  curriculumLevel: string
  chapter: string
  lesson: string
  lessonOrder: string
  topic: string
  difficulty: QuestionDifficulty
  tags: string
  source: string
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
  classId: '',
  curriculumLevel: '',
  chapter: '',
  lesson: '',
  lessonOrder: '',
  topic: '',
  difficulty: 'recognition',
  tags: '',
  source: '',
}

export function mutationFromQuestionForm(form: QuestionForm): QuestionBankMutationInput {
  return {
    questionType: form.questionType,
    stem: form.stem,
    answerData: form.questionType === 'multiple_choice'
      ? { options: ['A', 'B', 'C', 'D'].map(id => ({ id, text: form[`option${id}` as keyof QuestionForm] })), correctOptionIds: [form.correctOption] }
      : { rubric: form.explanation || undefined },
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

export function questionFormFromItem(item: QuestionBankItem, classes: QuestionClassOption[]): QuestionForm {
  const answer = item.current.answerData
  const options = Array.isArray(answer.options) ? answer.options as Array<{ id: string; text: string }> : []
  const option = (id: string) => options.find(value => value.id === id)?.text ?? ''
  const correct = Array.isArray(answer.correctOptionIds) ? String(answer.correctOptionIds[0] ?? 'A') : 'A'
  const matchedClass = classes.find(cls => cls.branchId === item.branchId && cls.name === item.curriculumLevel)
  return {
    questionType: item.current.questionType === 'essay' ? 'essay' : 'multiple_choice',
    stem: item.current.stem,
    optionA: option('A'),
    optionB: option('B'),
    optionC: option('C'),
    optionD: option('D'),
    correctOption: /^[A-D]$/.test(correct) ? correct as 'A' | 'B' | 'C' | 'D' : 'A',
    explanation: item.current.explanation ?? '',
    branchId: item.branchId ?? '',
    classId: matchedClass?.id ?? '',
    curriculumLevel: item.curriculumLevel ?? '',
    chapter: item.chapter ?? '',
    lesson: item.lesson ?? '',
    lessonOrder: item.lessonOrder == null ? '' : String(item.lessonOrder),
    topic: item.topic ?? '',
    difficulty: item.difficulty ?? 'recognition',
    tags: item.tags.join(', '),
    source: item.source ?? '',
  }
}
