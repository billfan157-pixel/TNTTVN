import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processOperation, getBackoffMs, isNetworkError, sanitizeStudentPayload } from '../lib/syncProcessor'
import { api, ApiError } from '../lib/api'

vi.mock('../lib/api', () => {
  class ApiErrorMock extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
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
      saveDailyEntries: vi.fn(),
      deleteDailyEntry: vi.fn(),
      getDailyEntries: vi.fn(),
    },
    ApiError: ApiErrorMock,
  }
})

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

describe('syncProcessor', () => {
  describe('getBackoffMs', () => {
    it('returns 5000ms for first retry', () => expect(getBackoffMs(0)).toBe(5000))
    it('returns 15000ms for second retry', () => expect(getBackoffMs(1)).toBe(15000))
    it('returns 60000ms for subsequent retries', () => {
      expect(getBackoffMs(2)).toBe(60000)
      expect(getBackoffMs(5)).toBe(60000)
    })
  })

  describe('isNetworkError', () => {
    it('detects failed to fetch errors', () => {
      expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    })
    it('detects network errors', () => {
      expect(isNetworkError(new TypeError('NetworkError: network is down'))).toBe(true)
    })
    it('returns false for non-TypeError', () => {
      expect(isNetworkError(new Error('Something broke'))).toBe(false)
    })
  })

  describe('sanitizeStudentPayload', () => {
    it('strips server-owned keys', () => {
      const result = sanitizeStudentPayload({
        id: 'ST-001', code: 'TN-1001', fullName: 'Test', parishId: 'p1',
        createdAt: 'now', updatedAt: 'now', updatedBy: 'admin', deletedAt: null,
      } as any)
      expect(result.fullName).toBe('Test')
      expect(result.id).toBeUndefined()
      expect(result.code).toBeUndefined()
    })

    it('strips undefined values', () => {
      const result = sanitizeStudentPayload({ fullName: 'Test', parentPhone: undefined } as any)
      expect(result.fullName).toBe('Test')
      expect(result.parentPhone).toBeUndefined()
    })
  })

  describe('processOperation', () => {
    beforeEach(() => vi.clearAllMocks())

    it('handles student CREATE', async () => {
      vi.mocked(api.createStudent).mockResolvedValue({ id: 'ST-SERVER-1', code: 'TN-2000' })
      const result = await processOperation({
        entity: 'student', operation: 'create', entityId: 'ST-001',
        payload: JSON.stringify({ fullName: 'Test' }),
      })
      expect(result.ok).toBe(true)
      expect(result.data?.id).toBe('ST-SERVER-1')
      expect(api.createStudent).toHaveBeenCalled()
    })

    it('handles student UPDATE', async () => {
      vi.mocked(api.updateStudent).mockResolvedValue({ id: 'ST-001', fullName: 'Updated' })
      const result = await processOperation({
        entity: 'student', operation: 'update', entityId: 'ST-001',
        payload: JSON.stringify({ fullName: 'Updated' }),
      })
      expect(result.ok).toBe(true)
      expect(api.updateStudent).toHaveBeenCalledWith('ST-001', { fullName: 'Updated' })
    })

    it('handles student DELETE', async () => {
      vi.mocked(api.deleteStudent).mockResolvedValue({ success: true })
      const result = await processOperation({
        entity: 'student', operation: 'delete', entityId: 'ST-001',
        payload: '{}',
      })
      expect(result.ok).toBe(true)
      expect(api.deleteStudent).toHaveBeenCalledWith('ST-001')
    })

    it('handles grade upsert', async () => {
      vi.mocked(api.upsertGrade).mockResolvedValue({ id: 'GR-1' })
      const result = await processOperation({
        entity: 'grade', operation: 'update', entityId: 'GR-1',
        payload: JSON.stringify({ studentId: 'ST-001', scoreOral: 8 }),
      })
      expect(result.ok).toBe(true)
      expect(api.upsertGrade).toHaveBeenCalledWith({ studentId: 'ST-001', scoreOral: 8 })
    })

    it('handles grade DELETE (nulls out scores)', async () => {
      vi.mocked(api.upsertGrade).mockResolvedValue({})
      const result = await processOperation({
        entity: 'grade', operation: 'delete', entityId: 'GR-1',
        payload: JSON.stringify({ studentId: 'ST-001' }),
      })
      expect(result.ok).toBe(true)
      expect(api.upsertGrade).toHaveBeenCalled()
      const data = vi.mocked(api.upsertGrade).mock.calls[0][0]
      expect(data.scoreOral).toBeNull()
      expect(data.score15m).toBeNull()
      expect(data.score1Period).toBeNull()
      expect(data.scoreMidterm).toBeNull()
      expect(data.scoreFinal).toBeNull()
      expect(data.scoreDaoDuc).toBeNull()
    })

    it('handles attendance upsert', async () => {
      vi.mocked(api.upsertAttendance).mockResolvedValue({})
      const result = await processOperation({
        entity: 'attendance', operation: 'update', entityId: 'AT-001',
        payload: JSON.stringify({ studentId: 'ST-001', date: '2025-01-01' }),
      })
      expect(result.ok).toBe(true)
      expect(api.upsertAttendance).toHaveBeenCalledWith({ studentId: 'ST-001', date: '2025-01-01' })
    })

    it('returns error for unknown entity type', async () => {
      const result = await processOperation({
        entity: 'unknown', operation: 'create', entityId: 'X-001',
        payload: '{}',
      })
      expect(result.ok).toBe(false)
      expect(result.recoverable).toBe(false)
    })

    it('handles network error as recoverable', async () => {
      vi.mocked(api.createStudent).mockRejectedValue(new TypeError('Failed to fetch'))
      const result = await processOperation({
        entity: 'student', operation: 'create', entityId: 'ST-001',
        payload: JSON.stringify({ fullName: 'Test' }), retryCount: 0,
      })
      expect(result.ok).toBe(false)
      expect(result.recoverable).toBe(true)
      expect(result.error).toContain('Network')
    })

    it('handles 401 as non-recoverable auth error', async () => {
      vi.mocked(api.createStudent).mockRejectedValue(new ApiError(401, 'Unauthorized', '/students'))
      const result = await processOperation({
        entity: 'student', operation: 'create', entityId: 'ST-001',
        payload: JSON.stringify({ fullName: 'Test' }), retryCount: 0,
      })
      expect(result.ok).toBe(false)
      expect(result.recoverable).toBe(false)
      expect(result.isAuthError).toBe(true)
    })

    it('handles 409 conflict as resolved', async () => {
      const conflictErr = new ApiError(409, 'Version conflict', '/grades')
      ;(conflictErr as any).details = { serverVersion: 2 }
      vi.mocked(api.upsertGrade).mockRejectedValue(conflictErr)
      const result = await processOperation({
        entity: 'grade', operation: 'update', entityId: 'GR-1',
        payload: JSON.stringify({ studentId: 'ST-001' }), retryCount: 0,
      })
      expect(result.ok).toBe(true)
      expect(result.isConflict).toBe(true)
    })

    it('SYNC-CONFLICT-1: exam 409 state conflict (không có bản ghi server) → ok=false permanent-fail', async () => {
      // Trước đây exam complete/reopen 409 bị nuốt op (server-wins thầm lặng) —
      // giờ phải giữ op ở trạng thái failed với error rõ ràng.
      const stateErr = new ApiError(409, 'Phiên đã hoàn tất — mở lại trước khi sửa answer key', '/exams')
      vi.mocked(api.completeExam).mockRejectedValue(stateErr)
      const result = await processOperation({
        entity: 'exam', operation: 'update', entityId: 'EX-1',
        payload: JSON.stringify({ action: 'complete', sessionId: 'EX-1' }), retryCount: 0,
      })
      expect(result.ok).toBe(false)
      expect(result.recoverable).toBe(false)
      expect(result.error).toContain('Xung đột dữ liệu máy chủ')
    })

    it('recovers an idempotency payload mismatch only when CREATE was possibly sent', async () => {
      const mismatch = new ApiError(409, 'Create payload mismatch', '/students')
      ;(mismatch as any).code = 'IDEMPOTENCY_CONFLICT'
      ;(mismatch as any).details = { existing: { id: 'ST-SERVER-1' } }
      vi.mocked(api.createStudent).mockRejectedValue(mismatch)

      const result = await processOperation({
        entity: 'student', operation: 'create', entityId: 'ST-TEMP-1',
        payload: JSON.stringify({ fullName: 'Edited' }), retryCount: 1,
      })

      expect(result).toMatchObject({
        ok: true,
        preserveFoldedUpdate: true,
        data: { id: 'ST-SERVER-1' },
      })
    })

    it('fails closed on a fresh CREATE idempotency payload mismatch', async () => {
      const mismatch = new ApiError(409, 'Create payload mismatch', '/students')
      ;(mismatch as any).code = 'IDEMPOTENCY_CONFLICT'
      ;(mismatch as any).details = { existing: { id: 'ST-SERVER-1' } }
      vi.mocked(api.createStudent).mockRejectedValue(mismatch)

      const result = await processOperation({
        entity: 'student', operation: 'create', entityId: 'ST-TEMP-1',
        payload: JSON.stringify({ fullName: 'Unexpected collision' }), retryCount: 0,
      })

      expect(result).toMatchObject({ ok: false, recoverable: false })
      expect(result.preserveFoldedUpdate).toBeUndefined()
    })

    it('marks a legacy folded exam lifecycle command for preservation after CREATE', async () => {
      vi.mocked(api.createExam).mockResolvedValue({ id: 'EX-SERVER-1' })
      const result = await processOperation({
        entity: 'exam', operation: 'create', entityId: 'EX-TEMP-1',
        payload: JSON.stringify({
          classId: 'CLASS-1', subject: 'Giáo lý', scoreType: '15m', semester: 1,
          action: 'complete', sessionId: 'EX-TEMP-1',
        }),
        retryCount: 1,
      })
      expect(result).toMatchObject({ ok: true, preserveFoldedUpdate: true, data: { id: 'EX-SERVER-1' } })
    })

    it('SYNC-CONFLICT-1: grade 409 KHÔNG kèm bản ghi server → permanent-fail (không merge mù)', async () => {
      const noRecordErr = new ApiError(409, 'Version conflict', '/grades')
      vi.mocked(api.upsertGrade).mockRejectedValue(noRecordErr)
      const result = await processOperation({
        entity: 'grade', operation: 'update', entityId: 'GR-2',
        payload: JSON.stringify({ studentId: 'ST-002' }), retryCount: 0,
      })
      expect(result.ok).toBe(false)
      expect((result as any).isConflict).toBeUndefined()
    })

    it('handles 429 rate limit as recoverable', async () => {
      vi.mocked(api.upsertGrade).mockRejectedValue(new ApiError(429, 'Too many requests', '/grades'))
      const result = await processOperation({
        entity: 'grade', operation: 'update', entityId: 'GR-1',
        payload: JSON.stringify({ studentId: 'ST-001' }), retryCount: 0,
      })
      expect(result.ok).toBe(false)
      expect(result.recoverable).toBe(true)
    })

    it('handles 4xx as non-recoverable client error', async () => {
      vi.mocked(api.upsertGrade).mockRejectedValue(new ApiError(400, 'Bad request', '/grades'))
      const result = await processOperation({
        entity: 'grade', operation: 'update', entityId: 'GR-1',
        payload: JSON.stringify({ studentId: 'ST-001' }), retryCount: 0,
      })
      expect(result.ok).toBe(false)
      expect(result.recoverable).toBe(false)
    })

    it('handles 500 as recoverable within max retries', async () => {
      vi.mocked(api.upsertGrade).mockRejectedValue(new ApiError(500, 'Server error', '/grades'))
      const result = await processOperation({
        entity: 'grade', operation: 'update', entityId: 'GR-1',
        payload: JSON.stringify({ studentId: 'ST-001' }), retryCount: 0,
      })
      expect(result.ok).toBe(false)
      expect(result.recoverable).toBe(true)
    })

    it('exhausts retries for 500 after MAX_RETRIES', async () => {
      vi.mocked(api.upsertGrade).mockRejectedValue(new ApiError(500, 'Server error', '/grades'))
      const result = await processOperation({
        entity: 'grade', operation: 'update', entityId: 'GR-1',
        payload: JSON.stringify({ studentId: 'ST-001' }), retryCount: 3,
      })
      expect(result.ok).toBe(false)
      expect(result.recoverable).toBe(false)
    })

    it('handles notice CREATE', async () => {
      vi.mocked(api.createNotice).mockResolvedValue({ id: 'NO-1' })
      const result = await processOperation({
        entity: 'notice', operation: 'create', entityId: 'NO-1',
        payload: JSON.stringify({ title: 'Test Notice', content: 'Test' }),
      })
      expect(result.ok).toBe(true)
      expect(result.data?.id).toBe('NO-1')
      expect(api.createNotice).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test Notice', content: 'Test' }))
    })

    it('handles notice DELETE', async () => {
      vi.mocked(api.deleteNotice).mockResolvedValue({ success: true })
      const result = await processOperation({
        entity: 'notice', operation: 'delete', entityId: 'NO-1',
        payload: '{}',
      })
      expect(result.ok).toBe(true)
      expect(api.deleteNotice).toHaveBeenCalledWith('NO-1')
    })

    it('handles notice UPDATE', async () => {
      vi.mocked(api.updateNotice).mockResolvedValue({ id: 'NO-1', title: 'Updated Notice' })
      const result = await processOperation({
        entity: 'notice', operation: 'update', entityId: 'NO-1',
        payload: JSON.stringify({ title: 'Updated Notice' }),
      })
      expect(result.ok).toBe(true)
      expect(api.updateNotice).toHaveBeenCalledWith('NO-1', { title: 'Updated Notice' })
    })

    it('handles class CREATE', async () => {
      vi.mocked(api.createClass).mockResolvedValue({ id: 'CL-1' })
      const result = await processOperation({
        entity: 'class', operation: 'create', entityId: 'CL-1',
        payload: JSON.stringify({ name: 'Class A', grade: 6 }),
      })
      expect(result.ok).toBe(true)
      expect(result.data?.id).toBe('CL-1')
      expect(api.createClass).toHaveBeenCalledWith(expect.objectContaining({ name: 'Class A', grade: 6 }))
    })

    it('handles class UPDATE', async () => {
      vi.mocked(api.updateClass).mockResolvedValue({ id: 'CL-1', name: 'Updated' })
      const result = await processOperation({
        entity: 'class', operation: 'update', entityId: 'CL-1',
        payload: JSON.stringify({ name: 'Updated' }),
      })
      expect(result.ok).toBe(true)
      expect(api.updateClass).toHaveBeenCalledWith('CL-1', { name: 'Updated' })
    })

    it('handles class DELETE', async () => {
      vi.mocked(api.deleteClass).mockResolvedValue({ success: true })
      const result = await processOperation({
        entity: 'class', operation: 'delete', entityId: 'CL-1',
        payload: '{}',
      })
      expect(result.ok).toBe(true)
      expect(api.deleteClass).toHaveBeenCalledWith('CL-1')
    })

    it('handles notices (plural) entity alias', async () => {
      vi.mocked(api.deleteNotice).mockResolvedValue({ success: true })
      const result = await processOperation({
        entity: 'notices', operation: 'delete', entityId: 'NO-1',
        payload: '{}',
      })
      expect(result.ok).toBe(true)
      expect(api.deleteNotice).toHaveBeenCalledWith('NO-1')
    })

    it('handles classes (plural) entity alias', async () => {
      vi.mocked(api.createClass).mockResolvedValue({ id: 'CL-2' })
      const result = await processOperation({
        entity: 'classes', operation: 'create', entityId: 'CL-2',
        payload: JSON.stringify({ name: 'Class B' }),
      })
      expect(result.ok).toBe(true)
      expect(api.createClass).toHaveBeenCalledWith(expect.objectContaining({ name: 'Class B' }))
    })

    // ─── Phase 3: exam entity (offline sync) ───

    it('handles exam CREATE with idempotencyKey = temp id', async () => {
      vi.mocked(api.createExam).mockResolvedValue({ id: 'EXS-SERVER-1', status: 'draft' })
      const result = await processOperation({
        entity: 'exam', operation: 'create', entityId: 'EXS-tmp-001',
        payload: JSON.stringify({ classId: 'CL-1', subject: 'Giáo Lý', scoreType: '15m', semester: 1 }),
      })
      expect(result.ok).toBe(true)
      expect(result.data?.id).toBe('EXS-SERVER-1')
      expect(api.createExam).toHaveBeenCalledWith({
        classId: 'CL-1', subject: 'Giáo Lý', scoreType: '15m', semester: 1,
        idempotencyKey: 'EXS-tmp-001',
      })
    })

    it('handles exam UPDATE save_results', async () => {
      vi.mocked(api.saveExamResults).mockResolvedValue({ saved: 1, upserted: 0, total: 1 })
      const result = await processOperation({
        entity: 'exam', operation: 'update', entityId: 'EXS-SERVER-1',
        payload: JSON.stringify({
          action: 'save_results', sessionId: 'EXS-SERVER-1',
          scores: [{ studentId: 'ST-001', score: 8, source: 'qr_scan' }],
        }),
      })
      expect(result.ok).toBe(true)
      expect(api.saveExamResults).toHaveBeenCalledWith('EXS-SERVER-1', [{ studentId: 'ST-001', score: 8, source: 'qr_scan' }])
    })

    it('EXAM-CONTINUOUS-P0: handles per-student exam_result save mutation', async () => {
      vi.mocked(api.saveExamResults).mockResolvedValue({
        saved: 1,
        upserted: 0,
        total: 1,
        items: [{ clientMutationId: 'MUT-1', studentId: 'ST-001', status: 'created', serverScore: 8 }],
      } as any)
      const result = await processOperation({
        entity: 'exam_result', operation: 'update', entityId: 'EXS-SERVER-1::result::ST-001',
        payload: JSON.stringify({
          action: 'save_result',
          sessionId: 'EXS-SERVER-1',
          score: { studentId: 'ST-001', score: 8, source: 'qr_scan', clientMutationId: 'MUT-1' },
        }),
      } as any)

      expect(result.ok).toBe(true)
      expect(api.saveExamResults).toHaveBeenCalledWith('EXS-SERVER-1', [
        expect.objectContaining({ studentId: 'ST-001', clientMutationId: 'MUT-1' }),
      ])
    })

    it('handles exam UPDATE remove_result', async () => {
      vi.mocked(api.removeExamResult).mockResolvedValue({ deleted: true, studentId: 'ST-001', resultId: 'EXR-001' })
      const deletion = { expectedResultId: 'EXR-001', expectedResultVersion: 1, clientMutationId: 'MUT-DELETE-001' }
      const result = await processOperation({
        entity: 'exam', operation: 'update', entityId: 'EXS-SERVER-1',
        payload: JSON.stringify({ action: 'remove_result', sessionId: 'EXS-SERVER-1', studentId: 'ST-001', deletion }),
      })
      expect(result.ok).toBe(true)
      expect(api.removeExamResult).toHaveBeenCalledWith('EXS-SERVER-1', 'ST-001', deletion)
    })

    it('handles exam UPDATE complete + reopen', async () => {
      vi.mocked(api.completeExam).mockResolvedValue({ id: 'EXS-SERVER-1', status: 'completed' })
      const complete = await processOperation({
        entity: 'exam', operation: 'update', entityId: 'EXS-SERVER-1',
        payload: JSON.stringify({ action: 'complete', sessionId: 'EXS-SERVER-1' }),
      })
      expect(complete.ok).toBe(true)
      expect(complete.data?.status).toBe('completed')

      vi.mocked(api.reopenExam).mockResolvedValue({ id: 'EXS-SERVER-1', status: 'draft' })
      const reopen = await processOperation({
        entity: 'exam', operation: 'update', entityId: 'EXS-SERVER-1',
        payload: JSON.stringify({ action: 'reopen', sessionId: 'EXS-SERVER-1' }),
      })
      expect(reopen.ok).toBe(true)
      expect(reopen.data?.status).toBe('draft')
    })

    it('handles exams (plural) entity alias', async () => {
      vi.mocked(api.createExam).mockResolvedValue({ id: 'EXS-SERVER-2' })
      const result = await processOperation({
        entity: 'exams', operation: 'create', entityId: 'EXS-tmp-002',
        payload: JSON.stringify({ classId: 'CL-1', subject: 'Kiểm tra', scoreType: 'oral', semester: 1 }),
      })
      expect(result.ok).toBe(true)
      expect(api.createExam).toHaveBeenCalledWith({
        classId: 'CL-1', subject: 'Kiểm tra', scoreType: 'oral', semester: 1,
        idempotencyKey: 'EXS-tmp-002',
      })
    })

    it('handles exam DELETE (xóa phiên draft offline)', async () => {
      vi.mocked(api.deleteExam).mockResolvedValue({ deleted: true, sessionId: 'EXS-SERVER-1', resultsDeleted: 3 })
      const result = await processOperation({
        entity: 'exam', operation: 'delete', entityId: 'EXS-SERVER-1',
        payload: JSON.stringify({ action: 'delete_session', sessionId: 'EXS-SERVER-1' }),
      })
      expect(result.ok).toBe(true)
      expect(api.deleteExam).toHaveBeenCalledWith('EXS-SERVER-1')
    })
  })

  describe('Tier 2 — daily_entry', () => {
    it('CREATE đẩy 1 entry qua batch + reconcile receipt', async () => {
      vi.mocked(api.saveDailyEntries).mockResolvedValue({
        saved: 1, duplicates: 0, errorCount: 0, total: 1,
        items: [{ id: 'DG-1', studentId: 'ST-001', scoreType: 'oral', status: 'created', serverScore: 8 }],
      })
      const result = await processOperation({
        entity: 'daily_entry', operation: 'CREATE', entityId: 'DG-1',
        payload: JSON.stringify({ id: 'DG-1', studentId: 'ST-001', academicYear: '2025-2026', semester: 1, scoreType: 'oral', value: 8, date: '2026-01-15' }),
      })
      expect(result.ok).toBe(true)
      expect(api.saveDailyEntries).toHaveBeenCalledWith([{
        id: 'DG-1', studentId: 'ST-001', academicYear: '2025-2026', semester: 1, scoreType: 'oral', value: 8, date: '2026-01-15',
      }])
    })

    it('item error trong response 200 → permanent-fail (không nuốt)', async () => {
      vi.mocked(api.saveDailyEntries).mockResolvedValue({
        saved: 0, duplicates: 0, errorCount: 1, total: 1,
        items: [{ id: 'DG-2', studentId: 'ST-001', scoreType: 'oral', status: 'error', serverScore: null, reason: 'Học kỳ 1 đã bị khóa sổ điểm.' }],
      })
      const result = await processOperation({
        entity: 'daily_entry', operation: 'CREATE', entityId: 'DG-2',
        payload: JSON.stringify({ id: 'DG-2', studentId: 'ST-001', academicYear: '2025-2026', semester: 1, scoreType: 'oral', value: 8 }),
      })
      expect(result.ok).toBe(false)
      expect(result.recoverable).toBe(false)
      expect(result.error).toMatch(/khóa sổ/)
    })

    it('DELETE gọi api.deleteDailyEntry', async () => {
      vi.mocked(api.deleteDailyEntry).mockResolvedValue({ deleted: true, id: 'DG-3' })
      const result = await processOperation({
        entity: 'daily_entry', operation: 'DELETE', entityId: 'DG-3',
        payload: JSON.stringify({ id: 'DG-3' }),
      })
      expect(result.ok).toBe(true)
      expect(api.deleteDailyEntry).toHaveBeenCalledWith('DG-3')
    })
  })
})
