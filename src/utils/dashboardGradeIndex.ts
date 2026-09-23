import { normalizeAcademicYear } from './academicYear'

/** Preserve the first grade selected by the former per-student filter. */
export function indexDashboardGrades<T extends { studentId: string; semester: number; academicYear: string }>(
  grades: readonly T[], semester: number, academicYear: string,
): Map<string, T> {
  const byStudent = new Map<string, T>()
  for (const grade of grades) {
    if (grade.semester !== semester || normalizeAcademicYear(grade.academicYear) !== academicYear) continue
    if (!byStudent.has(grade.studentId)) byStudent.set(grade.studentId, grade)
  }
  return byStudent
}
