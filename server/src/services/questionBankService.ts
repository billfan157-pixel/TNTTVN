import { createHash } from 'node:crypto'
import { and, asc, desc, eq, gte, inArray, like, lte, notInArray, or, sql } from 'drizzle-orm'
import { db, runDbTransaction, type DbExecutor, type DbTransaction } from '../db/index.js'
import {
  auditLogs,
  branches,
  catechistAssignments,
  classes,
  examBlueprintRules,
  examBlueprints,
  examQuestionSnapshots,
  examSessions,
  questionBankItems,
  questionBankVersions,
} from '../db/schema.js'
import { generateExamVariantManifest, type VariantQuestion } from './examVariantManifest.js'
import { generateId } from '../utils/id.js'

export const QUESTION_TYPES = ['multiple_choice', 'true_false', 'multiple_select', 'short_answer', 'fill_blank', 'matching', 'essay'] as const
export const QUESTION_STATUSES = ['draft', 'in_review', 'approved', 'active', 'archived'] as const
export type QuestionType = typeof QUESTION_TYPES[number]
export type QuestionStatus = typeof QUESTION_STATUSES[number]
export type Difficulty = 'recognition' | 'understanding' | 'application'

export interface QuestionMetadataInput {
  branchId?: string | null
  curriculumLevel?: string | null
  book?: string | null
  chapter?: string | null
  lesson?: string | null
  lessonOrder?: number | null
  topic?: string | null
  difficulty?: Difficulty | null
  tags?: string[]
  source?: string | null
}

export interface QuestionContentInput extends QuestionMetadataInput {
  questionType: QuestionType
  stem: string
  answerData: Record<string, unknown>
  explanation?: string | null
  changeNote?: string | null
  provenance?: 'human' | 'ai' | 'import'
}

export interface BlueprintRuleInput {
  questionType: QuestionType
  chapter?: string | null
  lessonFrom?: number | null
  lessonTo?: number | null
  topic?: string | null
  difficulty?: Difficulty | null
  tags?: string[]
  questionCount: number
  pointsEach: number
  avoidRecentDays?: number
}

export interface BlueprintInput {
  name: string
  description?: string | null
  branchId?: string | null
  curriculumLevel?: string | null
  totalQuestions: number
  maxScore: number
  rules: BlueprintRuleInput[]
}

export class QuestionBankError extends Error {
  status: number
  code: string
  details?: unknown
  constructor(message: string, status = 400, code = 'QUESTION_BANK_ERROR', details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function tags(value?: string[]): string[] {
  return [...new Set((value ?? []).map(item => item.trim()).filter(Boolean))].slice(0, 30)
}

function clean(value?: string | null): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function metadata(input: QuestionMetadataInput) {
  return {
    branchId: input.branchId ?? null,
    curriculumLevel: clean(input.curriculumLevel),
    book: clean(input.book),
    chapter: clean(input.chapter),
    lesson: clean(input.lesson),
    lessonOrder: input.lessonOrder ?? null,
    topic: clean(input.topic),
    difficulty: input.difficulty ?? null,
    tags: tags(input.tags),
    source: clean(input.source),
  }
}

function validateAnswerData(type: QuestionType, data: Record<string, unknown>): void {
  if (type === 'multiple_choice' || type === 'multiple_select') {
    const options = data.options
    const correct = data.correctOptionIds
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) throw new QuestionBankError('Câu lựa chọn phải có từ 2 đến 8 phương án.')
    const ids = options.map(option => option && typeof option === 'object' ? String((option as Record<string, unknown>).id ?? '') : '')
    const texts = options.map(option => option && typeof option === 'object' ? String((option as Record<string, unknown>).text ?? '').trim() : '')
    if (ids.some(id => !/^[A-H]$/.test(id)) || new Set(ids).size !== ids.length || texts.some(text => !text)) {
      throw new QuestionBankError('Mỗi phương án cần mã A–H duy nhất và nội dung không rỗng.')
    }
    if (!Array.isArray(correct) || correct.length < 1 || correct.some(id => !ids.includes(String(id)))) throw new QuestionBankError('Đáp án đúng không khớp danh sách phương án.')
    if (type === 'multiple_choice' && correct.length !== 1) throw new QuestionBankError('Multiple Choice chỉ có đúng một đáp án.')
    return
  }
  if (type === 'true_false') {
    if (typeof data.correct !== 'boolean') throw new QuestionBankError('True/False cần trường correct dạng boolean.')
    return
  }
  if (type === 'short_answer' || type === 'fill_blank') {
    if (!Array.isArray(data.acceptedAnswers) || data.acceptedAnswers.length < 1 || data.acceptedAnswers.some(item => typeof item !== 'string' || !item.trim())) {
      throw new QuestionBankError('Câu trả lời ngắn/điền khuyết cần ít nhất một đáp án chấp nhận được.')
    }
    return
  }
  if (type === 'matching') {
    if (!Array.isArray(data.pairs) || data.pairs.length < 2) throw new QuestionBankError('Câu nối cặp cần ít nhất hai cặp.')
  }
}

function audit(tx: DbTransaction, params: { userId: string; parishId: string; action: string; entityType: string; entityId: string; summary: unknown }) {
  return tx.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    newValue: JSON.stringify(params.summary),
    parishId: params.parishId,
    createdAt: new Date().toISOString(),
  })
}

