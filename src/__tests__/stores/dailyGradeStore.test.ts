import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useGradeStore } from '../../stores/gradeStore'

vi.mock('../../lib/db', () => ({
  dexieStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

vi.mock('../../lib/syncService', () => ({
  syncUpsertGrade: vi.fn(),
  syncBatchUpsertGrades: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: { getGrades: vi.fn() },
}))

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: {
    getState: () => ({ currentYear: '2025 - 2026' }),
  },
}))

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

beforeEach(() => {
  useDailyGradeStore.setState({ entries: [] })
  useGradeStore.setState({ grades: [] })
  vi.clearAllMocks()
})

describe('DailyGradeStore', () => {
  it('adds a daily grade entry with auto-generated id and date', () => {
    useDailyGradeStore.getState().addEntry('ST-001', 'oral', 8, 1)
    const entries = useDailyGradeStore.getState().entries
    expect(entries).toHaveLength(1)
    expect(entries[0].studentId).toBe('ST-001')
    expect(entries[0].scoreType).toBe('oral')
    expect(entries[0].value).toBe(8)
    expect(entries[0].semester).toBe(1)
    expect(entries[0].id).toMatch(/^DG-/)
    expect(entries[0].date).toBeTruthy()
  })

  it('clamps value between 0 and 10', () => {
    useDailyGradeStore.getState().addEntry('ST-001', 'oral', 15, 1)
    expect(useDailyGradeStore.getState().entries[0].value).toBe(10)
    useDailyGradeStore.getState().addEntry('ST-001', 'oral', -5, 1)
    expect(useDailyGradeStore.getState().entries[1].value).toBe(0)
  })

  it('removes an entry by id', () => {
    useDailyGradeStore.getState().addEntry('ST-001', 'oral', 7, 1)
    const id = useDailyGradeStore.getState().entries[0].id
    useDailyGradeStore.getState().removeEntry(id)
    expect(useDailyGradeStore.getState().entries).toHaveLength(0)
  })

  it('computes average correctly', () => {
    const store = useDailyGradeStore.getState()
    store.addEntry('ST-001', 'oral', 8, 1)
    store.addEntry('ST-001', 'oral', 6, 1)
    store.addEntry('ST-001', 'oral', 10, 1)
    store.addEntry('ST-001', 'oral', 7, 1)
    const avg = store.getAverageForStudent('ST-001', 1, 'oral')
    expect(avg).toBe(7.8)
  })

  it('returns null for no entries', () => {
    const avg = useDailyGradeStore.getState().getAverageForStudent('ST-999', 1, 'oral')
    expect(avg).toBeNull()
  })

  it('filters entries by score type', () => {
    const store = useDailyGradeStore.getState()
    store.addEntry('ST-001', 'oral', 8, 1)
    store.addEntry('ST-001', '15m', 9, 1)
    store.addEntry('ST-001', 'oral', 7, 1)
    const oralEntries = store.getEntriesForStudent('ST-001', 1, 'oral')
    expect(oralEntries).toHaveLength(2)
    const allEntries = store.getEntriesForStudent('ST-001', 1)
    expect(allEntries).toHaveLength(3)
  })

  it('does not mix semesters', () => {
    const store = useDailyGradeStore.getState()
    store.addEntry('ST-001', 'oral', 8, 1)
    store.addEntry('ST-001', 'oral', 9, 2)
    const sem1 = store.getEntriesForStudent('ST-001', 1, 'oral')
    expect(sem1).toHaveLength(1)
    expect(sem1[0].value).toBe(8)
    const sem2 = store.getEntriesForStudent('ST-001', 2, 'oral')
    expect(sem2).toHaveLength(1)
    expect(sem2[0].value).toBe(9)
  })

  it('syncAllToGradeStore pushes averages to gradeStore independently', () => {
    useDailyGradeStore.setState({
      entries: [
        { id: 'DG-1', studentId: 'ST-001', academicYear: '2025 - 2026', semester: 1, scoreType: 'oral', value: 8, date: '2025-01-01', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'DG-2', studentId: 'ST-001', academicYear: '2025 - 2026', semester: 1, scoreType: 'oral', value: 9, date: '2025-01-02', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'DG-3', studentId: 'ST-001', academicYear: '2025 - 2026', semester: 1, scoreType: '15m', value: 7, date: '2025-01-03', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'DG-4', studentId: 'ST-001', academicYear: '2025 - 2026', semester: 1, scoreType: '1period', value: 8, date: '2025-01-04', createdAt: '2025-01-01T00:00:00Z' },
      ],
    })
    useGradeStore.setState({ grades: [] })
    useDailyGradeStore.getState().syncAllToGradeStore()
    const grade = useGradeStore.getState().getStudentGrade('ST-001', 1)
    expect(grade).toBeDefined()
    expect(grade!.scoreOral).toBe(8.5)
    expect(grade!.score15m).toBe(7)
    expect(grade!.score1Period).toBe(8)
    expect(grade!.scoreFinal).toBeNull()
    expect(grade!.score15m_source).toBe('daily_avg')
  })

  it('syncAllToGradeStore filters by specific studentIds', () => {
    useDailyGradeStore.setState({
      entries: [
        { id: 'DG-5', studentId: 'ST-001', academicYear: '2025 - 2026', semester: 1, scoreType: 'oral', value: 8, date: '2025-01-01', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'DG-6', studentId: 'ST-002', academicYear: '2025 - 2026', semester: 1, scoreType: 'oral', value: 9, date: '2025-01-01', createdAt: '2025-01-01T00:00:00Z' },
      ],
    })
    useGradeStore.setState({ grades: [] })
    useDailyGradeStore.getState().syncAllToGradeStore(['ST-001'], 1)
    expect(useGradeStore.getState().getStudentGrade('ST-001', 1)?.scoreOral).toBe(8)
    expect(useGradeStore.getState().getStudentGrade('ST-002', 1)).toBeUndefined()
  })

  it('addEntry triggers syncAllToGradeStore automatically', () => {
    const spy = vi.spyOn(useDailyGradeStore.getState(), 'syncAllToGradeStore')
    useDailyGradeStore.getState().addEntry('ST-001', 'oral', 8, 1)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('removeEntry triggers syncAllToGradeStore', () => {
    useDailyGradeStore.getState().addEntry('ST-001', 'oral', 8, 1)
    const id = useDailyGradeStore.getState().entries[0].id
    const spy = vi.spyOn(useDailyGradeStore.getState(), 'syncAllToGradeStore')
    useDailyGradeStore.getState().removeEntry(id)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('setEntries replaces all entries', () => {
    useDailyGradeStore.getState().setEntries([
      { id: 'DG-1', studentId: 'ST-001', academicYear: '2025 - 2026', semester: 1, scoreType: 'oral', value: 8, date: '2025-01-01', createdAt: '2025-01-01T00:00:00Z' },
    ])
    expect(useDailyGradeStore.getState().entries).toHaveLength(1)
  })
})
