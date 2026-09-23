import { describe, expect, it } from 'vitest'
import { indexDashboardGrades } from '../../utils/dashboardGradeIndex'

describe('desktop dashboard grade selection', () => {
  it('selects the first matching grade per student for the active semester and year', () => {
    const grades = [
      { id: 'old-year', studentId: 'a', semester: 1, academicYear: '2025-2026' },
      { id: 'first', studentId: 'a', semester: 1, academicYear: '2026 - 2027' },
      { id: 'later', studentId: 'a', semester: 1, academicYear: '2026-2027' },
      { id: 'other-semester', studentId: 'b', semester: 2, academicYear: '2026-2027' },
      { id: 'second-student', studentId: 'b', semester: 1, academicYear: '2026-2027' },
    ]

    const index = indexDashboardGrades(grades, 1, '2026-2027')
    expect([...index.values()].map(grade => grade.id)).toEqual(['first', 'second-student'])
  })
})