function canEditQuestion(item: typeof questionBankItems.$inferSelect, userId: string, role: string): boolean {
  return role === 'admin' || (item.createdBy === userId && item.status === 'draft')
}

async function assertBranchInParish(executor: DbExecutor, parishId: string, branchId?: string | null): Promise<void> {
  if (!branchId) return
  const [branch] = await executor.select({ id: branches.id }).from(branches).where(and(
    eq(branches.parishId, parishId),
    eq(branches.id, branchId),
  )).limit(1)
  if (!branch) throw new QuestionBankError('Ngành được chọn không tồn tại trong giáo xứ hiện tại.', 400, 'QUESTION_BRANCH_INVALID')
}

export async function createQuestion(input: QuestionContentInput, userId: string, parishId: string) {
  validateAnswerData(input.questionType, input.answerData)
  const id = generateId('QBI')
  const versionId = generateId('QBV')
  const now = new Date().toISOString()
  const meta = metadata(input)
  const contentHash = hash({ questionType: input.questionType, stem: input.stem.trim(), answerData: input.answerData, explanation: clean(input.explanation), metadata: meta })
  await runDbTransaction(async tx => {
    await assertBranchInParish(tx, parishId, input.branchId)
    await tx.insert(questionBankItems).values({
      id, parishId, status: 'draft', currentVersion: 1,
      ...meta, tags: JSON.stringify(meta.tags), provenance: input.provenance ?? 'human',
      createdBy: userId, createdAt: now, updatedAt: now,
    })
    await tx.insert(questionBankVersions).values({
      id: versionId, parishId, questionId: id, version: 1, questionType: input.questionType,
      stem: input.stem.trim(), answerData: JSON.stringify(input.answerData), explanation: clean(input.explanation),
      metadataSnapshot: JSON.stringify(meta), changeNote: clean(input.changeNote), contentHash, createdBy: userId, createdAt: now,
    })
    await audit(tx, { userId, parishId, action: 'QUESTION_CREATE', entityType: 'question_bank_item', entityId: id, summary: { version: 1, questionType: input.questionType, contentHash, provenance: input.provenance ?? 'human' } })
  })
  return getQuestion(id, parishId)
}

export async function importQuestions(
  inputs: QuestionContentInput[],
  actor: { userId: string; parishId: string },
) {
  if (inputs.length < 1 || inputs.length > 100) {
    throw new QuestionBankError('Mỗi lần import cần từ 1 đến 100 câu hỏi.', 400, 'QUESTION_IMPORT_SIZE_INVALID')
  }
  // Validate the complete payload before opening the transaction so a bad row
  // can never leave a partially imported bank.
  for (const input of inputs) validateAnswerData(input.questionType, input.answerData)

  const branchIds = [...new Set(inputs.map(input => input.branchId).filter((id): id is string => Boolean(id)))]

  const now = new Date().toISOString()
  const prepared = inputs.map(input => {
    const id = generateId('QBI')
    const versionId = generateId('QBV')
    const meta = metadata(input)
    const contentHash = hash({
      questionType: input.questionType,
      stem: input.stem.trim(),
      answerData: input.answerData,
      explanation: clean(input.explanation),
      metadata: meta,
    })
    return { input, id, versionId, meta, contentHash }
  })

  await runDbTransaction(async tx => {
    if (branchIds.length > 0) {
      const existing = await tx.select({ id: branches.id }).from(branches).where(and(
        eq(branches.parishId, actor.parishId),
        inArray(branches.id, branchIds),
      ))
      if (existing.length !== branchIds.length) {
        throw new QuestionBankError('Ngành được chọn không tồn tại trong giáo xứ hiện tại.', 400, 'QUESTION_IMPORT_BRANCH_INVALID')
      }
    }
    await tx.insert(questionBankItems).values(prepared.map(({ id, meta }) => ({
      id,
      parishId: actor.parishId,
      status: 'draft' as const,
      currentVersion: 1,
      ...meta,
      tags: JSON.stringify(meta.tags),
      provenance: 'import' as const,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    })))
    await tx.insert(questionBankVersions).values(prepared.map(({ input, id, versionId, meta, contentHash }) => ({
      id: versionId,
      parishId: actor.parishId,
      questionId: id,
      version: 1,
      questionType: input.questionType,
      stem: input.stem.trim(),
      answerData: JSON.stringify(input.answerData),
      explanation: clean(input.explanation),
      metadataSnapshot: JSON.stringify(meta),
      changeNote: clean(input.changeNote) ?? 'Imported into Question Bank',
      contentHash,
      createdBy: actor.userId,
      createdAt: now,
    })))
    for (const item of prepared) {
      await audit(tx, {
        userId: actor.userId,
        parishId: actor.parishId,
        action: 'QUESTION_IMPORT',
        entityType: 'question_bank_item',
        entityId: item.id,
        summary: { version: 1, questionType: item.input.questionType, contentHash: item.contentHash, provenance: 'import' },
      })
    }
    await audit(tx, {
      userId: actor.userId,
      parishId: actor.parishId,
      action: 'QUESTION_IMPORT_BATCH',
      entityType: 'question_bank',
      entityId: prepared[0].id,
      summary: { count: prepared.length, questionIds: prepared.map(item => item.id) },
    })
  })

  return { importedCount: prepared.length, questionIds: prepared.map(item => item.id), status: 'draft' as const }
}

