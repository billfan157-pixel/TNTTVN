import { db, type DbTransaction } from '../db/index.js'
import { grades, auditLogs, gradeOverrides, students, academicYears } from '../db/schema.js'
import { runDbTransaction } from '../db/index.js'
import { eq, and, gte, inArray, isNull, desc } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { semesterLockSpecification } from '../domain/SemesterLockSpecification.js'
import { type ScoreField } from '../domain/GradeAggregate.js'
import { SCORE_FIELDS, buildSourceMapping } from '../domain/ScoreFields.js'
import { drizzleGradeRepository } from '../repositories/DrizzleGradeRepository.js'
import { normalizeAcademicYear, getCurrentAcademicYear } from '../utils/academicYear.js'
import { getCurrentPolicyVersionId } from './parishSettingsService.js'

export class VersionConflictError extends Error {
  public statusCode = 409
  public currentGrade: any
  constructor(message: string, currentGrade: any) {
    super(message)
    this.name = 'VersionConflictError'
    this.currentGrade = currentGrade
  }
}

function formatGradeRow(row: any) {
  if (!row) return row
  return {
    ...row,
    scoreOral_source: row.scoreOral_source ?? row.scoreOralSource ?? null,
    scoreOral_updated_at: row.scoreOral_updated_at ?? row.scoreOralUpdatedAt ?? null,
    score15m_source: row.score15m_source ?? row.score15mSource ?? null,
    score15m_updated_at: row.score15m_updated_at ?? row.score15mUpdatedAt ?? null,
    score1Period_source: row.score1Period_source ?? row.score1PeriodSource ?? null,
    score1Period_updated_at: row.score1Period_updated_at ?? row.score1PeriodUpdatedAt ?? null,
    scoreMidterm_source: row.scoreMidterm_source ?? row.scoreMidtermSource ?? null,
    scoreMidterm_updated_at: row.scoreMidterm_updated_at ?? row.scoreMidtermUpdatedAt ?? null,
    scoreFinal_source: row.scoreFinal_source ?? row.scoreFinalSource ?? null,
    scoreFinal_updated_at: row.scoreFinal_updated_at ?? row.scoreFinalUpdatedAt ?? null,
    scoreDaoDuc_source: row.scoreDaoDuc_source ?? row.scoreDaoDucSource ?? null,
    scoreDaoDuc_updated_at: row.scoreDaoDuc_updated_at ?? row.scoreDaoDucUpdatedAt ?? null,
  }
}

export async function getGrades(parishId: string, studentId?: string, semester?: number, updatedAfter?: string, studentIds?: string[]) {
  const activeStudentSubquery = db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.parishId, parishId), isNull(students.deletedAt)))

  const conditions = [
    eq(grades.parishId, parishId),
    inArray(grades.studentId, activeStudentSubquery)
  ]
  if (studentId) conditions.push(eq(grades.studentId, studentId))
  if (semester) conditions.push(eq(grades.semester, semester))
  if (updatedAfter) conditions.push(gte(grades.updatedAt, updatedAfter))
  if (studentIds && studentIds.length > 0) conditions.push(inArray(grades.studentId, studentIds))
  const rows = await db.select().from(grades).where(and(...conditions))
  return rows.map(formatGradeRow)
}

export interface GradeData {
  id?: string
  studentId: string
  academicYear?: string
  semester?: number
  scoreOral?: number | null
  score15m?: number | null
  score1Period?: number | null
  scoreMidterm?: number | null
  scoreFinal?: number | null
  scoreDaoDuc?: number | null
  scoreOral_source?: string | null
  score15m_source?: string | null
  score1Period_source?: string | null
  scoreMidterm_source?: string | null
  scoreFinal_source?: string | null
  scoreDaoDuc_source?: string | null
  scoreOral_updated_at?: string | null
  score15m_updated_at?: string | null
  score1Period_updated_at?: string | null
  scoreMidterm_updated_at?: string | null
  scoreFinal_updated_at?: string | null
  scoreDaoDuc_updated_at?: string | null
  comments?: string | null
  version?: number
  clearFields?: string[]
  /** F5 (audit): Lý do ghi đè thủ công (mặc định 'TeacherAdjustment') — lưu vào grade_overrides. */
  overrideReasonNote?: string | null
}

