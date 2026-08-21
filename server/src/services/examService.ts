import { db, runDbTransaction, type DbExecutor, type DbTransaction } from '../db/index.js'
import { examSessions, examResults, examFinalizations, examFinalizationItems, assessmentEntries, auditLogs, students, classes, grades, gradeOverrides } from '../db/schema.js'
import { eq, and, inArray, isNull, notInArray } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { semesterLockSpecification } from '../domain/SemesterLockSpecification.js'
import { normalizeAcademicYear } from '../utils/academicYear.js'
import { upsertGrade } from './gradeService.js'
import { getActiveAcademicYearId } from './academicYearService.js'

export type ExamScoreType = 'oral' | '15m' | '1period' | 'midterm' | 'final'
export type ExamSessionStatus = 'draft' | 'completed'
export type ExamResultSource = 'qr_scan' | 'omr' | 'quick_entry'

type MultipleChoiceAnswer = 'A' | 'B' | 'C' | 'D' | null
type ExamVersionCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'

function normalizeExamVersion(input: string | undefined): ExamVersionCode {
  const version = (input || 'A').trim().toUpperCase()
  if (!/^[A-H]$/.test(version)) badRequest('Mã đề phải nằm trong A–H.')
  return version as ExamVersionCode
}

function resolveAnswerKeyForVersion(
  answerKey: string | null,
  answerVariants: string | null,
  examVersion: ExamVersionCode,
): string | null {
  if (answerVariants) {
    try {
      const parsed = JSON.parse(answerVariants) as Record<string, unknown>
      const selected = parsed[examVersion]
      if (selected && typeof selected === 'object' && !Array.isArray(selected)) return JSON.stringify(selected)
    } catch {
      badRequest('Cấu hình nhiều mã đề của phiên bị lỗi JSON.')
    }
  }
  return examVersion === 'A' ? answerKey : null
}

function badRequest(message: string): never {
  const err = new Error(message) as Error & { status: number }
  err.status = 400
  throw err
}

function parseSubmittedAnswers(input: string | undefined, questionCount: number): Record<number, MultipleChoiceAnswer> {
  if (!input) badRequest('Kết quả quét trắc nghiệm thiếu answers; server không thể tự tính lại điểm.')
  let parsed: unknown
  try { parsed = JSON.parse(input) } catch { badRequest('answers phải là JSON hợp lệ.') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) badRequest('answers phải là JSON object.')
  const normalized: Record<number, MultipleChoiceAnswer> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (key.startsWith('_')) continue
    const index = Number(key)
    if (!Number.isInteger(index) || index < 1 || index > questionCount) {
      badRequest(`answers chứa số câu không hợp lệ: ${key}.`)
    }
    if (value !== null && value !== 'A' && value !== 'B' && value !== 'C' && value !== 'D') {
      badRequest(`Đáp án câu ${key} phải là A/B/C/D hoặc null.`)
    }
    normalized[index] = value as MultipleChoiceAnswer
  }
  if (!Object.values(normalized).some(value => value !== null)) {
    badRequest('Phiếu chưa có đáp án nào được tô; hệ thống không ghi điểm.')
  }
  return normalized
}

function computeMultipleChoiceScore(
  answers: Record<number, MultipleChoiceAnswer>,
  answerKeyJson: string | null,
  questionCount: number,
  maxScore: number,
): number {
  if (!answerKeyJson) badRequest('Phiên trắc nghiệm chưa có đáp án chuẩn; không thể lưu kết quả quét.')
  let answerKey: Record<string, unknown>
  try { answerKey = JSON.parse(answerKeyJson) as Record<string, unknown> } catch { badRequest('Đáp án chuẩn của phiên bị lỗi JSON.') }
  let correct = 0
  for (let index = 1; index <= questionCount; index++) {
    const expected = answerKey[String(index)]
    if (answers[index] !== null && answers[index] !== undefined && answers[index] === expected) correct++
  }
  return Math.round((correct / questionCount) * maxScore * 10) / 10
}

function sanitizeScanMetadata(input: string | undefined): string | null {
  if (!input) return null
  let parsed: unknown
  try { parsed = JSON.parse(input) } catch { badRequest('scanMetadata phải là JSON hợp lệ.') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) badRequest('scanMetadata phải là JSON object.')
  const object = parsed as Record<string, unknown>
  const containsForbiddenData = (value: unknown): boolean => {
    if (typeof value === 'string') return /data:image\//i.test(value)
    if (Array.isArray(value)) return value.some(containsForbiddenData)
    if (!value || typeof value !== 'object') return false
    return Object.entries(value as Record<string, unknown>).some(([key, nested]) => (
      /(image|photo|frame|blob|base64)/i.test(key) || containsForbiddenData(nested)
    ))
  }
  const serialized = JSON.stringify(object)
  if (containsForbiddenData(object)) badRequest('scanMetadata không được chứa ảnh hoặc dữ liệu base64.')
  if (object.detectionStatus && object.detectionStatus !== 'accepted') {
    badRequest('Kết quả OMR còn ở trạng thái cần kiểm tra hoặc bị từ chối; chưa được ghi điểm.')
  }
  return serialized
}

