import { db } from '../db/index.js'
import { academicYears } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { normalizeAcademicYear, computeAcademicYearDateRange } from '../utils/academicYear.js'

/**
 * ADR-017 (F2): Date range của năm học dùng để giới hạn attendance theo năm.
 * Ưu tiên row academic_years của giáo xứ (khớp theo id chuẩn hóa — id có thể
 * là '2025-2026' hoặc 'AY-2025-2026'), fallback quy ước mặc định tháng 8.
 */
export async function getAcademicYearDateRange(
  parishId: string,
  academicYear: string
): Promise<{ startDate: string; endDate: string }> {
  const normYear = normalizeAcademicYear(academicYear)
  try {
    const rows = await db.select().from(academicYears).where(eq(academicYears.parishId, parishId))
    const match = rows.find((r) => normalizeAcademicYear(r.id) === normYear)
    if (match && match.startDate && match.endDate) {
      return { startDate: match.startDate, endDate: match.endDate }
    }
  } catch {
    // fall through to computed default
  }
  return computeAcademicYearDateRange(normYear)
}
