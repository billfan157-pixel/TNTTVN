import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import type { GradeRecord, AttendanceRecord } from '../types'
import { attendanceApiClient } from '../lib/api/attendance'
import * as syncService from '../lib/syncService'

function makeMockGrade(overrides: Partial<GradeRecord>): GradeRecord {
  return {
    id: 'GR-MOCK',
    studentId: 'ST-0',
    academicYear: '2025-2026',
    semester: 1,
    scoreOral: null,
    scoreOral_source: null,
    scoreOral_updated_at: null,
    score15m: null,
    score15m_source: null,
    score15m_updated_at: null,
    score1Period: null,
    score1Period_source: null,
    score1Period_updated_at: null,
    scoreMidterm: null,
    scoreMidterm_source: null,
    scoreMidterm_updated_at: null,
    scoreFinal: null,
    scoreFinal_source: null,
    scoreFinal_updated_at: null,
    scoreDaoDuc: null,
    comments: '',
    ...overrides,
  }
}

// Mock dependencies for store tests
vi.mock('../lib/api', () => ({
  api: {
    getGrades: vi.fn(),
    getAttendance: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number
    path: string
    constructor(status: number, message: string, path: string = '') {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.path = path
    }
  },
}))

vi.mock('../lib/api/attendance', () => ({
  attendanceApiClient: {
    batchMarkAttendance: vi.fn(),
  },
}))

vi.mock('../lib/syncService', () => ({
  syncBatchUpsertGrades: vi.fn(),
  syncBatchSaveAttendance: vi.fn(),
}))

vi.mock('../lib/db', () => ({
  dexieStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  getDB: () => ({
    syncQueue: {
      where: () => ({
        anyOf: () => ({
          toArray: async () => [],
        }),
      }),
    },
  }),
}))

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

beforeEach(() => {
  useGradeStore.setState({ grades: [], error: null })
  useAttendanceStore.setState({ attendance: [], error: null, lockError: null, batchResult: null, isSubmitting: false })
  vi.clearAllMocks()
})

