import { and, eq, isNull } from 'drizzle-orm'
import { runDbTransaction, db, type DbTransaction } from '../db/index.js'
import { assessmentEntries, auditLogs, classes, students, grades } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { createSemesterLockSpecification } from './policyAdapters.js'
import { getStudentClassId } from './studentService.js'
import { checkAcademicWriteAccess, type AcademicWriteExpectation } from './classAccessQueryService.js'
import { upsertGrade } from './gradeService.js'
import { normalizeAcademicYear } from '../utils/academicYear.js'

const DAILY_FIELDS = { oral: 'scoreOral', '15m': 'score15m', '1period': 'score1Period' } as const

async function projectDailyGrade(tx: DbTransaction, entry: { studentId: string; academicYear: string; semester: number; scoreType: string }, userId: string, parishId: string, ip: string, userAgent: string, allowedClassIds: string[] | null, expected?: AcademicWriteExpectation) {
  const field = DAILY_FIELDS[entry.scoreType as DailyEntryScoreType]
  const [grade] = await tx.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, entry.studentId), eq(grades.academicYear, entry.academicYear), eq(grades.semester, entry.semester))).limit(1)
  // upsertGrade computes the value from the ledger and preserves overrides.
  await upsertGrade({ studentId: entry.studentId, academicYear: entry.academicYear, semester: entry.semester, version: grade?.version, [field]: null, [`${field}_source`]: 'daily_avg' }, userId, parishId, ip, userAgent, tx, allowedClassIds, expected)
}

/**
 * Tier 2 (daily là điểm chính thức — BUSINESS_RULES §12.1): attempts nhập tay
 * là first-class ledger rows (`source='manual_entry'`, `exam_session_id=NULL`),
 * cùng sổ với `exam_finalization`. Add/delete và Exam finalize project trung
 * bình toàn sổ trong transaction, không cần client ghi grade lần hai.
 *
 * Idempotency: `id` = mã entry ổn định của client (`DG-...`) → retry trùng
 * trả `duplicate` qua PK `(parish_id,id)`; cùng id khác payload → 409.
 */

export type DailyEntryScoreType = 'oral' | '15m' | '1period'

export interface DailyEntryInput {
  id: string
  studentId: string
  academicYear: string
  semester: number
  scoreType: DailyEntryScoreType
  value: number
  date?: string | null
}

export interface DailyEntryAck {
  id: string
  studentId: string
  scoreType: DailyEntryScoreType
  status: 'created' | 'duplicate' | 'error'
  serverScore: number | null
  reason?: string
}

export class DailyEntryNotFoundError extends Error {
  statusCode = 404
}

export class DailyEntryStateError extends Error {
  statusCode = 409
}

export class DailyEntryAccessError extends Error {
  statusCode = 403
}

function badRequest(message: string): never {
  const err = new Error(message) as Error & { status: number }
  err.status = 400
  throw err
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

async function audit(
  tx: DbTransaction,
  params: { userId: string; parishId: string; ip: string; userAgent: string; action: string; entityId: string; newValue: unknown },
): Promise<void> {
  await tx.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: params.userId,
    action: params.action,
    entityType: 'daily_entry',
    entityId: params.entityId,
    oldValue: null,
    newValue: JSON.stringify(params.newValue),
    ip: params.ip,
    userAgent: params.userAgent,
    parishId: params.parishId,
    createdAt: new Date().toISOString(),
  })
}

/** Class-access + lock checks dùng chung cho write và delete (chạy trong tx). */
async function assertWritable(
  tx: DbTransaction,
  params: { studentId: string; academicYear: string; semester: number; parishId: string; allowedClassIds: string[] | null; userId: string; expected?: AcademicWriteExpectation },
): Promise<void> {
  const [student] = await tx
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, params.studentId), eq(students.parishId, params.parishId), isNull(students.deletedAt)))
    .limit(1)
  if (!student) {
    const err = new DailyEntryNotFoundError('Không tìm thấy thiếu nhi trong giáo xứ hiện tại')
    throw err
  }
  const classId = await getStudentClassId(params.studentId, params.parishId, tx)
  if (!classId || (params.allowedClassIds && !params.allowedClassIds.includes(classId))
    || !(await checkAcademicWriteAccess(params.userId, params.parishId, classId, tx, params.expected))) {
    throw new DailyEntryAccessError('Bạn không có quyền thao tác điểm của lớp này')
  }
  const unlocked = await createSemesterLockSpecification(tx).isSatisfiedBy(params.academicYear, params.semester, params.parishId)
  if (!unlocked) {
    const err = new Error(`Học kỳ ${params.semester} năm học ${params.academicYear} đã bị khóa sổ điểm. Không thể ghi điểm hằng ngày.`) as Error & { status: number }
    err.status = 403
    throw err
  }
}

