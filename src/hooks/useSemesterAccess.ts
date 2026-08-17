import { useAuth } from './useAuth'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { normalizeAcademicYear } from '../utils/academicYear'

/**
 * Quyền truy cập bộ lọc học kỳ (RBAC semester gating):
 * - Admin: được chuyển giữa HK1/HK2 (restricted = false).
 * - Tài khoản khác: bị khóa ở học kỳ đang mở (current_semester của năm học
 *   hoạt động) — không có nút chuyển học kỳ.
 */
export function useSemesterAccess() {
  const isAdmin = useAuth().isAdmin
  const academicYears = useAcademicYearStore((s) => s.academicYears)
  const currentYear = useAcademicYearStore((s) => s.currentYear)

  const active = academicYears.find(
    (y) => normalizeAcademicYear(y.id) === normalizeAcademicYear(currentYear)
  )
  const openSemester: 1 | 2 = active?.currentSemester === 2 ? 2 : 1
  const restricted = !isAdmin
  const ready = academicYears.length > 0

  return { restricted, openSemester, ready }
}