const SCORE_FIELD_MAP = {
  oral: { field: 'scoreOral', sourceColumn: 'scoreOralSource', sourceKey: 'scoreOral_source', updatedAtKey: 'scoreOral_updated_at' },
  '15m': { field: 'score15m', sourceColumn: 'score15mSource', sourceKey: 'score15m_source', updatedAtKey: 'score15m_updated_at' },
  '1period': { field: 'score1Period', sourceColumn: 'score1PeriodSource', sourceKey: 'score1Period_source', updatedAtKey: 'score1Period_updated_at' },
  midterm: { field: 'scoreMidterm', sourceColumn: 'scoreMidtermSource', sourceKey: 'scoreMidterm_source', updatedAtKey: 'scoreMidterm_updated_at' },
  final: { field: 'scoreFinal', sourceColumn: 'scoreFinalSource', sourceKey: 'scoreFinal_source', updatedAtKey: 'scoreFinal_updated_at' },
} as const

const DAILY_SCORE_TYPES = new Set<ExamScoreType>(['oral', '15m', '1period'])
const PROTECTED_GRADE_SOURCES = new Set(['manual', 'override', 'excel_import'])

export interface ExamFinalizationItemResult {
  studentId: string
  examResultId: string
  gradeId: string | null
  scoreField: string
  status: 'committed' | 'conflict'
  existingSource: string | null
  rawScore: number
  finalScore: number | null
}

export interface ExamFinalizationResult {
  session: typeof examSessions.$inferSelect
  finalizationId: string | null
  items: ExamFinalizationItemResult[]
  committed: number
  conflicts: number
  legacy: boolean
}

export class ExamNotFoundError extends Error {
  public statusCode = 404
  constructor(message = 'Phiên chấm không tồn tại') {
    super(message)
    this.name = 'ExamNotFoundError'
  }
}

export class ExamStateError extends Error {
  public statusCode = 409
  constructor(message: string) {
    super(message)
    this.name = 'ExamStateError'
  }
}

export class ExamAccessError extends Error {
  public statusCode = 403
  constructor(message: string) {
    super(message)
    this.name = 'ExamAccessError'
  }
}

export interface ExamSessionData {
  classId: string
  subject: string
  scoreType: ExamScoreType
  maxScore?: number
  semester: 1 | 2
  academicYear?: string
  examType?: 'written' | 'multiple_choice'
  questionCount?: number
  answerKey?: string
  answerVariants?: string
  questions?: string
  idempotencyKey?: string
}

function audit(tx: DbTransaction, params: { userId: string; parishId: string; ip: string; userAgent: string; action: string; entityType: string; entityId: string; oldValue?: string | null; newValue?: string | null }) {
  return tx.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    oldValue: params.oldValue ?? null,
    newValue: params.newValue ?? null,
    ip: params.ip,
    userAgent: params.userAgent,
    parishId: params.parishId,
    createdAt: new Date().toISOString(),
  })
}

function isSqliteBusyError(error: unknown): boolean {
  let current: unknown = error
  const visited = new Set<unknown>()
  for (let depth = 0; depth < 8 && current && typeof current === 'object' && !visited.has(current); depth++) {
    visited.add(current)
    const candidate = current as { code?: unknown; extendedCode?: unknown; cause?: unknown }
    if (
      (typeof candidate.code === 'string' && candidate.code.startsWith('SQLITE_BUSY'))
      || (typeof candidate.extendedCode === 'string' && candidate.extendedCode.startsWith('SQLITE_BUSY'))
    ) return true
    current = candidate.cause
  }
  return false
}

async function withSqliteBusyRetry<T>(operation: () => Promise<T>, maxAttempts = 16): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await operation()
    } catch (error) {
      attempt++
      if (!isSqliteBusyError(error) || attempt >= maxAttempts) throw error
      const baseDelayMs = Math.min(250, 20 * 2 ** (attempt - 1))
      const jitterMs = Math.floor(Math.random() * Math.max(20, Math.floor(baseDelayMs * 0.35)))
      await new Promise(resolve => setTimeout(resolve, baseDelayMs + jitterMs))
    }
  }
}