function samePayload(existing: typeof assessmentEntries.$inferSelect, input: DailyEntryInput): boolean {
  return (
    existing.studentId === input.studentId &&
    existing.scoreType === input.scoreType &&
    existing.semester === input.semester &&
    existing.academicYear === input.academicYear &&
    Number(existing.score) === Number(input.value) &&
    (existing.entryDate ?? null) === (input.date ?? null)
  )
}

export interface DailyEntryBatchResult {
  saved: number
  duplicates: number
  errorCount: number
  total: number
  items: DailyEntryAck[]
}

/**
 * Batch upsert attempts nhập tay — partial-success itemized (ADR-008 khối học vụ):
 * mỗi entry 1 transaction riêng; lỗi 1 item không rollback item khác.
 */
export async function upsertDailyEntries(
  entries: DailyEntryInput[],
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
  allowedClassIds: string[] | null,
  expected?: AcademicWriteExpectation,
): Promise<DailyEntryBatchResult> {
  const items: DailyEntryAck[] = []
  let saved = 0
  let duplicates = 0
  let errorCount = 0

  for (const input of entries) {
    const entry = { ...input, academicYear: normalizeAcademicYear(input.academicYear) }
    if (!isValidIsoDate(entry.date ?? '')) {
      // date là additive cho hiển thị — thiếu/sai thì lưu NULL thay vì fail cả item.
      entry.date = null
    }
    try {
      const ack = await runDbTransaction(async (tx) => {
        await assertWritable(tx, {
          studentId: entry.studentId,
          academicYear: entry.academicYear,
          semester: entry.semester,
          parishId,
          allowedClassIds,
          userId, expected,
        })

        const [existing] = await tx
          .select()
          .from(assessmentEntries)
          .where(and(eq(assessmentEntries.parishId, parishId), eq(assessmentEntries.id, entry.id)))
          .limit(1)
        if (existing) {
          if (existing.source !== 'manual_entry' || !samePayload(existing, entry)) {
            throw new DailyEntryStateError('Mã entry đã được dùng cho một dữ liệu khác (IDEMPOTENCY_CONFLICT).')
          }
          // Retry trùng payload: không rewrite, không audit lại (mẫu exam_result_mutations).
          return { id: entry.id, studentId: entry.studentId, scoreType: entry.scoreType, status: 'duplicate', serverScore: Number(existing.score) } as DailyEntryAck
        }

        const now = new Date().toISOString()
        // Preserve a pre-ledger daily average once, matching Exam's legacy
        // bridge. Never overwrite legacy history with the first new attempt.
        const [ledger] = await tx.select({ id: assessmentEntries.id }).from(assessmentEntries).where(and(
          eq(assessmentEntries.parishId, parishId), eq(assessmentEntries.studentId, entry.studentId),
          eq(assessmentEntries.academicYear, entry.academicYear), eq(assessmentEntries.semester, entry.semester), eq(assessmentEntries.scoreType, entry.scoreType),
        )).limit(1)
        if (!ledger) {
          const [grade] = await tx.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, entry.studentId), eq(grades.academicYear, entry.academicYear), eq(grades.semester, entry.semester))).limit(1)
          const field = DAILY_FIELDS[entry.scoreType]
          const sourceColumn = `${field}Source` as 'scoreOralSource' | 'score15mSource' | 'score1PeriodSource'
          if (grade?.[sourceColumn] === 'daily_avg' && typeof grade[field] === 'number') {
            await tx.insert(assessmentEntries).values({ id: generateId('ASM'), parishId, studentId: entry.studentId, academicYear: entry.academicYear, semester: entry.semester, scoreType: entry.scoreType, rawScore: grade[field]!, maxScore: 10, score: grade[field]!, source: 'legacy_baseline', createdBy: 'system', createdAt: now })
          }
        }
        await tx.insert(assessmentEntries).values({
          id: entry.id,
          parishId,
          studentId: entry.studentId,
          examSessionId: null,
          academicYear: entry.academicYear,
          semester: entry.semester,
          scoreType: entry.scoreType,
          rawScore: entry.value,
          maxScore: 10,
          score: entry.value,
          source: 'manual_entry',
          entryDate: entry.date ?? null,
          createdBy: userId,
          createdAt: now,
        })
        await projectDailyGrade(tx, entry, userId, parishId, ip, userAgent, allowedClassIds, expected)
        await audit(tx, {
          userId, parishId, ip, userAgent,
          action: 'DAILY_ENTRY_SAVE',
          entityId: entry.id,
          newValue: { studentId: entry.studentId, scoreType: entry.scoreType, value: entry.value },
        })
        return { id: entry.id, studentId: entry.studentId, scoreType: entry.scoreType, status: 'created', serverScore: entry.value } as DailyEntryAck
      })
      if (ack.status === 'duplicate') duplicates++
      else saved++
      items.push(ack)
    } catch (err) {
      errorCount++
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      items.push({ id: entry.id, studentId: entry.studentId, scoreType: entry.scoreType, status: 'error', serverScore: null, reason: message })
    }
  }

  return { saved, duplicates, errorCount, total: entries.length, items }
}