export async function listQuestions(parishId: string, filters: {
  search?: string; status?: QuestionStatus; questionType?: QuestionType; branchId?: string; curriculumLevel?: string;
  difficulty?: Difficulty; lessonFrom?: number; lessonTo?: number; topic?: string; limit?: number; offset?: number;
}) {
  const conditions = [eq(questionBankItems.parishId, parishId), eq(questionBankVersions.version, questionBankItems.currentVersion)]
  if (filters.status) conditions.push(eq(questionBankItems.status, filters.status))
  if (filters.questionType) conditions.push(eq(questionBankVersions.questionType, filters.questionType))
  if (filters.branchId) conditions.push(eq(questionBankItems.branchId, filters.branchId))
  if (filters.curriculumLevel) conditions.push(eq(questionBankItems.curriculumLevel, filters.curriculumLevel))
  if (filters.difficulty) conditions.push(eq(questionBankItems.difficulty, filters.difficulty))
  if (filters.lessonFrom !== undefined) conditions.push(gte(questionBankItems.lessonOrder, filters.lessonFrom))
  if (filters.lessonTo !== undefined) conditions.push(lte(questionBankItems.lessonOrder, filters.lessonTo))
  if (filters.topic) conditions.push(like(questionBankItems.topic, `%${filters.topic}%`))
  if (filters.search) {
    const query = `%${filters.search.trim().toLowerCase()}%`
    conditions.push(or(
      sql`lower(${questionBankVersions.stem}) LIKE ${query}`,
      sql`lower(coalesce(${questionBankItems.topic}, '')) LIKE ${query}`,
      sql`lower(coalesce(${questionBankItems.lesson}, '')) LIKE ${query}`,
      sql`lower(${questionBankItems.tags}) LIKE ${query}`,
    )!)
  }
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100)
  const offset = Math.max(filters.offset ?? 0, 0)
  const rows = await db.select({ item: questionBankItems, version: questionBankVersions })
    .from(questionBankItems)
    .innerJoin(questionBankVersions, and(
      eq(questionBankVersions.parishId, questionBankItems.parishId),
      eq(questionBankVersions.questionId, questionBankItems.id),
      eq(questionBankVersions.version, questionBankItems.currentVersion),
    ))
    .where(and(...conditions)).orderBy(desc(questionBankItems.updatedAt)).limit(limit + 1).offset(offset)
  return {
    items: rows.slice(0, limit).map(row => normalizeQuestion(row.item, row.version)),
    pagination: { limit, offset, nextOffset: rows.length > limit ? offset + limit : null },
  }
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function normalizeQuestion(item: typeof questionBankItems.$inferSelect, version: typeof questionBankVersions.$inferSelect) {
  return { ...item, tags: parseJson<string[]>(item.tags), current: { ...version, answerData: parseJson<Record<string, unknown>>(version.answerData), metadataSnapshot: parseJson<Record<string, unknown>>(version.metadataSnapshot) } }
}