export async function createExamSession(data: ExamSessionData, userId: string, parishId: string, ip: string, userAgent: string) {
  if (data.idempotencyKey) {
    const existing = await db
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.idempotencyKey, data.idempotencyKey), eq(examSessions.parishId, parishId)))
      .limit(1)
    if (existing.length > 0) return existing[0]
  }

  // EXAM-AUDIT F4 (2026-08-21): fallback mặc định = NĂM HỌC ĐANG HOẠT ĐỘNG của
  // giáo xứ (năm có range ngày chứa hôm nay, fallback năm mới nhất — khớp
  // BUSINESS_RULES "Tạo phiên chấm" quy tắc 2 và getOpenSemester), KHÔNG còn
  // theo lịch tháng 8. Client luôn gửi năm hoạt động; fallback này cho API call
  // trực tiếp để điểm finalize không rơi nhầm năm.
  const normYear = data.academicYear ? normalizeAcademicYear(data.academicYear) : await getActiveAcademicYearId(parishId)
  const id = generateId('EXS')
  const now = new Date().toISOString()

  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, data.classId), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) {
    const err = new Error('Lớp học không tồn tại hoặc đã bị xóa') as any
    err.status = 404
    throw err
  }

  const row = {
    id,
    parishId,
    classId: data.classId,
    subject: data.subject,
    scoreType: data.scoreType,
    maxScore: data.maxScore ?? 10,
    semester: data.semester,
    academicYear: normYear,
    examType: data.examType ?? 'written',
    questionCount: data.questionCount ?? null,
    answerKey: data.answerKey ?? null,
    answerVariants: data.answerVariants ?? (data.answerKey ? JSON.stringify({ A: JSON.parse(data.answerKey) }) : null),
    questions: data.questions ?? null,
    idempotencyKey: data.idempotencyKey ?? undefined,
    status: 'draft' as const,
    createdBy: userId,
    completedBy: null,
    completedAt: null,
    createdAt: now,
  }
  // EXAM-AUDIT F6 (2026-08-21): insert + audit trong 1 transaction; request song
  // song cùng idempotencyKey thắng UNIQUE → trả về bản ghi của request thắng
  // (cùng pattern IDEM-F3 của studentService) thay vì 500.
  try {
    await runDbTransaction(async (tx) => {
      await tx.insert(examSessions).values(row)
      await audit(tx as DbTransaction, {
        userId, parishId, ip, userAgent,
        action: 'EXAM_CREATE',
        entityType: 'exam_session',
        entityId: id,
        oldValue: null,
        newValue: JSON.stringify(row),
      })
    })
  } catch (err) {
    const messages = `${String((err as any)?.message ?? '')} ${String((err as any)?.cause?.message ?? '')}`
    const isUnique = String((err as any)?.code ?? '').includes('SQLITE_CONSTRAINT_UNIQUE')
      || String((err as any)?.cause?.code ?? '').includes('SQLITE_CONSTRAINT_UNIQUE')
      || messages.includes('UNIQUE constraint failed')
    if (isUnique && data.idempotencyKey && messages.includes('idempotency_key')) {
      const [winner] = await db
        .select()
        .from(examSessions)
        .where(and(eq(examSessions.idempotencyKey, data.idempotencyKey), eq(examSessions.parishId, parishId)))
        .limit(1)
      if (winner) return winner
    }
    throw err
  }
  return row
}

export async function listExamSessions(parishId: string, classIds: string[] | null, filters?: { subject?: string; scoreType?: ExamScoreType; status?: ExamSessionStatus }) {
  const conditions = [eq(examSessions.parishId, parishId)]
  // EXAM-AUDIT F1 (2026-08-21): classIds = [] (không được phân công lớp nào)
  // phải trả DANH SÁCH RỖNG — trước đây `length > 0` khiến filter bị bỏ qua và
  // trả TOÀN BỘ phiên chấm của giáo xứ cho tài khoản không có phân công.
  if (classIds !== null) {
    if (classIds.length === 0) return []
    conditions.push(inArray(examSessions.classId, classIds))
  }
  if (filters?.subject) conditions.push(eq(examSessions.subject, filters.subject))
  if (filters?.scoreType) conditions.push(eq(examSessions.scoreType, filters.scoreType))
  if (filters?.status) conditions.push(eq(examSessions.status, filters.status))
  const rows = await db.select().from(examSessions).where(and(...conditions))
  return rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

export async function getExamSession(sessionId: string, parishId: string, executor: DbExecutor = db) {
  const [session] = await executor
    .select().from(examSessions)
    .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))
    .limit(1)
  if (!session) throw new ExamNotFoundError()
  return session
}

async function assertSessionAccess(sessionId: string, parishId: string, allowedClassIds: string[] | null, executor: DbExecutor = db) {
  // EXAM-AUDIT F7 (2026-08-21): nhận executor để caller trong transaction đọc
  // cùng snapshot thay vì qua global db (mixed-executor hygiene).
  const session = await getExamSession(sessionId, parishId, executor)
  if (allowedClassIds && !allowedClassIds.includes(session.classId)) {
    throw new ExamAccessError('Bạn không có quyền thao tác trên phiên chấm của lớp này')
  }
  return session
}

