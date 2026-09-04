import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGradeStore, getCurrentAcademicYear } from '../../stores/gradeStore'
import * as syncService from '../../lib/syncService'
import { api } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  api: {
    getGrades: vi.fn(),
  },
  isAuthenticated: () => {
    try {
      return !!localStorage.getItem('parish_current_user')
    } catch {
      return false
    }
  },
}))

vi.mock('../../lib/syncService', () => ({
  syncUpsertGrade: vi.fn(),
  syncBatchUpsertGrades: vi.fn(),
}))

vi.mock('../../lib/db', () => ({
  dexieStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: {
    getState: () => ({ currentYear: '' }),
  },
}))

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

beforeEach(() => {
  useGradeStore.setState({ grades: [] })
  vi.clearAllMocks()
})

describe('gradeStore', () => {
  it('getStudentGrade returns undefined when no grade exists', () => {
    const grade = useGradeStore.getState().getStudentGrade('ST-999', 1)
    expect(grade).toBeUndefined()
  })

  it('upsertGrade creates a new grade record', () => {
    useGradeStore.getState().upsertGrade({
      studentId: 'ST-001', semester: 1, scoreOral: 8, scoreFinal: 9,
    }, true)
    const grades = useGradeStore.getState().grades
    expect(grades).toHaveLength(1)
    expect(grades[0].studentId).toBe('ST-001')
    expect(grades[0].scoreOral).toBe(8)
    expect(grades[0].scoreFinal).toBe(9)
    expect(grades[0].id).toMatch(/^GR-/)
  })

  it('upsertGrade merges with existing grade record', () => {
    useGradeStore.getState().upsertGrade({ studentId: 'ST-001', semester: 1, scoreOral: 8 }, true)
    useGradeStore.getState().upsertGrade({ studentId: 'ST-001', semester: 1, scoreFinal: 9 }, true)
    const grade = useGradeStore.getState().getStudentGrade('ST-001', 1)
    expect(grade?.scoreOral).toBe(8)
    expect(grade?.scoreFinal).toBe(9)
  })

  it('upsertGrade with skipSync=false calls syncUpsertGrade', () => {
    useGradeStore.getState().upsertGrade({ studentId: 'ST-001', semester: 1, scoreOral: 8 }, false)
    expect(vi.mocked(syncService.syncUpsertGrade)).toHaveBeenCalledTimes(1)
  })

  it('upsertGrade with skipSync=true does not call sync', () => {
    useGradeStore.getState().upsertGrade({ studentId: 'ST-001', semester: 1, scoreOral: 8 }, true)
    expect(vi.mocked(syncService.syncUpsertGrade)).not.toHaveBeenCalled()
  })

  it('getStudentGrade finds grade by studentId and semester', () => {
    useGradeStore.getState().upsertGrade({ studentId: 'ST-001', semester: 1, scoreOral: 8 }, true)
    useGradeStore.getState().upsertGrade({ studentId: 'ST-001', semester: 2, scoreOral: 9 }, true)
    useGradeStore.getState().upsertGrade({ studentId: 'ST-002', semester: 1, scoreOral: 7 }, true)
    expect(useGradeStore.getState().getStudentGrade('ST-001', 1)?.scoreOral).toBe(8)
    expect(useGradeStore.getState().getStudentGrade('ST-001', 2)?.scoreOral).toBe(9)
    expect(useGradeStore.getState().getStudentGrade('ST-002', 1)?.scoreOral).toBe(7)
  })

  it('batchSaveGrades saves multiple grades at once', () => {
    useGradeStore.getState().batchSaveGrades([
      { studentId: 'ST-001', semester: 1, scoreOral: 8 },
      { studentId: 'ST-002', semester: 1, scoreOral: 9 },
    ], false)
    expect(useGradeStore.getState().grades).toHaveLength(2)
    expect(vi.mocked(syncService.syncBatchUpsertGrades)).toHaveBeenCalledTimes(1)
  })

  it('batchSaveGrades with skipSync=true skips sync', () => {
    useGradeStore.getState().batchSaveGrades([
      { studentId: 'ST-001', semester: 1, scoreOral: 8 },
    ], true)
    expect(vi.mocked(syncService.syncBatchUpsertGrades)).not.toHaveBeenCalled()
  })

  it('fetchGrades replaces grades on full fetch (no updatedAfter)', async () => {
    vi.mocked(api.getGrades).mockResolvedValue([
      { id: 'GR-1', studentId: 'ST-001', semester: 1, academicYear: '2025 - 2026', scoreOral: 9 },
      { id: 'GR-2', studentId: 'ST-002', semester: 1, academicYear: '2025 - 2026', scoreOral: 8 },
    ])
    localStorage.setItem('parish_current_user', '{"id":"U-TEST"}')
    await useGradeStore.getState().fetchGrades()
    expect(useGradeStore.getState().grades).toHaveLength(2)
    localStorage.removeItem('parish_current_user')
  })

  it('fetchGrades merges with updatedAfter param', async () => {
    useGradeStore.setState({
      grades: [{ id: 'GR-1', studentId: 'ST-001', semester: 1, academicYear: '2025 - 2026', scoreOral: 8 } as any],
    })
    vi.mocked(api.getGrades).mockResolvedValue([
      { id: 'GR-2', studentId: 'ST-002', semester: 1, academicYear: '2025 - 2026', scoreOral: 9 },
    ])
    localStorage.setItem('parish_current_user', '{"id":"U-TEST"}')
    await useGradeStore.getState().fetchGrades('2025-01-01T00:00:00Z')
    expect(useGradeStore.getState().grades).toHaveLength(2)
    expect(useGradeStore.getState().grades.find(g => g.id === 'GR-1')).toBeTruthy()
    expect(useGradeStore.getState().grades.find(g => g.id === 'GR-2')).toBeTruthy()
    localStorage.removeItem('parish_current_user')
  })

  it('replaces local cache when full fetch returns empty array', async () => {
    useGradeStore.setState({
      grades: [{ id: 'GR-1', studentId: 'ST-001', semester: 1, academicYear: '2025 - 2026', scoreOral: 8 } as any],
    })
    vi.mocked(api.getGrades).mockResolvedValue([])
    localStorage.setItem('parish_current_user', '{"id":"U-TEST"}')
    await useGradeStore.getState().fetchGrades()
    expect(useGradeStore.getState().grades).toHaveLength(0)
    localStorage.removeItem('parish_current_user')
  })

  it('skips fetch when no auth token', async () => {
    localStorage.removeItem('parish_current_user')
    vi.clearAllMocks()
    await useGradeStore.getState().fetchGrades()
    expect(api.getGrades).not.toHaveBeenCalled()
  })

  it('getCurrentAcademicYear returns normalized format (ADR-017)', () => {
    expect(getCurrentAcademicYear()).toMatch(/^\d{4}-\d{4}$/)
  })

  it('setGrades replaces all grades', () => {
    useGradeStore.getState().setGrades([{ id: 'GR-1', studentId: 'ST-001', semester: 1, academicYear: '2025 - 2026', scoreOral: 9 } as any])
    expect(useGradeStore.getState().grades).toHaveLength(1)
  })

  it('calculateStudentAvg returns null when no grades exist', () => {
    const avg = useGradeStore.getState().calculateStudentAvg('ST-999', 1)
    expect(avg.score).toBeNull()
    expect(avg.label).toBe('Chưa có điểm')
  })

})