export async function getQuestion(id: string, parishId: string) {
  const [row] = await db.select({ item: questionBankItems, version: questionBankVersions })
    .from(questionBankItems)
    .innerJoin(questionBankVersions, and(
      eq(questionBankVersions.parishId, questionBankItems.parishId),
      eq(questionBankVersions.questionId, questionBankItems.id),
      eq(questionBankVersions.version, questionBankItems.currentVersion),
    ))
    .where(and(eq(questionBankItems.parishId, parishId), eq(questionBankItems.id, id))).limit(1)
  if (!row) throw new QuestionBankError('Không tìm thấy câu hỏi.', 404, 'QUESTION_NOT_FOUND')
  const versions = await db.select().from(questionBankVersions)
    .where(and(eq(questionBankVersions.parishId, parishId), eq(questionBankVersions.questionId, id)))
    .orderBy(desc(questionBankVersions.version))
  const usage = await db.select({
    examSessionId: examQuestionSnapshots.examSessionId,
    position: examQuestionSnapshots.sourcePosition,
    points: examQuestionSnapshots.points,
    usedAt: examQuestionSnapshots.createdAt,
    subject: examSessions.subject,
    classId: examSessions.classId,
    academicYear: examSessions.academicYear,
  }).from(examQuestionSnapshots)
    .innerJoin(examSessions, and(eq(examSessions.parishId, examQuestionSnapshots.parishId), eq(examSessions.id, examQuestionSnapshots.examSessionId)))
    .where(and(eq(examQuestionSnapshots.parishId, parishId), eq(examQuestionSnapshots.questionId, id)))
    .orderBy(desc(examQuestionSnapshots.createdAt))
  return { ...normalizeQuestion(row.item, row.version), versions: versions.map(version => ({ ...version, answerData: parseJson(version.answerData), metadataSnapshot: parseJson(version.metadataSnapshot) })), usage }
}

export async function reviseQuestion(id: string, input: QuestionContentInput, actor: { userId: string; parishId: string; role: string }) {
  validateAnswerData(input.questionType, input.answerData)
  return runDbTransaction(async tx => {
    const [item] = await tx.select().from(questionBankItems).where(and(eq(questionBankItems.parishId, actor.parishId), eq(questionBankItems.id, id))).limit(1)
    if (!item) throw new QuestionBankError('Không tìm thấy câu hỏi.', 404, 'QUESTION_NOT_FOUND')
    if (!canEditQuestion(item, actor.userId, actor.role)) throw new QuestionBankError('Bạn chỉ được sửa câu hỏi nháp do mình tạo.', 403, 'FORBIDDEN')
    if (item.status === 'archived') throw new QuestionBankError('Câu hỏi đã lưu trữ; hãy tạo câu hỏi mới thay vì sửa lịch sử.', 409, 'QUESTION_ARCHIVED')
    await assertBranchInParish(tx, actor.parishId, input.branchId)
    const meta = metadata(input)
    const nextVersion = item.currentVersion + 1
    const contentHash = hash({ questionType: input.questionType, stem: input.stem.trim(), answerData: input.answerData, explanation: clean(input.explanation), metadata: meta })
    const versionId = generateId('QBV')
    const now = new Date().toISOString()
    await tx.insert(questionBankVersions).values({
      id: versionId, parishId: actor.parishId, questionId: id, version: nextVersion, questionType: input.questionType,
      stem: input.stem.trim(), answerData: JSON.stringify(input.answerData), explanation: clean(input.explanation), metadataSnapshot: JSON.stringify(meta),
      changeNote: clean(input.changeNote), contentHash, createdBy: actor.userId, createdAt: now,
    })
    await tx.update(questionBankItems).set({ ...meta, tags: JSON.stringify(meta.tags), currentVersion: nextVersion, status: 'draft', reviewedBy: null, approvedBy: null, updatedAt: now })
      .where(and(eq(questionBankItems.parishId, actor.parishId), eq(questionBankItems.id, id)))
    await audit(tx, { userId: actor.userId, parishId: actor.parishId, action: 'QUESTION_REVISE', entityType: 'question_bank_item', entityId: id, summary: { version: nextVersion, contentHash, lifecycleReset: 'draft' } })
    return { id, version: nextVersion }
  }).then(() => getQuestion(id, actor.parishId))
}

const transitions: Record<string, { from: QuestionStatus[]; to: QuestionStatus; adminOnly?: boolean }> = {
  submit: { from: ['draft'], to: 'in_review' },
  reject: { from: ['in_review'], to: 'draft', adminOnly: true },
  approve: { from: ['in_review'], to: 'approved', adminOnly: true },
  activate: { from: ['approved'], to: 'active', adminOnly: true },
  archive: { from: ['approved', 'active'], to: 'archived', adminOnly: true },
}