export async function upsertExamResults(
  sessionId: string,
  results: { studentId: string; score: number; source?: ExamResultSource; answers?: string; scanMetadata?: string; examVersion?: string }[],
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
  allowedClassIds: string[] | null
) {
  if (!results || results.length === 0) {
    const err = new Error('Danh sách kết quả trống') as any
    err.status = 400
    throw err
  }

  return withSqliteBusyRetry(() => db.transaction(async (tx) => {
    // libSQL/SQLite starts transactions as deferred. If every concurrent saver
    // reads first, they all establish a read snapshot and the losers later fail
    // with SQLITE_BUSY_SNAPSHOT while upgrading to a writer. Make a harmless
    // conditional write the first statement so contenders serialize before any
    // validation read snapshot is created. The status guard also prevents a save
    // from racing past a concurrent finalization.
    await tx
      .update(examSessions)
      .set({ status: 'draft' })
      .where(and(
        eq(examSessions.id, sessionId),
        eq(examSessions.parishId, parishId),
        eq(examSessions.status, 'draft'),
      ))

    const [session] = await tx
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))
      .limit(1)
    if (!session) throw new ExamNotFoundError()
    if (allowedClassIds && !allowedClassIds.includes(session.classId)) {
      throw new ExamAccessError('Bạn không có quyền thao tác trên phiên chấm của lớp này')
    }
    if (session.status === 'completed') {
      throw new ExamStateError('Phiên chấm đã hoàn tất. Mở lại phiên (admin) trước khi sửa kết quả.')
    }

    const studentIds = [...new Set(results.map(r => r.studentId))]
    const classStudents = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.classId, session.classId),
        eq(students.parishId, parishId),
        isNull(students.deletedAt),
        inArray(students.id, studentIds),
      ))
    const validIds = new Set(classStudents.map(s => s.id))
    const unknown = studentIds.filter(id => !validIds.has(id))
    if (unknown.length > 0) {
      const err = new Error('Một số thiếu nhi không thuộc lớp học của phiên chấm hoặc không tồn tại') as any
      err.status = 400
      err.details = unknown
      throw err
    }

    let saved = 0
    let upserted = 0
    const adjustments: Array<{ studentId: string; clientScore: number; serverScore: number }> = []
    const now = new Date().toISOString()
    for (const r of results) {
      const source = r.source ?? 'qr_scan'
      const examVersion = normalizeExamVersion(r.examVersion)
      const scanMetadata = sanitizeScanMetadata(r.scanMetadata)
      let authoritativeScore = r.score
      if (session.examType === 'multiple_choice' && (source === 'omr' || source === 'qr_scan')) {
        const totalQuestions = session.questionCount ?? 0
        if (totalQuestions < 1 || totalQuestions > 50) badRequest('Số câu của phiên trắc nghiệm không hợp lệ.')
        const parsedAnswers = parseSubmittedAnswers(r.answers, totalQuestions)
        const versionAnswerKey = resolveAnswerKeyForVersion(session.answerKey, session.answerVariants, examVersion)
        if (!versionAnswerKey) badRequest(`Phiên chưa cấu hình đáp án cho mã đề ${examVersion}.`)
        authoritativeScore = computeMultipleChoiceScore(parsedAnswers, versionAnswerKey, totalQuestions, session.maxScore)
        if (Math.abs(authoritativeScore - r.score) > 0.0001) {
          adjustments.push({ studentId: r.studentId, clientScore: r.score, serverScore: authoritativeScore })
        }
      }
      if (!Number.isFinite(authoritativeScore) || authoritativeScore < 0 || authoritativeScore > session.maxScore) {
        const err = new Error(`Điểm không hợp lệ (0–${session.maxScore})`) as any
        err.status = 400
        throw err
      }

      const candidateId = generateId('EXR')
      const [persisted] = await tx
        .insert(examResults)
        .values({
          id: candidateId,
          examSessionId: sessionId,
          studentId: r.studentId,
          score: authoritativeScore,
          source,
          answers: r.answers ?? null,
          examVersion,
          scanMetadata,
          parishId,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [examResults.parishId, examResults.examSessionId, examResults.studentId],
          set: {
            score: authoritativeScore,
            source,
            answers: r.answers ?? null,
            examVersion,
            scanMetadata,
          },
        })
        .returning({ id: examResults.id })

      if (persisted?.id === candidateId) saved++
      else upserted++
    }

    await audit(tx, {
      userId, parishId, ip, userAgent,
      action: 'EXAM_SAVE_RESULTS',
      entityType: 'exam_session',
      entityId: sessionId,
      newValue: JSON.stringify({ saved, upserted, students: studentIds.length, versions: [...new Set(results.map(result => normalizeExamVersion(result.examVersion)))], serverScoreAdjustments: adjustments }),
    })

    return { session, saved, upserted, total: results.length, adjustments }
  }))
}

export async function deleteExamResult(
  sessionId: string,
  studentId: string,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
  allowedClassIds: string[] | null
) {
  return db.transaction(async (tx) => {
    const session = await assertSessionAccess(sessionId, parishId, allowedClassIds, tx)
    if (session.status === 'completed') {
      throw new ExamStateError('Phiên chấm đã hoàn tất. Mở lại phiên (admin) trước khi sửa kết quả.')
    }

    const [existing] = await tx
      .select({ id: examResults.id, studentId: examResults.studentId, score: examResults.score, source: examResults.source })
      .from(examResults)
      .where(and(eq(examResults.examSessionId, sessionId), eq(examResults.studentId, studentId), eq(examResults.parishId, parishId)))
      .limit(1)

    if (!existing) {
      const err = new Error('Không tìm thấy kết quả của thiếu nhi này trong phiên chấm') as any
      err.status = 404
      throw err
    }

    await tx.delete(examResults).where(and(eq(examResults.id, existing.id), eq(examResults.parishId, parishId)))

    await audit(tx, {
      userId, parishId, ip, userAgent,
      action: 'EXAM_DELETE_RESULT',
      entityType: 'exam_session',
      entityId: sessionId,
      oldValue: JSON.stringify({ studentId: existing.studentId, score: existing.score, source: existing.source }),
      newValue: null,
    })

    return { deleted: true, studentId: existing.studentId }
  })
}

export async function getExamResults(sessionId: string, parishId: string, allowedClassIds: string[] | null) {
  await assertSessionAccess(sessionId, parishId, allowedClassIds)
  const session = await getExamSession(sessionId, parishId)

  const rows = await db
    .select({
      id: examResults.id,
      examSessionId: examResults.examSessionId,
      studentId: examResults.studentId,
      score: examResults.score,
      source: examResults.source,
      examVersion: examResults.examVersion,
      answers: examResults.answers,
      scanMetadata: examResults.scanMetadata,
      createdAt: examResults.createdAt,
      studentCode: students.code,
      studentName: students.fullName,
      holyName: students.holyName,
    })
    .from(examResults)
    .innerJoin(students, and(
      eq(examResults.studentId, students.id),
      eq(examResults.parishId, students.parishId),
    ))
    .where(and(eq(examResults.examSessionId, sessionId), eq(examResults.parishId, parishId)))

  return { session, results: rows }
}