// SCORE_FIELDS chuyển sang domain/ScoreFields.ts (GRADE-ARCH-02 SSOT) —
// gradeService import từ đó thay vì khai báo bản thứ 2.

/**
 * F5 (audit): Ghi audit trail cho mọi chỉnh sửa điểm THỦ CÔNG (source = 'manual').
 * Trước đây matrix save thả mất `_source` trước khi sync → server chỉ thấy UPDATE
 * generic, không biết field nào do người sửa tay nên không lưu grade_overrides.
 * GRADE-ARCH-01 (2026-08-09): VIỆC GHI ĐÃ HỢP NHẤT — qua
 * GradeAggregate + DrizzleGradeRepository.persistManualOverrideEvents (writer chung
 * với application-service path: supersede version semantics, range 0-10, audit
 * OVERRIDE_GRADE + outbox GradeOverrideCreated / parish-scoped), thay cho việc
 * insert trực tiếp ánh xạ xưa.
 */
function collectManualOverrideEntries(data: GradeData): { scoreField: ScoreField; manualValue: number; reasonNote?: string | null }[] {
  const entries: { scoreField: ScoreField; manualValue: number; reasonNote?: string | null }[] = []
  for (const field of SCORE_FIELDS) {
    if ((data as any)[`${field}_source`] !== 'manual') continue
    const value = (data as any)[field]
    if (value === undefined) continue // field không chạm trong payload này
    entries.push({ scoreField: field, manualValue: value as number, reasonNote: data.overrideReasonNote ?? null })
  }
  return entries
}