describe('Task 3 — Client Store Golden Tests & Benchmarks', () => {
  it('Golden Test (gradeStore.batchSaveGrades): preserves existing field values when incoming batch record has null without clearFields', () => {
    const initialGrade = makeMockGrade({
      id: 'GR-100',
      studentId: 'ST-1',
      academicYear: '2025-2026',
      semester: 1,
      scoreOral: 8.5,
      scoreOral_source: 'manual',
      scoreOral_updated_at: '2025-09-01T00:00:00Z',
      score15m: 9.0,
      score15m_source: 'manual',
      score15m_updated_at: '2025-09-01T00:00:00Z',
      score1Period: 7.5,
      comments: 'Chăm ngoan',
    })

    useGradeStore.setState({ grades: [initialGrade] })

    // Batch update score15m only (scoreOral is NOT provided / null in incoming patch without clearFields)
    useGradeStore.getState().batchSaveGrades([
      {
        studentId: 'ST-1',
        academicYear: '2025-2026',
        semester: 1,
        score15m: 9.5,
        score15m_source: 'manual',
        score15m_updated_at: '2025-09-02T00:00:00Z',
      },
    ], true)

    const updatedGrades = useGradeStore.getState().grades
    expect(updatedGrades).toHaveLength(1)
    const g = updatedGrades[0]

    // scoreOral must be preserved (8.5) and NOT overwritten with null/undefined
    expect(g.scoreOral).toBe(8.5)
    expect(g.scoreOral_source).toBe('manual')
    expect(g.score15m).toBe(9.5)
    expect(g.comments).toBe('Chăm ngoan')
  })

  it('Golden Test (gradeStore.batchSaveGrades): preserves manual source when incoming patch comes from excel_import', () => {
    const initialGrade = makeMockGrade({
      id: 'GR-101',
      studentId: 'ST-2',
      academicYear: '2025-2026',
      semester: 1,
      scoreOral: 8.0,
      scoreOral_source: 'manual',
      scoreOral_updated_at: '2025-09-01T00:00:00Z',
    })

    useGradeStore.setState({ grades: [initialGrade] })

    // Incoming patch has scoreOral_source: 'excel_import'
    useGradeStore.getState().batchSaveGrades([
      {
        studentId: 'ST-2',
        academicYear: '2025-2026',
        semester: 1,
        scoreOral: 8.0,
        scoreOral_source: 'excel_import',
      },
    ], true)

    const g = useGradeStore.getState().grades[0]
    expect(g.scoreOral_source).toBe('manual')
  })

  it('Golden Test (attendanceStore.batchSaveAttendance): preserves existing attendance fields on batch online save', async () => {
    const initialAtt: AttendanceRecord = {
      id: 'AT-100',
      studentId: 'ST-1',
      date: '2026-08-01',
      type: 'SundayMass',
      status: 'Present',
      note: 'Ghi chú ban đầu',
      version: 1,
    }

    useAttendanceStore.setState({ attendance: [initialAtt] })

    vi.mocked(attendanceApiClient.batchMarkAttendance).mockResolvedValue({
      total: 1,
      successCount: 1,
      skippedCount: 0,
      conflictCount: 0,
      errorCount: 0,
      results: [
        {
          studentId: 'ST-1',
          status: 'saved',
          record: { id: 'AT-100', studentId: 'ST-1', date: '2026-08-01', type: 'SundayMass', status: 'AbsentExcused', note: 'Xin nghỉ bệnh', version: 2, createdAt: '', updatedAt: '' },
        },
      ],
    })

    const store = useAttendanceStore.getState()
    await store.batchSaveAttendance(
      [{ studentId: 'ST-1', status: 'AbsentExcused', note: 'Xin nghỉ bệnh' }],
      '2026-08-01',
      'SundayMass'
    )

    const updatedAtt = useAttendanceStore.getState().attendance
    expect(updatedAtt).toHaveLength(1)
    expect(updatedAtt[0].id).toBe('AT-100')
    expect(updatedAtt[0].status).toBe('AbsentExcused')
    expect(updatedAtt[0].note).toBe('Xin nghỉ bệnh')
    expect(updatedAtt[0].version).toBe(2)
  })

  it('does not apply or acknowledge an offline attendance batch when durable enqueue fails', async () => {
    const onlineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.mocked(syncService.syncBatchSaveAttendance).mockRejectedValueOnce(new Error('IndexedDB quota exceeded'))
    useAttendanceStore.setState({ attendance: [] })

    const result = await useAttendanceStore.getState().batchSaveAttendance(
      [{ studentId: 'ST-DRAFT', status: 'AbsentExcused', note: 'Bản nháp' }],
      '2026-08-02',
      'SundayMass',
    )

    expect(result).toBeNull()
    expect(useAttendanceStore.getState().attendance).toEqual([])
    expect(useAttendanceStore.getState().error).toMatch(/bản nháp vẫn được giữ/i)
    onlineSpy.mockRestore()
  })

  it('Benchmark: batchSaveGrades timing for 1,000 items into 5,000 existing records', () => {
    const existing: GradeRecord[] = []
    for (let i = 0; i < 5000; i++) {
      existing.push(makeMockGrade({
        id: `GR-${i}`,
        studentId: `ST-${i}`,
        academicYear: '2025-2026',
        semester: (i % 2 === 0 ? 1 : 2) as 1 | 2,
        scoreOral: 7.0,
        score15m: 8.0,
        score1Period: 7.5,
      }))
    }
    useGradeStore.setState({ grades: existing })

    const batchInput = []
    for (let i = 0; i < 1000; i++) {
      batchInput.push({
        studentId: `ST-${i * 2}`,
        academicYear: '2025-2026',
        semester: 1 as const,
        scoreOral: 9.0,
        score15m: 9.5,
      })
    }

    const start = performance.now()
    useGradeStore.getState().batchSaveGrades(batchInput, true)
    const end = performance.now()

    console.log(`[BENCHMARK] batchSaveGrades time: ${(end - start).toFixed(2)}ms`)
    expect(useGradeStore.getState().grades.length).toBeGreaterThanOrEqual(5000)
  })

  it('Benchmark: batchSaveAttendance timing for 1,000 items into 5,000 existing records', async () => {
    const existing: AttendanceRecord[] = []
    for (let i = 0; i < 5000; i++) {
      existing.push({
        id: `AT-${i}`,
        studentId: `ST-${i}`,
        date: '2026-08-01',
        type: 'SundayMass',
        status: 'Present',
        version: 1,
      })
    }
    useAttendanceStore.setState({ attendance: existing })

    const mockServerResults = []
    for (let i = 0; i < 1000; i++) {
      mockServerResults.push({
        studentId: `ST-${i}`,
        status: 'saved' as const,
        record: { id: `AT-${i}`, studentId: `ST-${i}`, date: '2026-08-01', type: 'SundayMass', status: 'AbsentExcused' as const, version: 2, createdAt: '', updatedAt: '' },
      })
    }
    vi.mocked(attendanceApiClient.batchMarkAttendance).mockResolvedValue({
      total: 1000,
      successCount: 1000,
      skippedCount: 0,
      conflictCount: 0,
      errorCount: 0,
      results: mockServerResults,
    })

    const batchInput = []
    for (let i = 0; i < 1000; i++) {
      batchInput.push({
        studentId: `ST-${i}`,
        status: 'AbsentExcused' as const,
        note: 'Sốt',
      })
    }

    const start = performance.now()
    await useAttendanceStore.getState().batchSaveAttendance(batchInput, '2026-08-01', 'SundayMass')
    const end = performance.now()

    console.log(`[BENCHMARK] batchSaveAttendance time: ${(end - start).toFixed(2)}ms`)
    expect(useAttendanceStore.getState().attendance.length).toBe(5000)
  })
})