export async function deleteExamSession(
  sessionId: string,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
  allowedClassIds: string[] | null
) {
  return db.transaction(async (tx) => {
    const session = await assertSessionAccess(sessionId, parishId, allowedClassIds, tx)
    if (session.status === 'completed') {
      throw new ExamStateError('Phiên chấm đã hoàn tất và đã ghi vào bảng điểm — không thể xóa. Nhờ admin mở lại phiên nếu cần chỉnh sửa.')
    }

    const resultRows = await tx
      .select({ id: examResults.id })
      .from(examResults)
      .where(and(eq(examResults.examSessionId, sessionId), eq(examResults.parishId, parishId)))
    const resultIds = resultRows.map(r => r.id)

    if (resultIds.length > 0) {
      await tx.delete(examResults).where(and(
        eq(examResults.parishId, parishId),
        inArray(examResults.id, resultIds),
      ))
    }
    await tx.delete(examSessions).where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))

    await audit(tx, {
      userId, parishId, ip, userAgent,
      action: 'EXAM_DELETE_SESSION',
      entityType: 'exam_session',
      entityId: sessionId,
      oldValue: JSON.stringify({
        classId: session.classId,
        subject: session.subject,
        scoreType: session.scoreType,
        semester: session.semester,
        academicYear: session.academicYear,
        status: session.status,
        resultsDeleted: resultIds.length,
      }),
      newValue: null,
    })

    return { deleted: true, sessionId, resultsDeleted: resultIds.length }
  })
}

function serializeFinalizationItem(row: typeof examFinalizationItems.$inferSelect): ExamFinalizationItemResult {
  return {
    studentId: row.studentId,
    examResultId: row.examResultId,
    gradeId: row.gradeId ?? null,
    scoreField: row.scoreField,
    status: row.status as 'committed' | 'conflict',
    existingSource: row.existingSource ?? null,
    rawScore: row.rawScore,
    finalScore: row.finalScore ?? null,
  }
}