export async function transitionQuestion(id: string, action: keyof typeof transitions, actor: { userId: string; parishId: string; role: string }) {
  const transition = transitions[action]
  if (!transition) throw new QuestionBankError('Hành động lifecycle không hợp lệ.')
  if (transition.adminOnly && actor.role !== 'admin') throw new QuestionBankError('Chỉ Admin được duyệt, kích hoạt hoặc lưu trữ câu hỏi.', 403, 'FORBIDDEN')
  return runDbTransaction(async tx => {
    const [item] = await tx.select().from(questionBankItems).where(and(eq(questionBankItems.parishId, actor.parishId), eq(questionBankItems.id, id))).limit(1)
    if (!item) throw new QuestionBankError('Không tìm thấy câu hỏi.', 404, 'QUESTION_NOT_FOUND')
    if (action === 'submit' && actor.role !== 'admin' && item.createdBy !== actor.userId) throw new QuestionBankError('Bạn chỉ được gửi duyệt câu hỏi do mình tạo.', 403, 'FORBIDDEN')
    if (!transition.from.includes(item.status)) throw new QuestionBankError(`Không thể chuyển từ ${item.status} bằng hành động ${action}.`, 409, 'LIFECYCLE_CONFLICT')
    const now = new Date().toISOString()
    await tx.update(questionBankItems).set({
      status: transition.to, updatedAt: now,
      reviewedBy: action === 'approve' || action === 'reject' ? actor.userId : item.reviewedBy,
      approvedBy: action === 'approve' ? actor.userId : item.approvedBy,
      archivedBy: action === 'archive' ? actor.userId : item.archivedBy,
      archivedAt: action === 'archive' ? now : item.archivedAt,
    }).where(and(eq(questionBankItems.parishId, actor.parishId), eq(questionBankItems.id, id)))
    await audit(tx, { userId: actor.userId, parishId: actor.parishId, action: `QUESTION_${action.toUpperCase()}`, entityType: 'question_bank_item', entityId: id, summary: { from: item.status, to: transition.to, version: item.currentVersion } })
  }).then(() => getQuestion(id, actor.parishId))
}

function validateBlueprint(input: BlueprintInput): void {
  const total = input.rules.reduce((sum, rule) => sum + rule.questionCount, 0)
  const points = input.rules.reduce((sum, rule) => sum + rule.questionCount * rule.pointsEach, 0)
  if (total !== input.totalQuestions) throw new QuestionBankError(`Tổng số câu trong các dòng (${total}) không khớp tổng blueprint (${input.totalQuestions}).`)
  if (Math.abs(points - input.maxScore) > 0.005) throw new QuestionBankError(`Tổng điểm blueprint (${points}) phải bằng thang điểm (${input.maxScore}).`)
  for (const rule of input.rules) {
    if (rule.lessonFrom != null && rule.lessonTo != null && rule.lessonFrom > rule.lessonTo) throw new QuestionBankError('Khoảng bài trong blueprint không hợp lệ.')
  }
}

export async function createBlueprint(input: BlueprintInput, userId: string, parishId: string) {
  validateBlueprint(input)
  const id = generateId('EBP')
  const now = new Date().toISOString()
  await runDbTransaction(async tx => {
    await assertBranchInParish(tx, parishId, input.branchId)
    await tx.insert(examBlueprints).values({ id, parishId, name: input.name.trim(), description: clean(input.description), branchId: input.branchId ?? null, curriculumLevel: clean(input.curriculumLevel), totalQuestions: input.totalQuestions, maxScore: input.maxScore, createdBy: userId, updatedBy: userId, createdAt: now, updatedAt: now })
    await tx.insert(examBlueprintRules).values(input.rules.map((rule, index) => ({
      id: generateId('EBR'), parishId, blueprintId: id, ordinal: index + 1, questionType: rule.questionType,
      chapter: clean(rule.chapter), lessonFrom: rule.lessonFrom ?? null, lessonTo: rule.lessonTo ?? null,
      topic: clean(rule.topic), difficulty: rule.difficulty ?? null, tags: JSON.stringify(tags(rule.tags)),
      questionCount: rule.questionCount, pointsEach: rule.pointsEach, avoidRecentDays: rule.avoidRecentDays ?? 0,
    })))
    await audit(tx, { userId, parishId, action: 'EXAM_BLUEPRINT_CREATE', entityType: 'exam_blueprint', entityId: id, summary: { totalQuestions: input.totalQuestions, maxScore: input.maxScore, ruleCount: input.rules.length } })
  })
  return getBlueprint(id, parishId)
}

export async function listBlueprints(parishId: string) {
  return db.select().from(examBlueprints).where(eq(examBlueprints.parishId, parishId)).orderBy(desc(examBlueprints.updatedAt))
}

export async function getBlueprint(id: string, parishId: string, executor: DbExecutor = db) {
  const [blueprint] = await executor.select().from(examBlueprints).where(and(eq(examBlueprints.parishId, parishId), eq(examBlueprints.id, id))).limit(1)
  if (!blueprint) throw new QuestionBankError('Không tìm thấy ma trận đề.', 404, 'BLUEPRINT_NOT_FOUND')
  const rules = await executor.select().from(examBlueprintRules).where(and(eq(examBlueprintRules.parishId, parishId), eq(examBlueprintRules.blueprintId, id))).orderBy(asc(examBlueprintRules.ordinal))
  return { ...blueprint, rules: rules.map(rule => ({ ...rule, tags: parseJson<string[]>(rule.tags) })) }
}

