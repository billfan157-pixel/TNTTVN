import { request } from './core'
import type { QuestionBankItem, QuestionBankStatus, QuestionBankType, QuestionDifficulty, ExamBlueprint, ExamBlueprintRule, ExamSession } from '../../types'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export interface QuestionBankMutationInput {
  questionType: QuestionBankType
  stem: string
  answerData: Record<string, unknown>
  explanation?: string | null
  branchId?: string | null
  curriculumLevel?: string | null
  book?: string | null
  chapter?: string | null
  lesson?: string | null
  lessonOrder?: number | null
  topic?: string | null
  difficulty?: QuestionDifficulty | null
  tags?: string[]
  source?: string | null
  provenance?: 'human' | 'ai' | 'import'
  changeNote?: string | null
}

export const questionBankApi = {
  listQuestionBank: (params?: { search?: string; status?: QuestionBankStatus; questionType?: QuestionBankType; branchId?: string; curriculumLevel?: string; difficulty?: QuestionDifficulty; lessonFrom?: number; lessonTo?: number; topic?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    Object.entries(params ?? {}).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)) })
    return request<{ items: QuestionBankItem[]; pagination: { limit: number; offset: number; nextOffset: number | null } }>('GET', `/question-bank/questions${qs.size ? `?${qs}` : ''}`)
  },
  getQuestionBankItem: (id: string) => request<QuestionBankItem>('GET', `/question-bank/questions/${encodeURIComponent(id)}`),
  createQuestionBankItem: (data: QuestionBankMutationInput) => request<QuestionBankItem>('POST', '/question-bank/questions', data),
  importQuestionBankItems: (items: QuestionBankMutationInput[]) =>
    request<{ importedCount: number; questionIds: string[]; status: 'draft' }>('POST', '/question-bank/questions/import', { items }),
  reviseQuestionBankItem: (id: string, data: QuestionBankMutationInput) =>
    request<QuestionBankItem>('PUT', `/question-bank/questions/${encodeURIComponent(id)}`, data),
  transitionQuestionBankItem: (id: string, action: 'submit' | 'reject' | 'approve' | 'activate' | 'archive') =>
    request<QuestionBankItem>('POST', `/question-bank/questions/${encodeURIComponent(id)}/lifecycle`, { action }),
  listExamBlueprints: () => request<ExamBlueprint[]>('GET', '/question-bank/blueprints'),
  getExamBlueprint: (id: string) => request<ExamBlueprint>('GET', `/question-bank/blueprints/${encodeURIComponent(id)}`),
  createExamBlueprint: (data: { name: string; description?: string | null; branchId?: string | null; curriculumLevel?: string | null; totalQuestions: number; maxScore: number; rules: ExamBlueprintRule[] }) =>
    request<ExamBlueprint>('POST', '/question-bank/blueprints', data),
  setExamBlueprintStatus: (id: string, status: 'active' | 'archived') =>
    request<ExamBlueprint>('POST', `/question-bank/blueprints/${encodeURIComponent(id)}/status`, { status }),
  buildExamFromQuestionBank: (data: { mode: 'manual' | 'blueprint'; questionIds?: string[]; blueprintId?: string; classId: string; subject: string; scoreType: string; semester: 1 | 2; academicYear: string; maxScore: number; variantCount: number; buildCommandId: string }) =>
    request<ExamSession>('POST', '/question-bank/exams/build', data, 0, { 'Idempotency-Key': data.buildCommandId }, true),
}