export async function finalizeExamSession(
  sessionId: string,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
  allowedClassIds: string[] | null,
): Promise<ExamFinalizationResult> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))
      .limit(1)
    if (!session) throw new ExamNotFoundError()
    if (allowedClassIds && !allowedClassIds.includes(session.classId)) {
      throw new ExamAccessError('Bạn không có quyền thao tác trên phiên chấm của lớp này')
    }

    const [existingFinalization] = await tx
      .select()
      .from(examFinalizations)
      .where(and(eq(examFinalizations.parishId, parishId), eq(examFinalizations.examSessionId, sessionId)))
      .limit(1)

    if (session.status === 'completed') {
      if (existingFinalization) {
        const priorItems = await tx
          .select()
          .from(examFinalizationItems)
          .where(and(eq(examFinalizationItems.parishId, parishId), eq(examFinalizationItems.finalizationId, existingFinalization.id)))
        const items = priorItems.map(serializeFinalizationItem)
        return {
          session,
          finalizationId: existingFinalization.id,
          items,
          committed: items.filter((item) => item.status === 'committed').length,
          conflicts: items.filter((item) => item.status === 'conflict').length,
          legacy: false,
        }
      }
      return { session, finalizationId: null, items: [], committed: 0, conflicts: 0, legacy: true }
    }

    if (existingFinalization) {
      await tx
        .delete(examFinalizationItems)
        .where(and(eq(examFinalizationItems.parishId, parishId), eq(examFinalizationItems.finalizationId, existingFinalization.id)))
      await tx
        .delete(examFinalizations)
        .where(and(eq(examFinalizations.parishId, parishId), eq(examFinalizations.id, existingFinalization.id)))
    }

    const results = await tx
      .select()
      .from(examResults)
      .where(and(eq(examResults.examSessionId, sessionId), eq(examResults.parishId, parishId)))
    if (results.length === 0) {
      throw new ExamStateError('Phiên chấm chưa có kết quả nào — không thể hoàn tất')
    }

    // EXAM-AUDIT F2 (2026-08-21): đồng bộ ledger theo kết quả HIỆN HÀNH của
    // phiên. Sau reopen → xóa kết quả → re-finalize, entry của học sinh bị xóa
    // phải rời khỏi trung bình daily_avg; trước đây entry mồ côi vẫn góp điểm
    // mãi mãi. (Entry legacy_baseline có examSessionId = NULL nên không bị đụng.)
    const resultStudentIds = results.map((r) => r.studentId)
    const orphanEntries = await tx
      .delete(assessmentEntries)
      .where(and(
        eq(assessmentEntries.parishId, parishId),
        eq(assessmentEntries.examSessionId, sessionId),
        notInArray(assessmentEntries.studentId, resultStudentIds),
      ))
      .returning({ id: assessmentEntries.id })

    const isUnlocked = await semesterLockSpecification.isSatisfiedBy(session.academicYear, session.semester, parishId, tx)
    if (!isUnlocked) {
      const err = new Error(`Học kỳ ${session.semester} năm học ${session.academicYear} đã bị khóa sổ điểm. Không thể hoàn tất phiên chấm.`) as any
      err.status = 403
      throw err
    }

    const now = new Date().toISOString()
    const finalizationId = generateId('EXF')
    await tx.insert(examFinalizations).values({
      id: finalizationId,
      parishId,
      examSessionId: sessionId,
      completedBy: userId,
      completedAt: now,
      createdAt: now,
    })

    const scoreMap = SCORE_FIELD_MAP[session.scoreType as ExamScoreType]
    const items: ExamFinalizationItemResult[] = []
    for (const result of results) {
      const [existingGrade] = await tx
        .select()
        .from(grades)
        .where(and(
          eq(grades.parishId, parishId),
          eq(grades.studentId, result.studentId),
          eq(grades.academicYear, session.academicYear),
          eq(grades.semester, session.semester),
        ))
        .limit(1)
      const existingSource = existingGrade ? String((existingGrade as any)[scoreMap.sourceColumn] ?? '') || null : null
      const activeOverride = existingGrade
        ? await tx.select({ id: gradeOverrides.id }).from(gradeOverrides).where(and(
          eq(gradeOverrides.parishId, parishId),
          eq(gradeOverrides.gradeId, existingGrade.id),
          eq(gradeOverrides.scoreField, scoreMap.field),
          isNull(gradeOverrides.deletedAt),
        )).limit(1)
        : []
      const protectedSource = activeOverride.length > 0 ? 'override' : existingSource

      if (protectedSource && PROTECTED_GRADE_SOURCES.has(protectedSource)) {
        const item: ExamFinalizationItemResult = {
          studentId: result.studentId,
          examResultId: result.id,
          gradeId: existingGrade?.id ?? null,
          scoreField: scoreMap.field,
          status: 'conflict',
          existingSource: protectedSource,
          rawScore: result.score,
          finalScore: null,
        }
        await tx.insert(examFinalizationItems).values({ id: generateId('EFI'), parishId, finalizationId, ...item, createdAt: now })
        items.push(item)
        continue
      }

      let finalScore = result.score
      let source = 'exam_scan'
      if (DAILY_SCORE_TYPES.has(session.scoreType as ExamScoreType)) {
        const existingEntries = await tx
          .select()
          .from(assessmentEntries)
          .where(and(
            eq(assessmentEntries.parishId, parishId),
            eq(assessmentEntries.studentId, result.studentId),
            eq(assessmentEntries.academicYear, session.academicYear),
            eq(assessmentEntries.semester, session.semester),
            eq(assessmentEntries.scoreType, session.scoreType),
          ))
        if (existingEntries.length === 0 && existingGrade && existingSource === 'daily_avg' && typeof (existingGrade as any)[scoreMap.field] === 'number') {
          const baseline = Number((existingGrade as any)[scoreMap.field])
          await tx.insert(assessmentEntries).values({
            id: generateId('ASM'), parishId, studentId: result.studentId, examSessionId: null,
            academicYear: session.academicYear, semester: session.semester, scoreType: session.scoreType,
            rawScore: baseline, maxScore: 10, score: baseline, source: 'legacy_baseline', createdBy: 'system', createdAt: now,
          })
        }
        const [existingSessionEntry] = await tx
          .select({ id: assessmentEntries.id })
          .from(assessmentEntries)
          .where(and(
            eq(assessmentEntries.parishId, parishId),
            eq(assessmentEntries.examSessionId, sessionId),
            eq(assessmentEntries.studentId, result.studentId),
          ))
          .limit(1)
        if (existingSessionEntry) {
          await tx.update(assessmentEntries)
            .set({
              rawScore: result.score, maxScore: session.maxScore, score: result.score,
              source: 'exam_finalization', createdBy: userId, createdAt: now,
            })
            .where(and(eq(assessmentEntries.id, existingSessionEntry.id), eq(assessmentEntries.parishId, parishId)))
        } else {
          await tx.insert(assessmentEntries).values({
            id: generateId('ASM'), parishId, studentId: result.studentId, examSessionId: sessionId,
            academicYear: session.academicYear, semester: session.semester, scoreType: session.scoreType,
            rawScore: result.score, maxScore: session.maxScore, score: result.score,
            source: 'exam_finalization', createdBy: userId, createdAt: now,
          })
        }
        const entries = await tx
          .select({ score: assessmentEntries.score })
          .from(assessmentEntries)
          .where(and(
            eq(assessmentEntries.parishId, parishId),
            eq(assessmentEntries.studentId, result.studentId),
            eq(assessmentEntries.academicYear, session.academicYear),
            eq(assessmentEntries.semester, session.semester),
            eq(assessmentEntries.scoreType, session.scoreType),
          ))
        finalScore = Math.round((entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length) * 10) / 10
        source = 'daily_avg'
      }

      const savedGrade = await upsertGrade({
        studentId: result.studentId,
        academicYear: session.academicYear,
        semester: session.semester,
        version: existingGrade?.version,
        [scoreMap.field]: finalScore,
        [scoreMap.sourceKey]: source,
        [scoreMap.updatedAtKey]: now,
      }, userId, parishId, ip, userAgent, tx, allowedClassIds)
      const item: ExamFinalizationItemResult = {
        studentId: result.studentId,
        examResultId: result.id,
        gradeId: savedGrade?.id ?? existingGrade?.id ?? null,
        scoreField: scoreMap.field,
        status: 'committed',
        existingSource: null,
        rawScore: result.score,
        finalScore,
      }
      await tx.insert(examFinalizationItems).values({ id: generateId('EFI'), parishId, finalizationId, ...item, createdAt: now })
      items.push(item)
    }

    await tx.update(examSessions)
      .set({ status: 'completed', completedBy: userId, completedAt: now })
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId), eq(examSessions.status, 'draft')))
    await audit(tx, {
      userId, parishId, ip, userAgent,
      action: 'EXAM_FINALIZE', entityType: 'exam_session', entityId: sessionId,
      oldValue: JSON.stringify({ status: session.status, completedAt: session.completedAt }),
      newValue: JSON.stringify({ status: 'completed', completedBy: userId, completedAt: now, resultCount: results.length, finalizationId, committed: items.filter((item) => item.status === 'committed').length, conflicts: items.filter((item) => item.status === 'conflict').length, orphanLedgerEntriesDeleted: orphanEntries.length }),
    })
    const [updated] = await tx.select().from(examSessions).where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId))).limit(1)
    return {
      session: updated!, finalizationId, items,
      committed: items.filter((item) => item.status === 'committed').length,
      conflicts: items.filter((item) => item.status === 'conflict').length,
      legacy: false,
    }
  })
}