export async function setBlueprintStatus(id: string, status: 'active' | 'archived', actor: { userId: string; parishId: string; role: string }) {
  if (actor.role !== 'admin') throw new QuestionBankError('Chỉ Admin được kích hoạt hoặc lưu trữ ma trận đề.', 403, 'FORBIDDEN')
  return runDbTransaction(async tx => {
    const [current] = await tx.select().from(examBlueprints).where(and(eq(examBlueprints.parishId, actor.parishId), eq(examBlueprints.id, id))).limit(1)
    if (!current) throw new QuestionBankError('Không tìm thấy ma trận đề.', 404, 'BLUEPRINT_NOT_FOUND')
    if (status === 'active' && current.status !== 'draft') throw new QuestionBankError('Chỉ ma trận nháp mới được kích hoạt.', 409, 'LIFECYCLE_CONFLICT')
    await tx.update(examBlueprints).set({ status, updatedBy: actor.userId, updatedAt: new Date().toISOString() }).where(and(eq(examBlueprints.parishId, actor.parishId), eq(examBlueprints.id, id)))
    await audit(tx, { userId: actor.userId, parishId: actor.parishId, action: `EXAM_BLUEPRINT_${status.toUpperCase()}`, entityType: 'exam_blueprint', entityId: id, summary: { from: current.status, to: status, version: current.version } })
  }).then(() => getBlueprint(id, actor.parishId))
}

function deterministicOrder<T>(rows: T[], seed: string, getId: (row: T) => string): T[] {
  return [...rows].sort((a, b) => hash(`${seed}:${getId(a)}`).localeCompare(hash(`${seed}:${getId(b)}`)))
}

type VersionRow = { item: typeof questionBankItems.$inferSelect; version: typeof questionBankVersions.$inferSelect; points: number }

function toExamQuestion(row: VersionRow, index: number): VariantQuestion & { sourceQuestionId: string; sourceVersionId: string } {
  const answer = parseJson<Record<string, unknown>>(row.version.answerData)
  if (row.version.questionType === 'essay') return { index, question: row.version.stem, type: 'essay', explanation: row.version.explanation ?? undefined, points: row.points, sourceQuestionId: row.item.id, sourceVersionId: row.version.id }
  if (row.version.questionType !== 'multiple_choice') throw new QuestionBankError(`Smart Exam hiện chưa hỗ trợ loại ${row.version.questionType}; câu ${row.item.id} không được materialize.`, 422, 'QUESTION_TYPE_NOT_SUPPORTED')
  const options = answer.options
  const correct = answer.correctOptionIds
  if (!Array.isArray(options) || options.length !== 4 || !Array.isArray(correct) || correct.length !== 1) throw new QuestionBankError(`Câu ${row.item.id} không có đúng 4 lựa chọn cho OMR.`, 422, 'OMR_INCOMPATIBLE_QUESTION')
  const optionMap = Object.fromEntries(options.map(option => [String((option as Record<string, unknown>).id), String((option as Record<string, unknown>).text)])) as Record<'A'|'B'|'C'|'D', string>
  if (!['A', 'B', 'C', 'D'].every(code => optionMap[code as keyof typeof optionMap])) throw new QuestionBankError(`Câu ${row.item.id} cần đủ phương án A/B/C/D cho OMR.`, 422, 'OMR_INCOMPATIBLE_QUESTION')
  return { index, question: row.version.stem, type: 'multiple_choice', options: optionMap, correctOption: String(correct[0]) as 'A'|'B'|'C'|'D', explanation: row.version.explanation ?? undefined, points: row.points, sourceQuestionId: row.item.id, sourceVersionId: row.version.id }
}

async function currentVersionRows(parishId: string, questionIds?: string[], executor: DbExecutor = db) {
  const conditions = [eq(questionBankItems.parishId, parishId), eq(questionBankItems.status, 'active'), eq(questionBankVersions.version, questionBankItems.currentVersion)]
  if (questionIds) conditions.push(inArray(questionBankItems.id, questionIds))
  return executor.select({ item: questionBankItems, version: questionBankVersions }).from(questionBankItems)
    .innerJoin(questionBankVersions, and(eq(questionBankVersions.parishId, questionBankItems.parishId), eq(questionBankVersions.questionId, questionBankItems.id), eq(questionBankVersions.version, questionBankItems.currentVersion)))
    .where(and(...conditions))
}

