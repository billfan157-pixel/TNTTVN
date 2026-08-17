/**
 * Single source of truth for academic-year string handling (client).
 *
 * Canonical format: 'YYYY-YYYY' (no spaces, ASCII hyphen). The server stores
 * grades/academic_years in this format via server/src/utils/academicYear.ts;
 * the client must produce and match the same format everywhere so that batch
 * report cards, Sổ Điểm PDF, Excel exports and dashboard stats never silently
 * come out empty due to '2025 - 2026' vs '2025-2026' mismatches.
 */

export function normalizeAcademicYear(ay?: string | null): string {
  if (!ay) return ''
  return ay.replace(/\s*[-–—]\s*/g, '-').trim()
}

export function matchAcademicYear(ay1?: string | null, ay2?: string | null): boolean {
  if (!ay1 || !ay2) return true
  return normalizeAcademicYear(ay1) === normalizeAcademicYear(ay2)
}

/** Năm học bắt đầu từ tháng 8 (khớp server getCurrentAcademicYear). */
export function getCurrentAcademicYear(now: Date = new Date()): string {
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return `${startYear}-${startYear + 1}`
}

export interface AcademicYearDateRange {
  startDate: string
  endDate: string
}

/**
 * Default date range của một năm học khi không có row academic_years nào khớp
 * (fallback 'YYYY-08-01' → 'YYYY+1-07-31', cùng quy ước tháng 8 của
 * getCurrentAcademicYear và server computeAcademicYearDateRange).
 */
export function getAcademicYearDateRange(academicYear?: string | null): AcademicYearDateRange {
  const match = normalizeAcademicYear(academicYear || '').match(/^(\d{4})-(\d{4})$/)
  if (!match) {
    return { startDate: '2000-01-01', endDate: '2099-12-31' }
  }
  const startYear = parseInt(match[1], 10)
  const endYear = parseInt(match[2], 10)
  if (endYear !== startYear + 1) {
    return { startDate: '2000-01-01', endDate: '2099-12-31' }
  }
  return { startDate: `${startYear}-08-01`, endDate: `${endYear}-07-31` }
}

/**
 * Năm học đang hoạt động. Trả về currentYear (đã chuẩn hóa) nếu có, ngược lại
 * năm học tính theo ngày hiện tại — bất kỳ consumer nào cũng nhận được chuỗi
 * 'YYYY-YYYY' hợp lệ, không bao giờ rỗng.
 */
export function resolveActiveAcademicYear(currentYear?: string): string {
  return normalizeAcademicYear(currentYear) || getCurrentAcademicYear()
}
