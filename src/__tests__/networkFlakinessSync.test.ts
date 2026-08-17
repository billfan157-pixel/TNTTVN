import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processOperation, getBackoffMs, isNetworkError } from '../lib/syncProcessor'
import { api, ApiError } from '../lib/api'

vi.mock('../lib/api', () => {
  class ApiErrorMock extends Error {
    status: number
    details?: unknown
    constructor(status: number, message: string, details?: unknown) {
      super(message)
      this.status = status
      this.details = details
    }
  }
  return {
    api: {
      createStudent: vi.fn(),
      updateStudent: vi.fn(),
      deleteStudent: vi.fn(),
      upsertGrade: vi.fn(),
      upsertAttendance: vi.fn(),
      createNotice: vi.fn(),
      updateNotice: vi.fn(),
      deleteNotice: vi.fn(),
      createClass: vi.fn(),
      updateClass: vi.fn(),
      deleteClass: vi.fn(),
      createExam: vi.fn(),
      saveExamResults: vi.fn(),
      removeExamResult: vi.fn(),
      completeExam: vi.fn(),
      reopenExam: vi.fn(),
      deleteExam: vi.fn(),
    },
    ApiError: ApiErrorMock,
  }
})

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

describe('Network Flakiness & Resilience Tests (E3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. Mid-push network failure (status 0) -> flags operation as recoverable (recoverable: true)', async () => {
    vi.mocked(api.upsertGrade).mockRejectedValueOnce(new ApiError(0, 'Network timeout / dropped connection', '/api/grades'))

    const item = {
      id: 'OP-001',
      entity: 'grade',
      operation: 'UPDATE',
      data: { studentId: 'ST-001', semester: 1, academicYear: '2025-2026', scoreOral: 9 },
      retryCount: 0,
    }

    const res = await processOperation(item as any)
    expect(res.ok).toBe(false)
    expect(res.recoverable).toBe(true)
    expect(res.error).toBe('Network offline')
  })

  it('2. Rate limited (HTTP 429) during network flakiness -> recoverable with exponential backoff', async () => {
    vi.mocked(api.upsertAttendance).mockRejectedValueOnce(new ApiError(429, 'Too Many Requests', '/api/attendance'))

    const item = {
      id: 'OP-002',
      entity: 'attendance',
      operation: 'UPDATE',
      data: { studentId: 'ST-001', date: '2025-08-15', type: 'SundayMass', status: 'Present' },
      retryCount: 1,
    }

    const res = await processOperation(item as any)
    expect(res.ok).toBe(false)
    expect(res.recoverable).toBe(true)
    expect(res.error).toContain('Rate limited')
    expect(getBackoffMs(1)).toBe(15000)
    expect(getBackoffMs(2)).toBe(60000)
  })

  it('3. Server conflict (HTTP 409) -> handles conflict gracefully, server version accepted', async () => {
    const conflictDetails = { id: 'GR-100', version: 3, scoreOral: 8.5 }
    const conflictErr = new ApiError(409, 'Version Conflict', '/api/grades')
    ;(conflictErr as any).details = conflictDetails
    vi.mocked(api.upsertGrade).mockRejectedValueOnce(conflictErr)

    const item = {
      id: 'OP-003',
      entity: 'grade',
      operation: 'UPDATE',
      data: { studentId: 'ST-001', semester: 1, academicYear: '2025-2026', scoreOral: 9, version: 2 },
      retryCount: 0,
    }

    const res = await processOperation(item as any)
    expect(res.ok).toBe(true)
    expect(res.isConflict).toBe(true)
    expect(res.data).toEqual(conflictDetails)
  })

  it('4. Client error (HTTP 400 Bad Request) -> non-recoverable (recoverable: false) to prevent infinite retry loop', async () => {
    vi.mocked(api.createStudent).mockRejectedValueOnce(new ApiError(400, 'Invalid student date of birth', '/api/students'))

    const item = {
      id: 'OP-004',
      entity: 'student',
      operation: 'CREATE',
      data: { holyName: 'Gioan', fullName: 'Van A', dateOfBirth: 'invalid-date' },
      retryCount: 0,
    }

    const res = await processOperation(item as any)
    expect(res.ok).toBe(false)
    expect(res.recoverable).toBe(false)
    expect(res.error).toContain('Client error 400')
  })

  it('5. Server error (HTTP 500) -> retries up to MAX_RETRIES (3), then flags non-recoverable', async () => {
    vi.mocked(api.updateClass).mockRejectedValue(new ApiError(500, 'Internal Server Error', '/api/classes'))

    const item = {
      id: 'OP-005',
      entity: 'class',
      operation: 'UPDATE',
      data: { id: 'CLS-001', name: 'Ấu Nhi 1' },
      retryCount: 2,
    }

    // Try count = 2 (< 3) -> recoverable
    const resRetry = await processOperation(item as any)
    expect(resRetry.ok).toBe(false)
    expect(resRetry.recoverable).toBe(true)

    // Try count = 3 (>= 3) -> non-recoverable
    item.retryCount = 3
    const resMax = await processOperation(item as any)
    expect(resMax.ok).toBe(false)
    expect(resMax.recoverable).toBe(false)
    expect(resMax.error).toContain('Max retries reached')
  })
})