export async function buildExamFromBank(input: {
  mode: 'manual' | 'blueprint'; questionIds?: string[]; blueprintId?: string; classId: string; subject: string;
  scoreType: 'oral'|'15m'|'1period'|'midterm'|'final'; semester: 1|2; academicYear: string; maxScore: number; variantCount: number; seed?: string;
  buildCommandId: string;
}, actor: { userId: string; parishId: string; role: string }) {
  return runDbTransaction(async tx => {
  const [classRow] = await tx.select({ id: classes.id }).from(classes).where(and(eq(classes.parishId, actor.parishId), eq(classes.id, input.classId))).limit(1)
  if (!classRow) throw new QuestionBankError('Lớp học không tồn tại.', 404, 'CLASS_NOT_FOUND')
  if (actor.role !== 'admin') {
    const [assignment] = await tx.select({ id: catechistAssignments.id }).from(catechistAssignments).where(and(
      eq(catechistAssignments.parishId, actor.parishId),
      eq(catechistAssignments.userId, actor.userId),
      eq(catechistAssignments.classId, input.classId),
    )).limit(1)
    if (!assignment) throw new QuestionBankError('Bạn không có quyền tạo đề cho lớp này.', 403, 'FORBIDDEN')
  }
  const seed = input.seed?.trim() || `question-bank:${input.buildCommandId}`
  const idempotencyKey = `question-bank:${input.buildCommandId}`
  const buildRequestHash = hash({
    mode: input.mode,
    questionIds: input.mode === 'manual' ? input.questionIds ?? [] : null,
    blueprintId: input.mode === 'blueprint' ? input.blueprintId ?? null : null,
    classId: input.classId,
    subject: input.subject.trim(),
    scoreType: input.scoreType,
    semester: input.semester,
    academicYear: input.academicYear,
    maxScore: input.maxScore,
    variantCount: input.variantCount,
    seed,
  })
  const [existingBuild] = await tx.select().from(examSessions).where(and(
    eq(examSessions.parishId, actor.parishId),
    eq(examSessions.idempotencyKey, idempotencyKey),
  )).limit(1)
  if (existingBuild) {
    if (existingBuild.buildRequestHash !== buildRequestHash) {
      throw new QuestionBankError(
        'buildCommandId đã được dùng cho một cấu hình đề khác.',
        409,
        'QUESTION_BANK_BUILD_IDEMPOTENCY_CONFLICT',
      )
    }
    return existingBuild
  }
  let resolvedMaxScore = input.maxScore
  let selected: VersionRow[] = []
  let blueprintSnapshot: Record<string, unknown> | null = null
  if (input.mode === 'manual') {
    const ids = [...new Set(input.questionIds ?? [])]
    if (ids.length < 1 || ids.length > 50) throw new QuestionBankError('Chọn từ 1 đến 50 câu hỏi.')
    const rows = await currentVersionRows(actor.parishId, ids, tx)
    if (rows.length !== ids.length) throw new QuestionBankError('Một số câu không tồn tại, chưa Active hoặc không thuộc giáo xứ.', 422, 'QUESTION_SELECTION_INVALID')
    const byId = new Map(rows.map(row => [row.item.id, row]))
    // Distribute integer cents so the immutable per-question points add up to
    // maxScore exactly (e.g. 10/3 => 3.34 + 3.33 + 3.33, never 9.99).
    const totalCents = input.maxScore * 100
    const baseCents = Math.floor(totalCents / ids.length)
    const remainder = totalCents % ids.length
    selected = ids.map((id, index) => ({
      ...byId.get(id)!,
      points: (baseCents + (index < remainder ? 1 : 0)) / 100,
    }))
  } else {
    if (!input.blueprintId) throw new QuestionBankError('Thiếu ma trận đề.')
    const blueprint = await getBlueprint(input.blueprintId, actor.parishId, tx)
    if (blueprint.status !== 'active') throw new QuestionBankError('Chỉ ma trận Active mới được sinh đề.', 409, 'BLUEPRINT_NOT_ACTIVE')
    resolvedMaxScore = blueprint.maxScore
    const used = new Set<string>()
    const shortages: Array<{ rule: number; required: number; available: number }> = []
    for (const rule of blueprint.rules) {
      const conditions = [
        eq(questionBankItems.parishId, actor.parishId), eq(questionBankItems.status, 'active'),
        eq(questionBankVersions.version, questionBankItems.currentVersion), eq(questionBankVersions.questionType, rule.questionType),
      ]
      if (blueprint.branchId) conditions.push(eq(questionBankItems.branchId, blueprint.branchId))
      if (blueprint.curriculumLevel) conditions.push(eq(questionBankItems.curriculumLevel, blueprint.curriculumLevel))
      if (rule.chapter) conditions.push(eq(questionBankItems.chapter, rule.chapter))
      if (rule.lessonFrom != null) conditions.push(gte(questionBankItems.lessonOrder, rule.lessonFrom))
      if (rule.lessonTo != null) conditions.push(lte(questionBankItems.lessonOrder, rule.lessonTo))
      if (rule.topic) conditions.push(eq(questionBankItems.topic, rule.topic))
      if (rule.difficulty) conditions.push(eq(questionBankItems.difficulty, rule.difficulty))
      if (used.size) conditions.push(notInArray(questionBankItems.id, [...used]))
      if (rule.avoidRecentDays > 0) {
        const cutoff = new Date(Date.now() - rule.avoidRecentDays * 86_400_000).toISOString()
        const recent = await tx.select({ id: examQuestionSnapshots.questionId }).from(examQuestionSnapshots)
          .where(and(eq(examQuestionSnapshots.parishId, actor.parishId), gte(examQuestionSnapshots.createdAt, cutoff)))
        const recentIds = [...new Set(recent.map(row => row.id))]
        if (recentIds.length) conditions.push(notInArray(questionBankItems.id, recentIds))
      }
      let candidates = await tx.select({ item: questionBankItems, version: questionBankVersions }).from(questionBankItems)
        .innerJoin(questionBankVersions, and(eq(questionBankVersions.parishId, questionBankItems.parishId), eq(questionBankVersions.questionId, questionBankItems.id), eq(questionBankVersions.version, questionBankItems.currentVersion)))
        .where(and(...conditions)).limit(1000)
      const requiredTags = rule.tags
      if (requiredTags.length) candidates = candidates.filter(row => requiredTags.every(tag => parseJson<string[]>(row.item.tags).includes(tag)))
      if (candidates.length < rule.questionCount) shortages.push({ rule: rule.ordinal, required: rule.questionCount, available: candidates.length })
      for (const row of deterministicOrder(candidates, `${seed}:rule:${rule.ordinal}`, candidate => candidate.item.id).slice(0, rule.questionCount)) {
        used.add(row.item.id)
        selected.push({ ...row, points: rule.pointsEach })
      }
    }
    if (shortages.length) throw new QuestionBankError('Ngân hàng chưa đủ câu để đáp ứng toàn bộ ma trận; không tạo đề.', 422, 'BLUEPRINT_SHORTAGE', shortages)
    blueprintSnapshot = { ...blueprint, generatedWithSeed: seed }
  }
  if (selected.length < 1 || selected.length > 50) throw new QuestionBankError('Đề phải có từ 1 đến 50 câu.')
  const mcRows = selected.filter(row => row.version.questionType !== 'essay')
  const essayRows = selected.filter(row => row.version.questionType === 'essay')
  const ordered = [...mcRows, ...essayRows]
  const questions = ordered.map((row, index) => toExamQuestion(row, index + 1))
  const questionCount = mcRows.length
  const examType = questionCount === 0 ? 'written' : essayRows.length ? 'mixed' : 'multiple_choice'
  const answerKey = Object.fromEntries(questions.filter(question => question.type !== 'essay').map(question => [question.index, question.correctOption]))
  const manifest = questionCount > 0 ? generateExamVariantManifest({ questions, questionCount, variantCount: input.variantCount, seed }) : null
  const answerVariants = manifest ? Object.fromEntries(Object.entries(manifest.variants).map(([code, entry]) => [code, entry!.answerKey])) : null
  const sessionId = generateId('EXS')
  const now = new Date().toISOString()
  await tx.insert(examSessions).values({
      id: sessionId, parishId: actor.parishId, classId: input.classId, subject: input.subject.trim(), scoreType: input.scoreType,
      maxScore: resolvedMaxScore, semester: input.semester, academicYear: input.academicYear, status: 'draft', createdBy: actor.userId,
      examType, questionCount: questionCount || null, answerKey: questionCount ? JSON.stringify(manifest?.variants.A?.answerKey ?? answerKey) : null,
      answerVariants: answerVariants ? JSON.stringify(answerVariants) : null, variantManifests: manifest ? JSON.stringify(manifest) : null,
      questions: JSON.stringify(questions), sourceType: input.mode === 'manual' ? 'question_bank' : 'blueprint', blueprintId: input.blueprintId ?? null,
      blueprintSnapshot: blueprintSnapshot ? JSON.stringify(blueprintSnapshot) : null,
      buildRequestHash,
      idempotencyKey,
      createdAt: now,
  })
  await tx.insert(examQuestionSnapshots).values(ordered.map((row, index) => ({
      id: generateId('EQS'), parishId: actor.parishId, examSessionId: sessionId, questionId: row.item.id, questionVersionId: row.version.id,
      sourcePosition: index + 1, points: row.points,
      snapshotJson: JSON.stringify({ ...questions[index], metadata: parseJson(row.version.metadataSnapshot), answerData: parseJson(row.version.answerData) }),
      contentHash: row.version.contentHash, createdAt: now,
  })))
  await audit(tx, { userId: actor.userId, parishId: actor.parishId, action: 'EXAM_BUILD_FROM_BANK', entityType: 'exam_session', entityId: sessionId, summary: { mode: input.mode, blueprintId: input.blueprintId ?? null, questionCount: selected.length, mcQuestionCount: questionCount, variantCount: manifest ? Object.keys(manifest.variants).length : 0, sourceHashes: ordered.map(row => row.version.contentHash) } })
  const [session] = await tx.select().from(examSessions).where(and(eq(examSessions.parishId, actor.parishId), eq(examSessions.id, sessionId))).limit(1)
  return session
  })
}
