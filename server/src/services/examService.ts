import { db, type DbTransaction } from '../db/index.js'
import { examSessions, examResults, examFinalizations, examFinalizationItems, assessmentEntries, auditLogs, students, classes, grades, gradeOverrides } from '../db/schema.js'
import { eq, and, inArray, isNull, sql } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { semesterLockSpecification } from '../domain/SemesterLockSpecification.js'
import { getCurrentAcademicYear, normalizeAcademicYear } from '../utils/academicYear.js'
import { upsertGrade } from './gradeService.js'

export type ExamScoreType = 'oral' | '15m' | '1period' | 'midterm' | 'final'
export type ExamSessionStatus = 'draft' | 'completed'
export type ExamResultSource = 'qr_scan' | 'omr' | 'quick_entry'

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

export async function createExamSession(data: ExamSessionData, userId: string, parishId: string, ip: string, userAgent: string) {
  // ADR-023 (Phase 3 offline): idempotencyKey = temp id của client — retry sau
  // timeout trả về session đã tạo thay vì tạo trùng (pattern ADR-016 student/class).
  if (data.idempotencyKey) {
    const existing = await db
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.idempotencyKey, data.idempotencyKey), eq(examSessions.parishId, parishId)))
      .limit(1)
    if (existing.length > 0) return existing[0]
  }

  const normYear = data.academicYear ? normalizeAcademicYear(data.academicYear) : getCurrentAcademicYear()
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
    questions: data.questions ?? null,
    idempotencyKey: data.idempotencyKey ?? undefined,
    status: 'draft' as const,
    createdBy: userId,
    completedBy: null,
    completedAt: null,
    createdAt: now,
  }
  await db.insert(examSessions).values(row)
  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'EXAM_CREATE',
    entityType: 'exam_session',
    entityId: id,
    oldValue: null,
    newValue: JSON.stringify(row),
    ip,
    userAgent,
    parishId,
    createdAt: now,
  })
  return row
}

export async function listExamSessions(parishId: string, classIds: string[] | null, filters?: { subject?: string; scoreType?: ExamScoreType; status?: ExamSessionStatus }) {
  const conditions = [eq(examSessions.parishId, parishId)]
  if (classIds && classIds.length > 0) conditions.push(inArray(examSessions.classId, classIds))
  if (filters?.subject) conditions.push(eq(examSessions.subject, filters.subject))
  if (filters?.scoreType) conditions.push(eq(examSessions.scoreType, filters.scoreType))
  if (filters?.status) conditions.push(eq(examSessions.status, filters.status))
  const rows = await db.select().from(examSessions).where(and(...conditions))
  return rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

export async function getExamSession(sessionId: string, parishId: string) {
  const [session] = await db
    .select().from(examSessions)
    .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))
    .limit(1)
  if (!session) throw new ExamNotFoundError()
  return session
}

async function assertSessionAccess(sessionId: string, parishId: string, allowedClassIds: string[] | null) {
  const session = await getExamSession(sessionId, parishId)
  if (allowedClassIds && !allowedClassIds.includes(session.classId)) {
    throw new ExamAccessError('Bạn không có quyền thao tác trên phiên chấm của lớp này')
  }
  return session
}

