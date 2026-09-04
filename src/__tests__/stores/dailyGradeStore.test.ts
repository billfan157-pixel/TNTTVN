import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useGradeStore } from '../../stores/gradeStore'
import * as syncService from '../../lib/syncService'

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
  syncUpsertDailyEntry: vi.fn().mockResolvedValue('OP-DG-1'),
  syncDeleteDailyEntry: vi.fn().mockResolvedValue('OP-DG-2'),
}))

vi.mock('../../lib/api', () => ({
  api: { getGrades: vi.fn(), getDailyEntries: vi.fn() },
}))

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: {
    getState: () => ({ currentYear: '2025 - 2026' }),
  },
}))

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

beforeEach(() => {
  useDailyGradeStore.setState({ entries: [], serverEntries: [] })
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

  describe('Tier 1 containment (daily là điểm chính thức)', () => {
    function seedGrade(fields: Record<string, unknown>) {
      useGradeStore.getState().upsertGrade({
        studentId: 'ST-001',
        semester: 1,
        academicYear: '2025 - 2026',
        ...fields,
      } as never, true)
    }

    it('display path (skipSync) không enqueue và không null-out daily_avg server khi thiếu entries', () => {
      seedGrade({ scoreOral: 8, scoreOral_source: 'daily_avg', score15m: 7, score15m_source: 'daily_avg' })
      useDailyGradeStore.setState({
        entries: [
          { id: 'DG-1', studentId: 'ST-001', academicYear: '2025 - 2026', semester: 1, scoreType: 'oral', value: 9, date: '2025-01-01', createdAt: '2025-01-01T00:00:00Z' },
        ],
      })

      // Mô phỏng fetchGrades() hậu-finalize: pull + tính lại hiển thị.
      useDailyGradeStore.getState().syncAllToGradeStore(undefined, undefined, { skipSync: true })

      expect(vi.mocked(syncService.syncUpsertGrade)).not.toHaveBeenCalled()
      const grade = useGradeStore.getState().getStudentGrade('ST-001', 1)
      // Cột có entries → hiển thị local; cột thiếu entries → giữ nguyên server.
      expect(grade?.scoreOral).toBe(9)
      expect(grade?.score15m).toBe(7)
      expect((grade as unknown as Record<string, unknown>)?.['score15m_source']).toBe('daily_avg')
    })

    it('addEntry chỉ project đúng cột, giữ nguyên cột daily_avg server khác', () => {
      seedGrade({ score15m: 7, score15m_source: 'daily_avg' })

      useDailyGradeStore.getState().addEntry('ST-001', 'oral', 8, 1)

      expect(vi.mocked(syncService.syncUpsertGrade)).toHaveBeenCalled()
      const grade = useGradeStore.getState().getStudentGrade('ST-001', 1)
      expect(grade?.scoreOral).toBe(8)
      // Cột 15m của server (vd từ finalize) không bị đè/null bởi device thiếu entries.
      expect(grade?.score15m).toBe(7)
      expect((grade as unknown as Record<string, unknown>)?.['score15m_source']).toBe('daily_avg')
    })

    it('removeEntry entry cuối vẫn null-out + push (giữ delete semantics)', () => {
      useDailyGradeStore.getState().addEntry('ST-001', 'oral', 8, 1)
      vi.clearAllMocks()
      const id = useDailyGradeStore.getState().entries[0].id

      useDailyGradeStore.getState().removeEntry(id)

      expect(vi.mocked(syncService.syncUpsertGrade)).toHaveBeenCalled()
      const grade = useGradeStore.getState().getStudentGrade('ST-001', 1)
      expect(grade?.scoreOral).toBeNull()
    })

    it('không tạo grade row rỗng khi field bị guard manual', () => {
      seedGrade({ scoreOral: 9, scoreOral_source: 'manual' })

      useDailyGradeStore.getState().addEntry('ST-001', 'oral', 6, 1)

      expect(vi.mocked(syncService.syncUpsertGrade)).not.toHaveBeenCalled()
      expect(useGradeStore.getState().grades).toHaveLength(1)
      expect(useGradeStore.getState().getStudentGrade('ST-001', 1)?.scoreOral).toBe(9)
    })
  })

  describe('Tier 2 — ledger sync wiring', () => {
    it('addEntry enqueue daily_entry CREATE trước grade projection', async () => {
      useDailyGradeStore.getState().addEntry('ST-001', 'oral', 8, 1)
      await Promise.resolve()

      expect(vi.mocked(syncService.syncUpsertDailyEntry)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(syncService.syncUpsertDailyEntry)).toHaveBeenCalledWith(expect.objectContaining({
        studentId: 'ST-001',
        semester: 1,
        scoreType: 'oral',
        value: 8,
      }))
      const entryId = useDailyGradeStore.getState().entries[0].id
      expect(vi.mocked(syncService.syncUpsertDailyEntry).mock.calls[0][0].id).toBe(entryId)
    })

    it('removeEntry enqueue daily_entry DELETE', async () => {
      useDailyGradeStore.getState().addEntry('ST-001', 'oral', 8, 1)
      const id = useDailyGradeStore.getState().entries[0].id
      vi.clearAllMocks()

      useDailyGradeStore.getState().removeEntry(id)
      await Promise.resolve()

      expect(vi.mocked(syncService.syncDeleteDailyEntry)).toHaveBeenCalledWith(id)
    })

    it('fetchDailyEntries map rows server → serverEntries (machine filter được)', async () => {
      const { api } = await import('../../lib/api')
      vi.mocked(api.getDailyEntries).mockResolvedValue([
        { id: 'DG-1', studentId: 'ST-001', academicYear: '2025 - 2026', semester: 1, scoreType: 'oral', value: 8, date: '2026-01-15', origin: 'manual', examSessionId: null, createdAt: '2026-01-15T00:00:00Z' },
        { id: 'ASM-1', studentId: 'ST-001', academicYear: '2025 - 2026', semester: 1, scoreType: 'oral', value: 6, date: null, origin: 'machine', examSessionId: 'EXS-1', createdAt: '2026-01-16T00:00:00Z' },
      ])

      await useDailyGradeStore.getState().fetchDailyEntries({ classId: 'CL-1', semester: 1 })

      expect(api.getDailyEntries).toHaveBeenCalledWith({ classId: 'CL-1', semester: 1 })
      const machine = useDailyGradeStore.getState().getMachineEntries('ST-001', 1, 'oral')
      expect(machine).toHaveLength(1)
      expect(machine[0].id).toBe('ASM-1')
      expect(machine[0].origin).toBe('machine')
    })

    it('fetchDailyEntries lỗi (offline) → giữ entries local', async () => {
      const { api } = await import('../../lib/api')
      vi.mocked(api.getDailyEntries).mockRejectedValue(new Error('Network offline'))
      useDailyGradeStore.getState().addEntry('ST-001', 'oral', 8, 1)

      await useDailyGradeStore.getState().fetchDailyEntries({ classId: 'CL-1', semester: 1 })

      expect(useDailyGradeStore.getState().entries).toHaveLength(1)
      expect(useDailyGradeStore.getState().serverEntries).toHaveLength(0)
    })
  })
})
