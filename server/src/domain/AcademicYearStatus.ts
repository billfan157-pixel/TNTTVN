/**
 * Academic Year Lifecycle — State Machine (SSOT).
 *
 * Trạng thái năm học:
 *   OPEN → SEMESTER_1_LOCKED → SEMESTER_2_OPEN → SEMESTER_2_LOCKED → FINALIZED → PROMOTED → ARCHIVED
 *
 * Quy tắc chuyển trạng thái (chỉ Admin):
 *   - Lock HK1 (semester_locks)              → SEMESTER_1_LOCKED
 *   - Start Semester 2 (currentSemester=2)   → SEMESTER_2_OPEN   (yêu cầu HK1 đã khóa)
 *   - Lock HK2 (semester_locks)              → SEMESTER_2_LOCKED (yêu cầu HK1 đã khóa)
 *   - Finalize Year (snapshot + isLocked)    → FINALIZED         (yêu cầu HK1+HK2 đã khóa)
 *   - Promote Year (promotion_records + chuyển lớp) → PROMOTED
 *   - Archive → ARCHIVED
 *
 * Trạng thái có thể suy ra từ dữ liệu thô (semester_locks + academic_years.status);
 * FINALIZED/PROMOTED/ARCHIVED là trạng thái ghi đè — chỉ set qua lifecycle service.
 */

export const ACADEMIC_YEAR_STATUSES = [
  'OPEN',
  'SEMESTER_1_LOCKED',
  'SEMESTER_2_OPEN',
  'SEMESTER_2_LOCKED',
  'FINALIZED',
  'PROMOTED',
  'ARCHIVED',
] as const

export type AcademicYearStatus = typeof ACADEMIC_YEAR_STATUSES[number]

export const ACADEMIC_YEAR_STATUS_LABELS: Record<AcademicYearStatus, string> = {
  OPEN: 'Mở — HK1',
  SEMESTER_1_LOCKED: 'Đã Khóa HK1',
  SEMESTER_2_OPEN: 'Đang HK2',
  SEMESTER_2_LOCKED: 'Đã Khóa HK2',
  FINALIZED: 'Đã Chốt Năm Học',
  PROMOTED: 'Đã Xét Lên Lớp',
  ARCHIVED: 'Đã Lưu Trữ',
}

export interface AcademicYearRow {
  id: string
  status: AcademicYearStatus | string
  currentSemester: number
  isLocked: number
}

export interface SemesterLockState {
  semester1Locked: boolean
  semester2Locked: boolean
}

/**
 * Suy ra trạng thái hiện tại của năm học từ (status cột, currentSemester, khóa HK).
 * FINALIZED/PROMOTED/ARCHIVED ưu tiên từ cột status (trạng thái ghi đè không
 * thể suy lại từ semester_locks).
 */
export function deriveAcademicYearStatus(
  year: Pick<AcademicYearRow, 'status' | 'currentSemester' | 'isLocked'>,
  locks: SemesterLockState
): AcademicYearStatus {
  if (year.status === 'PROMOTED' || year.status === 'ARCHIVED' || year.status === 'FINALIZED') {
    return year.status as AcademicYearStatus
  }
  if (year.isLocked === 1) return 'FINALIZED'
  if (locks.semester2Locked) return 'SEMESTER_2_LOCKED'
  if (locks.semester1Locked) {
    return year.currentSemester === 2 ? 'SEMESTER_2_OPEN' : 'SEMESTER_1_LOCKED'
  }
  return 'OPEN'
}

/** Trạng thái terminal — không thể sửa điểm/điểm danh/khóa thêm. */
export function isTerminalStatus(status: AcademicYearStatus): boolean {
  return status === 'FINALIZED' || status === 'PROMOTED' || status === 'ARCHIVED'
}

export interface DerivedAcademicYearState {
  status: AcademicYearStatus
  /** Năm đã khóa/kết thúc — mọi quyền sửa dữ liệu bị chặn. */
  terminal: boolean
}

/**
 * AYL-06 (audit 2026-08-09): state duy nhất cho các guard lifecycle.
 * Trước đây `finalizeYear` tự ghép `isTerminalStatus(derive(...)) && isLocked === 1`
 * (2 cách suy trạng thái terminal) — nay gom 1 chỗ. Derived với locks giả
 * `{false,false}` vẫn đúng vì FINALIZED/PROMOTED/ARCHIVED lấy từ cột status
 * và isLocked lấy từ chính year.
 */
export function deriveAcademicYearState(
  year: Pick<AcademicYearRow, 'status' | 'currentSemester' | 'isLocked'>,
  locks: SemesterLockState
): DerivedAcademicYearState {
  const status = deriveAcademicYearStatus(year, locks)
  return { status, terminal: isTerminalStatus(status) || year.isLocked === 1 }
}

export function isArchivedStatus(status: AcademicYearStatus): boolean {
  return status === 'ARCHIVED'
}