export async function completeExamSession(sessionId: string, userId: string, parishId: string, ip: string, userAgent: string, allowedClassIds: string[] | null) {
  const result = await finalizeExamSession(sessionId, userId, parishId, ip, userAgent, allowedClassIds)
  return result.session
}

export async function reopenExamSession(sessionId: string, userId: string, parishId: string, ip: string, userAgent: string) {
  return db.transaction(async (tx) => {
    const session = await getExamSession(sessionId, parishId, tx)
    if (session.status === 'draft') {
      return session
    }

    const isUnlocked = await semesterLockSpecification.isSatisfiedBy(session.academicYear, session.semester, parishId, tx)
    if (!isUnlocked) {
      const err = new Error(`Học kỳ ${session.semester} năm học ${session.academicYear} đã bị khóa sổ điểm. Không thể mở lại phiên chấm.`) as any
      err.status = 403
      throw err
    }

    await tx
      .update(examSessions)
      .set({ status: 'draft', completedBy: null, completedAt: null })
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))

    await audit(tx, {
      userId, parishId, ip, userAgent,
      action: 'EXAM_REOPEN',
      entityType: 'exam_session',
      entityId: sessionId,
      oldValue: JSON.stringify({ status: session.status, completedAt: session.completedAt }),
      newValue: JSON.stringify({ status: 'draft' }),
    })

    const [updated] = await tx.select().from(examSessions).where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId))).limit(1)
    return updated
  })
}

export async function updateAnswerKeyAndRescore(
  sessionId: string,
  parishId: string,
  newAnswerKey: string,
  newQuestionCount: number,
  userId: string,
  ip: string,
  userAgent: string,
) {
  return db.transaction(async (tx) => {
    const [sessionBefore] = await tx
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))
      .limit(1)
    if (!sessionBefore) throw new ExamNotFoundError()
    // EXAM-AUDIT F5 (2026-08-21): guard trạng thái nằm TRONG transaction (cùng
    // tầng với updateAnswerVariantsAndRescore) — trước đây chỉ có check ở route
    // ngoài tx, complete xen giữa check và rescore sẽ đè điểm exam_results trên
    // phiên completed mà grades/ledger không được cập nhật → desync vĩnh viễn.
    if (sessionBefore.status !== 'draft') {
      throw new ExamStateError('Phiên đã hoàn tất — mở lại phiên trước khi sửa đáp án.')
    }
    const oldAnswerKey = sessionBefore.answerKey
    let variants: Record<string, Record<string, string>> = {}
    if (sessionBefore.answerVariants) {
      try { variants = JSON.parse(sessionBefore.answerVariants) as Record<string, Record<string, string>> } catch { variants = {} }
    }
    variants.A = JSON.parse(newAnswerKey) as Record<string, string>
    const newAnswerVariants = JSON.stringify(variants)
    const maxScore = sessionBefore.maxScore ?? 10

    await tx
      .update(examSessions)
      .set({
        answerKey: newAnswerKey,
        answerVariants: newAnswerVariants,
        questionCount: newQuestionCount,
      })
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))

    // QB-F3 (audit 2026-08-21): đồng bộ correctOption trong ngân hàng câu hỏi
    // theo key MÃ A mới — trước đây questions[].correctOption giữ giá trị cũ sau
    // khi đổi key, mọi renderer phải tự remap và consumer trực tiếp JSON thấy
    // đáp án stale. Questions hỏng/không có → bỏ qua, không chặn rescore.
    if (sessionBefore.questions) {
      try {
        const parsedQuestions = JSON.parse(sessionBefore.questions) as unknown
        if (Array.isArray(parsedQuestions)) {
          const newKeyMap = JSON.parse(newAnswerKey) as Record<string, string>
          const synced = parsedQuestions.map((q) => {
            if (!q || typeof q !== 'object' || Array.isArray(q)) return q
            const item = q as Record<string, unknown>
            const option = newKeyMap[String(Number(item.index))]
            return option ? { ...item, correctOption: option } : item
          })
          await tx
            .update(examSessions)
            .set({ questions: JSON.stringify(synced) })
            .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))
        }
      } catch {
        // questions không parse được → giữ nguyên, rescore vẫn tiếp tục
      }
    }

    const existingResults = await tx
      .select()
      .from(examResults)
      .where(and(eq(examResults.examSessionId, sessionId), eq(examResults.parishId, parishId)))

    if (existingResults.length === 0) {
      await audit(tx, {
        userId, parishId, ip, userAgent,
        action: 'EXAM_RESCORE',
        entityType: 'exam_session',
        entityId: sessionId,
        oldValue: JSON.stringify({ answerKey: oldAnswerKey, questionCount: sessionBefore.questionCount }),
        newValue: JSON.stringify({ answerKey: newAnswerKey, questionCount: newQuestionCount, rescored: 0, skipped: 0 }),
      })
      const [session] = await tx.select().from(examSessions).where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId))).limit(1)
      return { session, rescored: 0, skipped: 0 }
    }

    let rescored = 0
    let skipped = 0
    const scoreChanges: { studentId: string; oldScore: number; newScore: number }[] = []

    for (const result of existingResults) {
      if (result.source === 'quick_entry') {
        skipped++
        continue
      }

      let answers: Record<string, string | null> = {}
      if (result.answers) {
        try { answers = JSON.parse(result.answers) } catch { }
      }

      const hasOmrAnswers = Object.keys(answers).some(k => /^\d+$/.test(k) && answers[k] !== null)
      if (!hasOmrAnswers) {
        skipped++
        continue
      }

      let correctCount = 0
      const version = normalizeExamVersion(result.examVersion)
      const selectedKeyJson = resolveAnswerKeyForVersion(newAnswerKey, newAnswerVariants, version)
      if (!selectedKeyJson) {
        skipped++
        continue
      }
      const answerKeyObj = JSON.parse(selectedKeyJson) as Record<number, string>
      for (let q = 1; q <= newQuestionCount; q++) {
        const userAns = answers[String(q)]
        if (userAns && answerKeyObj[q] && userAns === answerKeyObj[q]) {
          correctCount++
        }
      }

      const rawScore = newQuestionCount > 0
        ? Math.round((correctCount / newQuestionCount) * maxScore * 10) / 10
        : 0
      const newScore = Math.min(rawScore, maxScore)

      const oldScore = result.score
      if (oldScore !== newScore) {
        scoreChanges.push({ studentId: result.studentId, oldScore, newScore })
      }

      await tx
        .update(examResults)
        .set({ score: newScore })
        .where(and(eq(examResults.id, result.id), eq(examResults.parishId, parishId)))

      rescored++
    }

    await audit(tx, {
      userId, parishId, ip, userAgent,
      action: 'EXAM_RESCORE',
      entityType: 'exam_session',
      entityId: sessionId,
      oldValue: JSON.stringify({ answerKey: oldAnswerKey, questionCount: sessionBefore.questionCount }),
      newValue: JSON.stringify({
        answerKey: newAnswerKey,
        questionCount: newQuestionCount,
        maxScore,
        rescored,
        skipped,
        scoreChanges: scoreChanges.length > 0 ? scoreChanges : undefined,
      }),
    })

    const [session] = await tx.select().from(examSessions).where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId))).limit(1)
    return { session, rescored, skipped }
  })
}

