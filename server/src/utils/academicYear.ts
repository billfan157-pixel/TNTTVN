/**
 * Normalizes academic year strings (e.g. "2025 - 2026", "2025–2026") into standardized "2025-2026" format.
 *
 * UTIL-DRIFT-1 (2026-09-09): fallback cho input rỗng TRƯỚC ĐÂY hardcode '2025-2026'
 * (trong khi client `src/utils/academicYear.ts` trả `''`) — vừa lệch client/server
 * âm thầm, vừa thành time-bomb (sau tháng 8/2026 mọi record thiếu năm vẫn bị đóng
 * dấu năm cũ). Nay fallback về `getCurrentAcademicYear()` động (quy ước tháng 8,
 * khớp client `resolveActiveAcademicYear`).
 */
export function normalizeAcademicYear(rawYear?: string | null): string {
  if (!rawYear) return getCurrentAcademicYear()
  const normalized = rawYear.trim().replace(/\s*[-–—]\s*/g, '-')
  // Persistence IDs may carry a prefix (for example `AY-2025-2026`) while
  // reporting and grade facts use the canonical `2025-2026` value.
  const canonicalPair = normalized.match(/(?:^|\D)(\d{4})-(\d{4})(?:\D|$)/)
  return canonicalPair ? `${canonicalPair[1]}-${canonicalPair[2]}` : normalized || getCurrentAcademicYear()
}

/**
 * Academic year default khớp đúng client (src/stores/gradeStore.ts: getCurrentAcademicYear):
 * năm học bắt đầu từ tháng 8. Trước đây server tính theo năm dương lịch
 * (getFullYear()+1) nên trong tháng 1–7, payload thiếu academicYear bị tạo sai
 * năm học → duplicate dòng điểm cùng (studentId, semester) khác năm học.
 */
export function getCurrentAcademicYear(now: Date = new Date()): string {
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return `${startYear}-${startYear + 1}`
}

/**
 * ATT-02 (audit 2026-08-08): Ranh giới năm học dùng cho attendance phải KHỚP
 * với toàn hệ thống (getCurrentAcademicYear / ADR-017: tháng ≥ 8). Trước đây
 * attendance viết riêng 2 hàm "tháng ≥ 9" (attendanceService + AttendanceApplicationService)
 * → ngày tháng 8 thuộc năm cũ về phía attendance nhưng năm mới về phía grades.
 * SSOT: mọi nơi phải resolve qua đây.
 */
export function resolveAcademicYear(dateStr: string, now: Date = new Date(dateStr)): string {
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month >= 8) return `${year}-${year + 1}`
  return `${year - 1}-${year}`
}

export function resolveSemester(dateStr: string, now: Date = new Date(dateStr)): number {
  const month = now.getMonth() + 1
  // HK1: tháng 8 - 1 (bám ranh giới năm học tháng 8); HK2: tháng 2 - 6
  if (month >= 8 || month === 1) return 1
  return 2
}

export function parseAcademicYear(year: string): { startYear: number; endYear: number } | null {
  const m = year.match(/^(\d{4})-(\d{4})$/)
  if (!m) return null
  const startYear = parseInt(m[1], 10)
  const endYear = parseInt(m[2], 10)
  if (endYear !== startYear + 1) return null
  return { startYear, endYear }
}

/**
 * ADR-017 (F2): Date range mặc định của một năm học ('2025-2026' → 2025-08-01
 * … 2026-07-31, quy ước tháng 8) — dùng để giới hạn attendance theo năm học
 * khi không có row academic_years khớp. Năm không parse được → range rộng
 * (không lọc) để không làm hỏng truy vấn.
 */
export function computeAcademicYearDateRange(academicYear: string): { startDate: string; endDate: string } {
  const parsed = parseAcademicYear(academicYear)
  if (!parsed) return { startDate: '2000-01-01', endDate: '2099-12-31' }
  return {
    startDate: `${parsed.startYear}-08-01`,
    endDate: `${parsed.endYear}-07-31`,
  }
}