export async function upsertGrade(data: GradeData, userId: string, parishId: string, ip: string, userAgent: string, externalTx?: DbTransaction, allowedClassIds?: string[] | null) {
  const executeFn = async (tx: DbTransaction) => {
    // Get current policy version for audit trail
    const policyVersionId = await getCurrentPolicyVersionId(parishId)

    // ADR-016 (S24): Payload thiếu academicYear → lấy năm học hiện tại theo quy tắc
    // tháng ≥ 8 (khớp client). Trước đây normalizeAcademicYear(undefined) rơi về
    // hằng số '2025-2026' → payload thiếu year tạo điểm vào năm học cũ.
    const normYear = data.academicYear ? normalizeAcademicYear(data.academicYear) : getCurrentAcademicYear()
    if (!normYear) {
      throw new Error('Năm học không hợp lệ')
    }

    const [student] = await tx
      .select({ id: students.id, classId: students.classId })
      .from(students)
      .where(and(eq(students.id, data.studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
      .limit(1)

    if (!student) {
      const err = new Error('Không tìm thấy thiếu nhi hoặc thiếu nhi đã bị xóa') as any
      err.status = 404
      throw err
    }

    // ADR-016 (S24): Access check NẰM TRONG transaction (cùng lúc đọc student +
    // kiểm tra class + ghi điểm) → đóng TOCTOU "check rồi mới ghi batch": trước
    // đây route check từng item trước khi chạy batch, học sinh chuyển lớp giữa
    // check và write vẫn bị ghi nhầm.
    if (allowedClassIds && !allowedClassIds.includes(student.classId)) {
      const err = new Error('Bạn không có quyền nhập điểm cho thiếu nhi này') as any
      err.status = 403
      throw err
    }

    if (data.semester !== 1 && data.semester !== 2) {
      const err = new Error(`Học kỳ không hợp lệ: ${data.semester}`) as any
      err.status = 400
      throw err
    }

    const [academicYearRecord] = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(and(eq(academicYears.id, normYear), eq(academicYears.parishId, parishId)))
      .limit(1)

    if (!academicYearRecord) {
      const err = new Error(`Năm học ${normYear} không tồn tại`) as any
      err.status = 400
      throw err
    }

    if (data.semester) {
      const isSemesterUnlocked = await semesterLockSpecification.isSatisfiedBy(normYear, data.semester, parishId, tx)
      if (!isSemesterUnlocked) {
        const err = new Error(`Học kỳ ${data.semester} năm học ${normYear} đã bị khóa sổ điểm. Không thể chỉnh sửa điểm.`) as any
        err.status = 403
        throw err
      }
    }

    // GRADE-ARCH-01 (2026-08-09): pre-validate range 0-10 trước khi chạm DB — trước
    // đây giá trị > 10 rơi vào CHECK/trigger SQLite → lỗi "Failed query" khó đọc.
    for (const field of SCORE_FIELDS) {
      const val = (data as any)[field]
      if (typeof val === 'number' && (val < 0 || val > 10)) {
        throw new Error(`Invalid score ${val} for ${field}. Must be between 0 and 10.`)
      }
    }

    const [existing] = await tx
      .select()
      .from(grades)
      .where(
        and(
          eq(grades.studentId, data.studentId),
          eq(grades.semester, data.semester!),
          eq(grades.parishId, parishId),
          eq(grades.academicYear, normYear),
        ),
      )
      .limit(1)

    if (existing) {
      // ADR-016 (S24): OCC luôn bắt buộc — bỏ cờ env STRICT_OCC_ENFORCEMENT.
      // Cờ env không được phép làm yếu consistency mặc định (audit finding #11).
      if (typeof data.version !== 'number' && (existing.version || 1) > 1) {
        throw new VersionConflictError('Thiếu thông tin phiên bản (version) để cập nhật điểm.', existing)
      }

      const expectedVersion = typeof data.version === 'number' ? data.version : (existing.version || 1)
      if (typeof data.version === 'number' && existing.version !== data.version) {
        throw new VersionConflictError('Điểm đã bị thay đổi bởi người khác. Vui lòng làm mới trang.', existing)
      }

      const updatePayload: Record<string, any> = {
        updatedAt: new Date().toISOString(),
        version: (existing.version || 1) + 1,
      }

      if (data.comments !== undefined) {
        updatePayload.comments = data.comments
      }

      const sourceMapping = buildSourceMapping()

      // audit (P5): Bảo vệ manual override khỏi nguồn
      // tự động. Trước đây sync bulk/auto ghi thẳng qua (source không phải manual)
      // làm ghi đè im lặng điểm giáo lý viên chỉnh tay. Field đang có override sống
      // hoặc nguồn hiện tại = manual/override ⇒ chỉ incoming source = 'manual'
      // (teacher chủ động sửa) mới được ghi; mọi nguồn khác (auto/bulk/import) bị chặn.
      const liveOverrideFields = new Set<string>(
        (
          await tx
            .select({ f: gradeOverrides.scoreField })
            .from(gradeOverrides)
            .where(and(
              eq(gradeOverrides.gradeId, existing.id),
              eq(gradeOverrides.parishId, parishId),
              isNull(gradeOverrides.deletedAt),
            ))
        ).map((r: { f: string }) => r.f)
      )
      const isProtectedField = (field: string): boolean => {
        if (liveOverrideFields.has(field)) return true
        const src = (existing as any)[`${field}Source`] ?? null
        return src === 'manual' || src === 'override'
      }
      const isIncomingManual = (field: string): boolean => (data as any)[`${field}_source`] === 'manual'

      for (const [key, col] of Object.entries(sourceMapping)) {
        if ((data as any)[key] === undefined) continue
        const field = key.replace(/_(source|updated_at)$/, '')
        // P5: source/updated_at của field bảo vệ cũng KHÔNG được đè — nếu không
        // sẽ để lại source 'auto' sai lệch với giá trị manual còn giữ nguyên.
        if (isProtectedField(field) && !isIncomingManual(field)) continue
        updatePayload[col] = (data as any)[key]
      }

      for (const field of SCORE_FIELDS) {
        const val = (data as any)[field]
        if (val !== undefined) {
          // P5: giá trị tự động không được ghi đè field đang bảo vệ (override
          // sống / source manual). Chặn ở đây nên writer manual chỉ
          // nhận đúng trường hợp teacher sửa lại tay.
          if (isProtectedField(field) && !isIncomingManual(field)) continue
          // ADR-016 (S16): Áp dụng CẢ null (xóa điểm). Trước đây chỉ nhận số nên
          // client gửi scoreX: null (thao tác xóa điểm) bị bỏ qua im lặng — server
          // giữ giá trị cũ, fetch sau đó khiến điểm "hồi sinh". Field không có mặt
          // trong payload vẫn KHÔNG bị đụng (contract cũ giữ nguyên).
          updatePayload[field] = val
        }
      }

      if (Array.isArray(data.clearFields)) {
        for (const field of data.clearFields) {
          if (SCORE_FIELDS.includes(field as any)) {
            // P5: field đang bảo vệ phải RESTORE qua endpoint override riêng
            // (gradeApplicationService.restoreScore) — clear tay sẽ âm thầm xóa override sống.
            if (isProtectedField(field)) continue
            updatePayload[field] = null
          }
        }
      }

      const updateRes = await tx
        .update(grades)
        .set(updatePayload)
        .where(and(eq(grades.id, existing.id), eq(grades.version, expectedVersion)))

      const affectedRows = Number((updateRes as { changes?: number; rowsAffected?: number }).changes ?? (updateRes as { changes?: number; rowsAffected?: number }).rowsAffected ?? 1)
      if (affectedRows === 0) {
        const [fresh] = await tx.select().from(grades).where(and(eq(grades.id, existing.id), eq(grades.parishId, parishId))).limit(1)
        throw new VersionConflictError('Điểm đã bị thay đổi bởi người khác. Vui lòng làm mới trang.', fresh)
      }

      await tx.insert(auditLogs).values({
        id: generateId('AUD'),
        userId,
        action: 'UPDATE',
        entityType: 'grade',
        entityId: existing.id,
        oldValue: JSON.stringify(existing),
        newValue: JSON.stringify(data),
        ip,
        userAgent,
        parishId,
      })
      // F5 (audit): Lưu field chỉnh tay (source='manual') qua writer chung
      // (GRADE-ARCH-01 2026-08-09 — GradeAggregate → repository, single path).
      // ADR-047: Now also captures policyVersionId for audit trail.
      const manualEntries = collectManualOverrideEntries(data)
      if (manualEntries.length > 0) {
        await drizzleGradeRepository.persistManualOverrideEvents(tx, existing.id, parishId, manualEntries, userId, ip, userAgent, policyVersionId)
      }
      const [updated] = await tx.select().from(grades).where(and(eq(grades.id, existing.id), eq(grades.parishId, parishId))).limit(1)
      return updated
    }

    const id = generateId('GR')
    const insertPayload: Record<string, any> = {
      id,
      studentId: data.studentId,
      semester: data.semester!,
      academicYear: normYear,
      comments: data.comments ?? null,
      version: 1,
      parishId,
    }

    const sourceMapping = buildSourceMapping()

    for (const [key, col] of Object.entries(sourceMapping)) {
      if ((data as any)[key] !== undefined) {
        insertPayload[col] = (data as any)[key]
      }
    }

    for (const field of SCORE_FIELDS) {
      const val = (data as any)[field]
      if (typeof val === 'number' && !isNaN(val)) {
        insertPayload[field] = val
      }
    }

    await tx.insert(grades).values(insertPayload as any)

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action: 'CREATE',
      entityType: 'grade',
      entityId: id,
      oldValue: null,
      newValue: JSON.stringify(insertPayload),
      ip,
      userAgent,
      parishId,
    })
    // F5 (audit): Lưu field chỉnh tay (source='manual') qua writer chung
    // (GRADE-ARCH-01 2026-08-09).
    // ADR-047: Now also captures policyVersionId for audit trail.
    const manualEntries = collectManualOverrideEntries(data)
    if (manualEntries.length > 0) {
      await drizzleGradeRepository.persistManualOverrideEvents(tx, id, parishId, manualEntries, userId, ip, userAgent, policyVersionId)
    }

    const [created] = await tx.select().from(grades).where(and(eq(grades.id, id), eq(grades.parishId, parishId))).limit(1)
    return created
  }

  if (externalTx) {
    return executeFn(externalTx)
  }
  return runDbTransaction(executeFn)
}

// ADR-028 (2026-08-12): Undo import điểm dựa trên audit_logs làm nguồn restore.
// Mỗi lần ghi điểm (CREATE/UPDATE) đều kèm audit oldValue = ảnh toàn bộ row trước
// khi ghi. Undo import = đảo ngược lần ghi gần nhất của từng bảng điểm trong đợt:
//   - entry mới nhất là CREATE → xóa row (grade + gradeOverrides)
//   - entry mới nhất là UPDATE → khôi phục các cột về oldValue, version +1
// Chỉ áp dụng trong UNDO_GRADE_WINDOW_DAYS và KHÔNG cho phép nếu entry mới nhất
// không phải CREATE/UPDATE (đã có thao tác khác sau import — bao gồm cả undo
// trước đó) → tránh undo lặp và mất dữ liệu sửa tay sau import.
export const UNDO_GRADE_WINDOW_DAYS = 7

export interface UndoGradeImportResult {
  studentId: string
  status: 'restored' | 'deleted' | 'not-found' | 'no-audit' | 'not-clean' | 'expired' | 'forbidden' | 'locked'
  message?: string
}

export async function undoGradeImport(
  items: { studentId: string }[],
  semester: number,
  academicYear: string,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
  allowedClassIds?: string[] | null,
): Promise<UndoGradeImportResult[]> {
  const normYear = normalizeAcademicYear(academicYear)
  if (!normYear) throw new Error('Năm học không hợp lệ')

  // ADR-047: Capture policy version at undo time for audit trail
  const policyVersionIdAtUndo = await getCurrentPolicyVersionId(parishId)

  const results: UndoGradeImportResult[] = []
  for (const item of items) {
    const result = await (async (): Promise<UndoGradeImportResult> => {
      try {
        return await db.transaction(async (tx) => {
          const [student] = await tx
            .select({ id: students.id, classId: students.classId })
            .from(students)
            .where(and(eq(students.id, item.studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
            .limit(1)

          if (!student) {
            return { studentId: item.studentId, status: 'not-found', message: 'Không tìm thấy thiếu nhi' }
          }

          // ADR-016 (S24): access check trong cùng tx với write (đóng TOCTOU).
          if (allowedClassIds && !allowedClassIds.includes(student.classId)) {
            return { studentId: item.studentId, status: 'forbidden', message: 'Bạn không có quyền khôi phục điểm cho thiếu nhi này' }
          }

          const isSemesterUnlocked = await semesterLockSpecification.isSatisfiedBy(normYear, semester, parishId, tx)
          if (!isSemesterUnlocked) {
            return { studentId: item.studentId, status: 'locked', message: `Học kỳ ${semester} năm học ${normYear} đã bị khóa sổ điểm` }
          }

          const [grade] = await tx
            .select()
            .from(grades)
            .where(and(
              eq(grades.studentId, item.studentId),
              eq(grades.semester, semester),
              eq(grades.academicYear, normYear),
              eq(grades.parishId, parishId),
            ))
            .limit(1)

          if (!grade) {
            return { studentId: item.studentId, status: 'not-found', message: 'Không có bảng điểm cho học sinh này trong học kỳ' }
          }

          const [entry] = await tx
            .select()
            .from(auditLogs)
            .where(and(
              eq(auditLogs.entityType, 'grade'),
              eq(auditLogs.entityId, grade.id),
              eq(auditLogs.parishId, parishId),
            ))
            .orderBy(desc(auditLogs.createdAt))
            .limit(1)

          if (!entry) {
            return { studentId: item.studentId, status: 'no-audit', message: 'Không có dữ liệu audit để khôi phục' }
          }

          // ADR-028: entry mới nhất phải là CREATE/UPDATE của chính đợt import.
          // Nếu là thao tác khác (VD: GRADE_UNDO trước đó, override…) → từ chối.
          if (entry.action !== 'CREATE' && entry.action !== 'UPDATE') {
            return { studentId: item.studentId, status: 'not-clean', message: 'Đã có thay đổi khác sau đợt nhập — không thể hoàn tác tự động' }
          }

          const windowMs = UNDO_GRADE_WINDOW_DAYS * 24 * 60 * 60 * 1000
          if (Date.now() - new Date(entry.createdAt).getTime() > windowMs) {
            return { studentId: item.studentId, status: 'expired', message: `Chỉ có thể hoàn tác trong ${UNDO_GRADE_WINDOW_DAYS} ngày kể từ khi nhập điểm` }
          }

          if (entry.action === 'CREATE') {
            // Xóa row tạo ra bởi đợt import (grade_overrides đi kèm).
            await tx.delete(gradeOverrides).where(and(eq(gradeOverrides.gradeId, grade.id), eq(gradeOverrides.parishId, parishId)))
            await tx.delete(grades).where(and(eq(grades.id, grade.id), eq(grades.parishId, parishId)))
            await tx.insert(auditLogs).values({
              id: generateId('AUD'),
              userId,
              action: 'GRADE_UNDO',
              entityType: 'grade',
              entityId: grade.id,
              oldValue: JSON.stringify(grade),
              newValue: JSON.stringify({ policyVersionIdAtUndo }),
              ip,
              userAgent,
              parishId,
            })
            return { studentId: item.studentId, status: 'deleted' }
          }

          // UPDATE: khôi phục cột từ oldValue (ảnh row trước đợt import).
          const previous = JSON.parse(entry.oldValue ?? 'null')
          if (!previous || typeof previous !== 'object') {
            return { studentId: item.studentId, status: 'no-audit', message: 'Audit thiếu dữ liệu trạng thái cũ' }
          }
          const restorePayload: Record<string, any> = {
            version: (grade.version || 1) + 1,
            updatedAt: new Date().toISOString(),
            updatedBy: userId,
          }
          for (const key of Object.keys(previous)) {
            if (['id', 'studentId', 'semester', 'academicYear', 'parishId', 'version', 'createdAt', 'updatedAt', 'updatedBy'].includes(key)) continue
            restorePayload[key] = previous[key] ?? null
          }
          await tx
            .update(grades)
            .set(restorePayload)
            .where(and(eq(grades.id, grade.id), eq(grades.parishId, parishId), eq(grades.version, grade.version)))

          const [restored] = await tx.select().from(grades).where(and(eq(grades.id, grade.id), eq(grades.parishId, parishId))).limit(1)
          await tx.insert(auditLogs).values({
            id: generateId('AUD'),
            userId,
            action: 'GRADE_UNDO',
            entityType: 'grade',
            entityId: grade.id,
            oldValue: JSON.stringify(grade),
            newValue: JSON.stringify({
              restored,
              policyVersionIdAtUndo,
              policyVersionIdAtImport: entry.oldValue ? JSON.parse(entry.oldValue).policyVersionId || null : null,
            }),
            ip,
            userAgent,
            parishId,
          })
          return { studentId: item.studentId, status: 'restored' }
        })
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Lỗi không xác định'
        if (msg.includes('quyền')) {
          return { studentId: item.studentId, status: 'forbidden', message: msg }
        }
        return { studentId: item.studentId, status: 'error' as any, message: msg }
      }
    })()
    results.push(result)
  }

  return results
}

export async function upsertGradeBatch(dataList: GradeData[], userId: string, parishId: string, ip: string, userAgent: string, allowedClassIds?: string[] | null) {
  const results: { studentId: string; status: 'saved' | 'conflict' | 'error'; error?: string; currentGrade?: any; record?: any }[] = []

  for (const data of dataList) {
    try {
      let savedRecord: any = null
      await db.transaction(async (tx) => {
        // ADR-016 (offline-sync audit #2): upsertGrade trả về row đã ghi (id + version
        // thật của server) — trả kèm trong 'saved' để client rehydrate bản ghi tạm
        // (temp GR- id) thành bản ghi server trước khi xóa op, tránh lần sửa kế tiếp
        // gửi temp id + version cũ → 409 → điểm bị mất khỏi UI.
        savedRecord = await upsertGrade(data, userId, parishId, ip, userAgent, tx, allowedClassIds)
      })
      results.push({ studentId: data.studentId, status: 'saved', record: savedRecord })
    } catch (err: any) {
      if (err instanceof VersionConflictError) {
        results.push({ studentId: data.studentId, status: 'conflict', error: err.message, currentGrade: err.currentGrade })
      } else {
        results.push({ studentId: data.studentId, status: 'error', error: err.message || 'Unknown error' })
      }
    }
  }

  return results
}