export async function upsertExamResults(
  sessionId: string,
  results: { studentId: string; score: number; source?: ExamResultSource; answers?: string }[],
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

  return db.transaction(async (tx) => {
    const session = await assertSessionAccess(sessionId, parishId, allowedClassIds)
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
    const now = new Date().toISOString()
    for (const r of results) {
      if (!Number.isFinite(r.score) || r.score < 0 || r.score > session.maxScore) {
        const err = new Error(`Điểm không hợp lệ (0–${session.maxScore})`) as any
        err.status = 400
        throw err
      }
      const [existing] = await tx
        .select({ id: examResults.id })
        .from(examResults)
        .where(and(eq(examResults.examSessionId, sessionId), eq(examResults.studentId, r.studentId), eq(examResults.parishId, parishId)))
        .limit(1)

      if (existing) {
        await tx
          .update(examResults)
          .set({ score: r.score, source: r.source ?? 'qr_scan', answers: r.answers ?? null })
          .where(and(eq(examResults.id, existing.id), eq(examResults.parishId, parishId)))
        upserted++
      } else {
        await tx.insert(examResults).values({
          id: generateId('EXR'),
          examSessionId: sessionId,
          studentId: r.studentId,
          score: r.score,
          source: r.source ?? 'qr_scan',
          answers: r.answers ?? null,
          parishId,
          createdAt: now,
        })
        saved++
      }
    }

    await audit(tx, {
      userId, parishId, ip, userAgent,
      action: 'EXAM_SAVE_RESULTS',
      entityType: 'exam_session',
      entityId: sessionId,
      newValue: JSON.stringify({ saved, upserted, students: studentIds.length }),
    })

    return { session, saved, upserted, total: results.length }
  })
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
    const session = await assertSessionAccess(sessionId, parishId, allowedClassIds)
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
      answers: examResults.answers,
      createdAt: examResults.createdAt,
      studentCode: students.code,
      studentName: students.fullName,
      holyName: students.holyName,
    })
    .from(examResults)
    .innerJoin(students, eq(examResults.studentId, students.id))
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
    const session = await assertSessionAccess(sessionId, parishId, allowedClassIds)
    // Dữ liệu integrity: chỉ xóa phiên draft. Phiên completed đã finalize →
    // điểm đã ghi vào bảng điểm qua gradeService; xóa sẽ tạo orphan/ghi sai audit.
    if (session.status === 'completed') {
      throw new ExamStateError('Phiên chấm đã hoàn tất và đã ghi vào bảng điểm — không thể xóa. Nhờ admin mở lại phiên nếu cần chỉnh sửa.')
    }

    const resultRows = await tx
      .select({ id: examResults.id })
      .from(examResults)
      .where(and(eq(examResults.examSessionId, sessionId), eq(examResults.parishId, parishId)))
    const resultIds = resultRows.map(r => r.id)

    if (resultIds.length > 0) {
      await tx.delete(examResults).where(inArray(examResults.id, resultIds))
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

/**
 * ADR-048: finalization is the sole server-side write boundary between an exam
 * result and the grade projection.  A session never becomes `completed` unless
 * every non-conflicting result has been projected and recorded in the ledger.
 */
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

    // Completed sessions made before ADR-048 have no trustworthy per-result
    // receipt.  Do not manufacture a ledger from an aggregate grade projection.
    if (session.status === 'completed') {
      return { session, finalizationId: null, items: [], committed: 0, conflicts: 0, legacy: true }
    }

    const results = await tx
      .select()
      .from(examResults)
      .where(and(eq(examResults.examSessionId, sessionId), eq(examResults.parishId, parishId)))
    if (results.length === 0) {
      throw new ExamStateError('Phiên chấm chưa có kết quả nào — không thể hoàn tất')
    }

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
        // A pre-ADR-048 daily aggregate has no recoverable attempt count.  Keep
        // it as a visible baseline rather than silently discarding it.
        if (existingEntries.length === 0 && existingGrade && existingSource === 'daily_avg' && typeof (existingGrade as any)[scoreMap.field] === 'number') {
          const baseline = Number((existingGrade as any)[scoreMap.field])
          await tx.insert(assessmentEntries).values({
            id: generateId('ASM'), parishId, studentId: result.studentId, examSessionId: null,
            academicYear: session.academicYear, semester: session.semester, scoreType: session.scoreType,
            rawScore: baseline, maxScore: 10, score: baseline, source: 'legacy_baseline', createdBy: 'system', createdAt: now,
          })
        }
        await tx.insert(assessmentEntries).values({
          id: generateId('ASM'), parishId, studentId: result.studentId, examSessionId: sessionId,
          academicYear: session.academicYear, semester: session.semester, scoreType: session.scoreType,
          rawScore: result.score, maxScore: session.maxScore, score: result.score,
          source: 'exam_finalization', createdBy: userId, createdAt: now,
        })
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
      newValue: JSON.stringify({ status: 'completed', completedBy: userId, completedAt: now, resultCount: results.length, finalizationId, committed: items.filter((item) => item.status === 'committed').length, conflicts: items.filter((item) => item.status === 'conflict').length }),
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

// Backward-compatible endpoint/service used by offline clients.  It now receives
// the same transactional guarantees as the explicit `/finalize` endpoint.
export async function completeExamSession(sessionId: string, userId: string, parishId: string, ip: string, userAgent: string, allowedClassIds: string[] | null) {
  const result = await finalizeExamSession(sessionId, userId, parishId, ip, userAgent, allowedClassIds)
  return result.session
}

export async function reopenExamSession(sessionId: string, userId: string, parishId: string, ip: string, userAgent: string) {
  return db.transaction(async (tx) => {
    const session = await getExamSession(sessionId, parishId)
    if (session.status === 'draft') {
      return session // idempotent
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

// ─── Update answer key + re-score existing MC results ───

/**
 * Cập nhật answer key và chấm lại điểm cho tất cả kết quả đã có trong phiên MC draft.
 * Chỉ re-score các kết quả có source='omr' hoặc 'qr_scan' (OMR-detected).
 * Kết quả 'quick_entry' giữ nguyên vì teacher nhập tay.
 *
 * Công thức: correctCount / totalQuestions × maxScore (đồng nhất với omr.ts:275 frontend).
 * Câu bỏ trống = sai (không đếm vào correctCount, nhưng vẫn đếm vào totalQuestions).
 */
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
    // 1. Read session BEFORE update to capture old answer key for audit
    const [sessionBefore] = await tx
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))
      .limit(1)
    if (!sessionBefore) throw new ExamNotFoundError()
    const oldAnswerKey = sessionBefore.answerKey
    const maxScore = sessionBefore.maxScore ?? 10

    // 2. Update session answer key + question count
    await tx
      .update(examSessions)
      .set({
        answerKey: newAnswerKey,
        questionCount: newQuestionCount,
      })
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.parishId, parishId)))

    // 3. Get all existing results for this session
    const existingResults = await tx
      .select()
      .from(examResults)
      .where(eq(examResults.examSessionId, sessionId))

    if (existingResults.length === 0) {
      // Audit even when no results to re-score (answer key still changed)
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

    // 4. Parse new answer key
    const answerKeyObj = JSON.parse(newAnswerKey) as Record<number, string>

    // 5. Re-score each result that has OMR answers
    let rescored = 0
    let skipped = 0
    const scoreChanges: { studentId: string; oldScore: number; newScore: number }[] = []

    for (const result of existingResults) {
      // Skip quick_entry (teacher-entered scores)
      if (result.source === 'quick_entry') {
        skipped++
        continue
      }

      // Parse existing answers
      let answers: Record<string, string | null> = {}
      if (result.answers) {
        try { answers = JSON.parse(result.answers) } catch { /* skip */ }
      }

      // Check if this result has OMR-detected answers (keys like "1","2",...)
      const hasOmrAnswers = Object.keys(answers).some(k => /^\d+$/.test(k) && answers[k] !== null)
      if (!hasOmrAnswers) {
        skipped++
        continue
      }

      // Re-calculate score from answers + new answer key
      // FIX: chia cho totalQuestions (tổng số câu), KHÔNG chia totalAnswered.
      // Câu bỏ trống = sai → không cộng correctCount, nhưng vẫn nằm trong mẫu số.
      // Đồng nhất với omr.ts:275: rawCorrectCount / totalQuestions * maxScore
      let correctCount = 0
      for (let q = 1; q <= newQuestionCount; q++) {
        const userAns = answers[String(q)]
        if (userAns && answerKeyObj[q] && userAns === answerKeyObj[q]) {
          correctCount++
        }
      }

      // FIX: dùng session.maxScore thay vì hardcode 10
      const rawScore = newQuestionCount > 0
        ? Math.round((correctCount / newQuestionCount) * maxScore * 10) / 10
        : 0

      // C3: Validate score <= maxScore (defensive clamp)
      const newScore = Math.min(rawScore, maxScore)

      const oldScore = result.score
      if (oldScore !== newScore) {
        scoreChanges.push({ studentId: result.studentId, oldScore, newScore })
      }

      // Update score
      await tx
        .update(examResults)
        .set({ score: newScore })
        .where(eq(examResults.id, result.id))

      rescored++
    }

    // C2: Audit log for re-score — ghi đầy đủ old/new answer key + danh sách thay đổi điểm
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