export async function deleteDailyEntry(
  id: string,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
  allowedClassIds: string[] | null,
  expected?: AcademicWriteExpectation,
): Promise<{ deleted: boolean; id: string }> {
  return runDbTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(assessmentEntries)
      .where(and(eq(assessmentEntries.parishId, parishId), eq(assessmentEntries.id, id)))
      .limit(1)
    if (!existing) throw new DailyEntryNotFoundError('Không tìm thấy lần nhập điểm')
    if (existing.source !== 'manual_entry') {
      // Dòng máy/bảo thủ (exam_finalization/legacy_baseline) bất biến qua endpoint này.
      throw new DailyEntryStateError('Chỉ được xóa lần nhập tay (dòng máy chấm và baseline không xóa qua đây).')
    }
    await assertWritable(tx, {
      studentId: existing.studentId,
      academicYear: existing.academicYear,
      semester: existing.semester,
      parishId,
      allowedClassIds,
      userId, expected,
    })
    await tx
      .delete(assessmentEntries)
      .where(and(eq(assessmentEntries.parishId, parishId), eq(assessmentEntries.id, id)))
    await projectDailyGrade(tx, existing, userId, parishId, ip, userAgent, allowedClassIds, expected)
    await audit(tx, {
      userId, parishId, ip, userAgent,
      action: 'DAILY_ENTRY_DELETE',
      entityId: id,
      newValue: { studentId: existing.studentId, scoreType: existing.scoreType },
    })
    return { deleted: true, id }
  })
}

export interface DailyEntryListItem {
  id: string
  studentId: string
  academicYear: string
  semester: number
  scoreType: string
  value: number
  date: string | null
  /** 'manual' = nhập tay (được xóa), 'machine' = máy chấm/baseline (read-only). */
  origin: 'manual' | 'machine'
  examSessionId: string | null
  createdAt: string
}

/**
 * List attempts cho UI daily (read-only machine block + reconcile tay).
 * Fail-closed scope: bắt buộc classId (lớp trong parish + class-access) hoặc
 * studentId (verify class của HS). Không scope → 400.
 */
export async function listDailyEntries(
  params: { classId?: string; studentId?: string; semester?: number; academicYear?: string; scoreType?: string },
  parishId: string,
  allowedClassIds: string[] | null,
): Promise<DailyEntryListItem[]> {
  if (!params.classId && !params.studentId) badRequest('Cần classId hoặc studentId để liệt kê điểm hằng ngày')

  if (params.classId) {
    // Verify lớp thuộc parish (404 cross-parish, không lộ tồn tại) + class-access.
    const [cls] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.id, params.classId), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
      .limit(1)
    if (!cls) throw new DailyEntryNotFoundError('Không tìm thấy lớp học trong giáo xứ hiện tại')
    if (allowedClassIds && !allowedClassIds.includes(params.classId)) {
      throw new DailyEntryAccessError('Bạn không có quyền xem điểm của lớp này')
    }
  }

  const conditions = [eq(assessmentEntries.parishId, parishId)]
  if (params.semester !== undefined) conditions.push(eq(assessmentEntries.semester, params.semester))
  if (params.academicYear) conditions.push(eq(assessmentEntries.academicYear, normalizeAcademicYear(params.academicYear)))
  if (params.scoreType) conditions.push(eq(assessmentEntries.scoreType, params.scoreType as 'oral' | '15m' | '1period'))
  if (params.studentId) {
    const classId = await getStudentClassId(params.studentId, parishId, db)
    if (!classId || (allowedClassIds && !allowedClassIds.includes(classId))) {
      throw new DailyEntryAccessError('Bạn không có quyền xem điểm của thiếu nhi này')
    }
    conditions.push(eq(assessmentEntries.studentId, params.studentId))
  }

  let rows = await db
    .select()
    .from(assessmentEntries)
    .where(and(...conditions))

  if (params.classId) {
    // Lọc theo lớp: join roster cùng parish (student.classId).
    const roster = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.parishId, parishId), eq(students.classId, params.classId), isNull(students.deletedAt)))
    const memberIds = new Set(roster.map((r) => r.id))
    rows = rows.filter((r) => memberIds.has(r.studentId))
  }

  return rows
    .filter((r) => r.source === 'manual_entry' || r.source === 'exam_finalization')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map((r) => ({
      id: r.id,
      studentId: r.studentId,
      academicYear: r.academicYear,
      semester: r.semester,
      scoreType: r.scoreType,
      value: Number(r.score),
      date: r.entryDate,
      origin: (r.source === 'manual_entry' ? 'manual' : 'machine') as 'manual' | 'machine',
      examSessionId: r.examSessionId,
      createdAt: r.createdAt,
    }))
}