export async function updateAnswerVariantsAndRescore(
  sessionId: string,
  parishId: string,
  answerVariantsJson: string,
  questionCount: number,
  userId: string,
  ip: string,
  userAgent: string,
) {
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(examSessions)
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))
      .limit(1)
    if (!session) throw new ExamNotFoundError()
    if (session.status !== 'draft') throw new ExamStateError('Chỉ có thể sửa mã đề khi phiên đang ở trạng thái nháp.')
    if (session.examType !== 'multiple_choice') badRequest('Chỉ phiên trắc nghiệm mới có nhiều mã đề.')

    const variants = JSON.parse(answerVariantsJson) as Record<string, Record<string, string>>
    if (!variants.A) badRequest('Mã đề A là bắt buộc để tương thích với phiếu cũ.')

    const existingResults = await tx.select().from(examResults)
      .where(and(eq(examResults.examSessionId, sessionId), eq(examResults.parishId, parishId)))
    const usedVersions = new Set(existingResults.map(result => normalizeExamVersion(result.examVersion)))
    const missingUsedVersion = [...usedVersions].find(version => !variants[version])
    if (missingUsedVersion) badRequest(`Không thể xóa mã đề ${missingUsedVersion} vì đã có kết quả sử dụng mã này.`)

    await tx.update(examSessions).set({
      answerKey: JSON.stringify(variants.A),
      answerVariants: answerVariantsJson,
      questionCount,
    }).where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))

    let rescored = 0
    let skipped = 0
    const scoreChanges: Array<{ studentId: string; examVersion: string; oldScore: number; newScore: number }> = []
    for (const result of existingResults) {
      if (result.source === 'quick_entry' || !result.answers) {
        skipped++
        continue
      }
      const version = normalizeExamVersion(result.examVersion)
      const answers = parseSubmittedAnswers(result.answers, questionCount)
      const newScore = computeMultipleChoiceScore(answers, JSON.stringify(variants[version]), questionCount, session.maxScore)
      if (Math.abs(newScore - result.score) > 0.0001) {
        scoreChanges.push({ studentId: result.studentId, examVersion: version, oldScore: result.score, newScore })
      }
      await tx.update(examResults).set({ score: newScore })
        .where(and(eq(examResults.id, result.id), eq(examResults.parishId, parishId)))
      rescored++
    }

    await audit(tx, {
      userId, parishId, ip, userAgent,
      action: 'EXAM_VARIANTS_UPDATE', entityType: 'exam_session', entityId: sessionId,
      oldValue: JSON.stringify({ answerVariants: session.answerVariants, answerKey: session.answerKey, questionCount: session.questionCount }),
      newValue: JSON.stringify({ versions: Object.keys(variants), questionCount, rescored, skipped, scoreChanges }),
    })

    const [updated] = await tx.select().from(examSessions)
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))
      .limit(1)
    return { session: updated!, rescored, skipped }
  })
}
