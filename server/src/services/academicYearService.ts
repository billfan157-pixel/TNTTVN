import { db, type DbExecutor } from '../db/index.js'
import { academicYears, classes } from '../db/schema.js'
import { and, eq, isNull } from 'drizzle-orm'
import { normalizeAcademicYear, computeAcademicYearDateRange, getCurrentAcademicYear, resolveAcademicYear, resolveSemester, isAcademicYearClosedForWrite } from '../utils/academicYear.js'
import { drizzleSemesterLockRepository } from '../repositories/DrizzleSemesterLockRepository.js'
import { finalizationPolicySchema, historicalEvidenceRequired, parseHistoricalEvidence } from '../utils/academicYearHistory.js'

/** Null means live/open, never a fallback for a finalized legacy year. */
export async function getFinalizedYearContext(parishId: string, academicYear: string, executor: DbExecutor) {
  const rows = await executor.select().from(academicYears).where(eq(academicYears.parishId, parishId))
  const matches = rows.filter(row => normalizeAcademicYear(row.id) === normalizeAcademicYear(academicYear))
  if (matches.length > 1) throw historicalEvidenceRequired()
  const year = matches[0]
  if (!year || !isAcademicYearClosedForWrite(year)) return null
  return { yearId: year.id, policy: parseHistoricalEvidence(finalizationPolicySchema, year.finalizationPolicy) }
}

/**
 * Attendance is keyed by date, not academicYear. Every historical projection
 * containing that date must remain immutable when locked, including legacy
 * year IDs/ranges. Check all matching periods rather than choose an arbitrary
 * overlapping row, plus the canonical calendar lock when no year row exists.
 * Caller must pass its write transaction (no check-then-write gap).
 */
export async function isAttendanceDateLocked(parishId: string, date: string, executor: DbExecutor): Promise<boolean> {
  const years = await executor.select().from(academicYears).where(eq(academicYears.parishId, parishId))
  const candidates = years.filter(year => {
    const range = year.startDate && year.endDate ? year : computeAcademicYearDateRange(year.id)
    return range.startDate <= date && date <= range.endDate
  })
  if (candidates.some(year => isAcademicYearClosedForWrite(year))) return true
  const ids = new Set([resolveAcademicYear(date), ...candidates.map(year => year.id)])
  for (const id of ids) {
    if (await drizzleSemesterLockRepository.isLocked(id, resolveSemester(date), parishId, executor)) return true
  }
  return false
}

function academicYearWriteError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code, status: 409 })
}

export async function resolveWritableAcademicYear(
  parishId: string,
  requestedYear: string | null | undefined,
  executor: DbExecutor = db,
  classId?: string,
): Promise<string> {
  let canonicalYear = requestedYear?.trim() || undefined

  if (classId) {
    const [classRow] = await executor
      .select({ academicYearId: classes.academicYearId })
      .from(classes)
      .where(and(eq(classes.parishId, parishId), eq(classes.id, classId), isNull(classes.deletedAt)))
      .limit(1)
    if (!classRow) {
      throw academicYearWriteError('Lớp học không tồn tại trong giáo xứ hiện tại', 'CLASS_NOT_FOUND')
    }
    if (canonicalYear && normalizeAcademicYear(canonicalYear) !== normalizeAcademicYear(classRow.academicYearId)) {
      throw academicYearWriteError('Năm học không khớp với năm học của lớp', 'ACADEMIC_YEAR_MISMATCH')
    }
    canonicalYear = classRow.academicYearId
  }

  const rows = await executor
    .select()
    .from(academicYears)
    .where(eq(academicYears.parishId, parishId))

  if (canonicalYear) {
    const match = rows.find(row => normalizeAcademicYear(row.id) === normalizeAcademicYear(canonicalYear!))
    if (!match) {
      throw academicYearWriteError('Năm học không tồn tại trong giáo xứ hiện tại', 'ACADEMIC_YEAR_NOT_FOUND')
    }
    if (isAcademicYearClosedForWrite(match)) {
      throw academicYearWriteError('Năm học đã đóng, không thể ghi dữ liệu mới', 'ACADEMIC_YEAR_CLOSED')
    }
    return match.id
  }

  const openYears = rows
    .filter(row => !isAcademicYearClosedForWrite(row))
    .sort((left, right) => new Date(right.startDate).getTime() - new Date(left.startDate).getTime())
  const now = Date.now()
  const containing = openYears.find(row => new Date(row.startDate).getTime() <= now && new Date(row.endDate).getTime() >= now)
  const selected = containing || openYears[0]
  if (!selected) {
    throw academicYearWriteError('Giáo xứ chưa có năm học đang mở để ghi dữ liệu', 'NO_OPEN_ACADEMIC_YEAR')
  }
  return selected.id
}

/**
 * ADR-017 (F2): Date range của năm học dùng để giới hạn attendance theo năm.
 * Ưu tiên row academic_years của giáo xứ (khớp theo id chuẩn hóa — id có thể
 * là '2025-2026' hoặc 'AY-2025-2026'), fallback quy ước mặc định tháng 8.
 */
export async function getAcademicYearDateRange(
  parishId: string,
  academicYear: string,
  executor: DbExecutor = db
): Promise<{ startDate: string; endDate: string }> {
  const normYear = normalizeAcademicYear(academicYear)
  const rows = await executor.select().from(academicYears).where(eq(academicYears.parishId, parishId))
  const match = rows.find((r) => normalizeAcademicYear(r.id) === normYear)
  if (match && match.startDate && match.endDate) {
    return { startDate: match.startDate, endDate: match.endDate }
  }
  return computeAcademicYearDateRange(normYear)
}

/**
 * EXAM-AUDIT F4 (2026-08-21): ID năm học đang hoạt động của giáo xứ —
 * ưu tiên năm có range ngày chứa `now` (so sánh ISO YYYY-MM-DD), fallback năm
 * mới nhất theo start_date, cuối cùng quy ước tháng 8. Mirror ngữ nghĩa
 * getOpenSemester nhưng trả về ID năm; dùng làm default academicYear khi client
 * không gửi (BUSINESS_RULES "Tạo phiên chấm" quy tắc 2).
 */
export async function getActiveAcademicYearId(parishId: string, now: Date = new Date()): Promise<string> {
  const today = now.toISOString().slice(0, 10)
  try {
    const rows = await db
      .select()
      .from(academicYears)
      .where(eq(academicYears.parishId, parishId))
    const valid = rows.filter((r) => r.startDate && r.endDate)
    const containing = valid.find((r) => r.startDate <= today && today <= r.endDate)
    if (containing) return containing.id
    const latest = [...valid].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0]
    if (latest) return latest.id
  } catch {
    // fall through to calendar convention
  }
  return getCurrentAcademicYear(now)
}
