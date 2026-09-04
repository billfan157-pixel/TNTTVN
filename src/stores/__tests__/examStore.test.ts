import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { api } from '../../lib/api'
import { useExamStore, SCORE_FIELD_MAP } from '../../stores/examStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import * as syncService from '../../lib/syncService'
import type { ExamSession, ExamResult } from '../../types'

vi.mock('../../lib/syncTrigger', () => ({
  requestSync: vi.fn(),
}))

function setOffline(offline: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: !offline })
}

function mkSession(overrides: Partial<ExamSession> = {}): ExamSession {
  return {
    id: 'EXS-test-1',
    parishId: 'gia-ton',
    classId: 'CL-1',
    subject: 'Kiểm tra chương 3',
    scoreType: '15m',
    maxScore: 10,
    semester: 1,
    academicYear: '2026-2027',
    status: 'draft',
    createdBy: 'usr-1',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function mkResult(studentId: string, score: number, overrides: Partial<ExamResult> = {}): ExamResult {
  return {
    id: `EXR-${studentId}`,
    examSessionId: 'EXS-test-1',
    studentId,
    score,
    source: 'qr_scan',
    createdAt: new Date().toISOString(),
    studentCode: `HS-${studentId}`,
    studentName: `Học Sinh ${studentId}`,
    ...overrides,
  }
}

function setGradeSource(studentId: string, semester: 1 | 2, field: string, source: string | null, value: number | null) {
  useGradeStore.getState().upsertGrade({
    studentId,
    semester,
    academicYear: '2026-2027',
    [field]: value,
    [`${field}_source`]: source,
  } as any, true)
}

beforeEach(() => {
  localStorage.setItem('parish_current_user', JSON.stringify({ id: 'usr-1', parishId: 'gia-ton' }))
  useExamStore.setState({
    sessions: [],
    selectedSessionId: null,
    results: [],
    loading: false,
    saving: false,
    finalizing: false,
    error: null,
    lastFinalize: null,
    queuedResultMutations: {},
  })
  useGradeStore.setState({ grades: [] })
  useDailyGradeStore.setState({ entries: [] })
  setOffline(false)
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('examStore — finalize flow (conflict matrix §6)', () => {
  // P0-01 (Phase 0 containment): server là SOLE WRITER sau complete.
  // Client project server receipt, KHÔNG ghi grade/daily lần hai, KHÔNG enqueue
  // grade mutation nào. Các test dưới khóa hành vi đó.
  function mockCompleteReceipt(items: Array<{ studentId: string; status: 'committed' | 'conflict'; existingSource?: string | null; rawScore: number }>, scoreType = '15m') {
    const session = mkSession({ scoreType: scoreType as '15m', status: 'completed' })
    return {
      session,
      finalizationId: 'EXF-test-1',
      items: items.map((item) => ({
        studentId: item.studentId,
        examResultId: `EXR-${item.studentId}`,
        gradeId: null,
        scoreField: 'score15m',
        status: item.status,
        existingSource: item.existingSource ?? null,
        rawScore: item.rawScore,
        finalScore: item.status === 'committed' ? item.rawScore : null,
      })),
      committed: items.filter(i => i.status === 'committed').length,
      conflicts: items.filter(i => i.status === 'conflict').length,
      legacy: false,
    }
  }

  it('P0-01: online complete KHÔNG ghi grade/daily thứ hai — lastFinalize từ server receipt', async () => {
    vi.spyOn(api, 'completeExam').mockResolvedValue(mockCompleteReceipt([
      { studentId: 'ST-1', status: 'conflict', existingSource: 'manual', rawScore: 8 },
      { studentId: 'ST-2', status: 'committed', rawScore: 9 },
    ]))
    const gradeSyncSpy = vi.spyOn(syncService, 'syncUpsertGrade')
    const batchSyncSpy = vi.spyOn(syncService, 'syncBatchUpsertGrades')

    setGradeSource('ST-1', 1, 'score15m', 'manual', 6)
    setGradeSource('ST-2', 1, 'score15m', 'daily_avg', 7)

    useExamStore.setState({
      sessions: [mkSession()],
      selectedSessionId: 'EXS-test-1',
      results: [mkResult('ST-1', 8), mkResult('ST-2', 9)],
    })

    const result = await useExamStore.getState().completeAndFinalize()

    expect(result).not.toBeNull()
    expect(result!.conflicts).toHaveLength(1)
    expect(result!.conflicts[0].studentId).toBe('ST-1')
    expect(result!.conflicts[0].existingSource).toBe('manual')
    expect(result!.conflicts[0].existingScore).toBe(6)
    expect(result!.conflicts[0].scannedScore).toBe(8)
    expect(result!.dailyCount).toBe(1)
    expect(result!.directCount).toBe(0)
    expect(result!.skipped).toBe(1)

    // Single-owner: không daily entry mới, không grade mới/sửa, không enqueue sync.
    expect(useDailyGradeStore.getState().entries).toHaveLength(0)
    const g1 = useGradeStore.getState().getStudentGrade('ST-1', 1)
    expect(g1?.score15m).toBe(6)
    expect(g1?.score15m_source).toBe('manual')
    const g2 = useGradeStore.getState().getStudentGrade('ST-2', 1)
    expect(g2?.score15m).toBe(7)
    expect(g2?.score15m_source).toBe('daily_avg')
    expect(gradeSyncSpy).not.toHaveBeenCalled()
    expect(batchSyncSpy).not.toHaveBeenCalled()
    expect(useExamStore.getState().sessions[0].status).toBe('completed')
  })

  it('P0-01: midterm committed — không ghi trực tiếp exam_scan lần hai', async () => {
    vi.spyOn(api, 'completeExam').mockResolvedValue(mockCompleteReceipt(
      [{ studentId: 'ST-1', status: 'committed', rawScore: 7.5 }], 'midterm',
    ))
    const gradeSyncSpy = vi.spyOn(syncService, 'syncUpsertGrade')

    useExamStore.setState({
      sessions: [mkSession({ scoreType: 'midterm' })],
      selectedSessionId: 'EXS-test-1',
      results: [mkResult('ST-1', 7.5)],
    })

    const result = await useExamStore.getState().completeAndFinalize()

    expect(result!.conflicts).toHaveLength(0)
    expect(result!.directCount).toBe(1)
    expect(result!.dailyCount).toBe(0)
    // Không grade local nào được tạo — grades authoritative về qua pull.
    expect(useGradeStore.getState().grades).toHaveLength(0)
    expect(useDailyGradeStore.getState().entries).toHaveLength(0)
    expect(gradeSyncSpy).not.toHaveBeenCalled()
  })

  it('P0-01: excel_import conflict từ server receipt được project đúng', async () => {
    vi.spyOn(api, 'completeExam').mockResolvedValue(mockCompleteReceipt([
      { studentId: 'ST-1', status: 'conflict', existingSource: 'excel_import', rawScore: 8 },
    ]))
    setGradeSource('ST-1', 1, 'score15m', 'excel_import', 5)

    useExamStore.setState({
      sessions: [mkSession()],
      selectedSessionId: 'EXS-test-1',
      results: [mkResult('ST-1', 8)],
    })

    const result = await useExamStore.getState().completeAndFinalize()
    expect(result!.conflicts).toHaveLength(1)
    expect(result!.conflicts[0].existingSource).toBe('excel_import')
    expect(result!.skipped).toBe(1)
    expect(useDailyGradeStore.getState().entries).toHaveLength(0)
  })

  it('complete server lỗi → không ghi gì, error set', async () => {
    vi.spyOn(api, 'completeExam').mockRejectedValue(new Error('Học kỳ đã bị khóa'))

    useExamStore.setState({
      sessions: [mkSession()],
      selectedSessionId: 'EXS-test-1',
      results: [mkResult('ST-1', 8)],
    })

    const result = await useExamStore.getState().completeAndFinalize()
    expect(result).toBeNull()
    expect(useExamStore.getState().error).toContain('khóa')
    expect(useDailyGradeStore.getState().entries).toHaveLength(0)
  })
})

describe('examStore — saveScores & session management', () => {
  it('saveScores gọi api và refresh kết quả', async () => {
    const saveSpy = vi.spyOn(api, 'saveExamResults').mockResolvedValue({ saved: 1, upserted: 0, total: 1 })
    const refreshSpy = vi.spyOn(api, 'getExamResults').mockResolvedValue({ session: mkSession(), results: [mkResult('ST-1', 8)] })

    useExamStore.setState({ selectedSessionId: 'EXS-test-1' })
    const res = await useExamStore.getState().saveScores([{ studentId: 'ST-1', score: 8, source: 'quick_entry' }])

    expect(saveSpy).toHaveBeenCalledWith('EXS-test-1', [{ studentId: 'ST-1', score: 8, source: 'quick_entry' }])
    expect(refreshSpy).toHaveBeenCalled()
    expect(res).toEqual({ saved: 1, upserted: 0, total: 1 })
    expect(useExamStore.getState().results).toHaveLength(1)
  })

  it('EXAM-CONTINUOUS-P1: queueScores ghi durable queue và cập nhật local mà không chờ API', async () => {
    const apiSpy = vi.spyOn(api, 'saveExamResults')
    vi.spyOn(syncService, 'syncSaveExamResults').mockResolvedValue([
      { queueOpId: 'OP-CONT-1', clientMutationId: 'MUT-CONT-1', studentId: 'ST-1' },
    ])
    useExamStore.setState({ selectedSessionId: 'EXS-test-1' })

    const result = await useExamStore.getState().queueScores([{
      studentId: 'ST-1', score: 8, source: 'qr_scan', attemptFingerprint: 'FP-1',
    }])

    expect(apiSpy).not.toHaveBeenCalled()
    expect(result?.queuedMutations[0]).toMatchObject({
      queueOpId: 'OP-CONT-1', clientMutationId: 'MUT-CONT-1', status: 'pending',
    })
    expect(useExamStore.getState().results[0]).toMatchObject({ studentId: 'ST-1', score: 8 })
    expect(useExamStore.getState().queuedResultMutations['MUT-CONT-1'].status).toBe('pending')
  })

  it('EXAM-CONTINUOUS-P1: acknowledgement cập nhật trạng thái và điểm server-authoritative', () => {
    useExamStore.setState({
      results: [mkResult('ST-1', 8)],
      queuedResultMutations: {
        'MUT-CONT-1': {
          queueOpId: 'OP-CONT-1', clientMutationId: 'MUT-CONT-1', sessionId: 'EXS-test-1',
          studentId: 'ST-1', proposedScore: 8, status: 'pending',
          createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z',
        },
      },
    })

    useExamStore.getState().markResultMutation('MUT-CONT-1', 'synced', { serverScore: 7.5 })

    expect(useExamStore.getState().queuedResultMutations['MUT-CONT-1']).toMatchObject({ status: 'synced', serverScore: 7.5 })
    expect(useExamStore.getState().results[0].score).toBe(7.5)
  })

  it('EXAM-CONTINUOUS-P1: complete online vẫn xếp sau durable result đang pending', async () => {
    const apiSpy = vi.spyOn(api, 'completeExam')
    const queueCompleteSpy = vi.spyOn(syncService, 'syncCompleteExam').mockResolvedValue('OP-COMPLETE')
    const gradeSyncSpy = vi.spyOn(syncService, 'syncUpsertGrade')
    useExamStore.setState({
      sessions: [mkSession()],
      selectedSessionId: 'EXS-test-1',
      results: [mkResult('ST-1', 8)],
      queuedResultMutations: {
        'MUT-CONT-1': {
          queueOpId: 'OP-CONT-1', clientMutationId: 'MUT-CONT-1', sessionId: 'EXS-test-1',
          studentId: 'ST-1', proposedScore: 8, status: 'pending',
          createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z',
        },
      },
    })

    const result = await useExamStore.getState().completeAndFinalize()

    expect(result).not.toBeNull()
    expect(apiSpy).not.toHaveBeenCalled()
    expect(queueCompleteSpy).toHaveBeenCalledWith('EXS-test-1')
    expect(useExamStore.getState().sessions[0].status).toBe('completed')
    // P0-01: queued-barrier path cũng không ghi grade local thứ hai.
    expect(useDailyGradeStore.getState().entries).toHaveLength(0)
    expect(useGradeStore.getState().grades).toHaveLength(0)
    expect(gradeSyncSpy).not.toHaveBeenCalled()
  })

  it('createSession thêm session vào đầu danh sách', async () => {
    const created = mkSession({ id: 'EXS-new' })
    vi.spyOn(api, 'createExam').mockResolvedValue(created)

    const session = await useExamStore.getState().createSession({
      classId: 'CL-1', subject: '15 phút', scoreType: '15m', semester: 1, academicYear: '2026-2027',
    })

    expect(session?.id).toBe('EXS-new')
    expect(useExamStore.getState().sessions[0].id).toBe('EXS-new')
  })

  it('EXAM-GAPS: createSession không truyền academicYear → dùng active year của giáo xứ (không theo ngày hiện tại)', async () => {
    vi.spyOn(api, 'createExam').mockResolvedValue(mkSession({ id: 'EXS-ay' }))
    useAcademicYearStore.setState({ currentYear: '2025-2026' })

    await useExamStore.getState().createSession({
      classId: 'CL-1', subject: 'AY test', scoreType: '15m', semester: 1,
    })

    const payload = vi.mocked(api.createExam).mock.calls[0][0] as Record<string, unknown>
    expect(payload.academicYear).toBe('2025-2026')
  })

  it('removeResult gọi API xóa đúng studentId và refresh', async () => {
    const removeSpy = vi.spyOn(api, 'removeExamResult').mockResolvedValue({ deleted: true })
    const refreshSpy = vi.spyOn(api, 'getExamResults').mockResolvedValue({ session: mkSession(), results: [mkResult('ST-2', 9)] })

    useExamStore.setState({ selectedSessionId: 'EXS-test-1' })
    const ok = await useExamStore.getState().removeResult('ST-1')

    expect(removeSpy).toHaveBeenCalledWith('EXS-test-1', 'ST-1')
    expect(refreshSpy).toHaveBeenCalled()
    expect(ok).toBe(true)
    expect(useExamStore.getState().results.map(r => r.studentId)).toEqual(['ST-2'])
  })

  it('removeResult lỗi → error set, trả false', async () => {
    vi.spyOn(api, 'removeExamResult').mockRejectedValue(new Error('Lỗi xóa'))

    useExamStore.setState({ selectedSessionId: 'EXS-test-1' })
    const ok = await useExamStore.getState().removeResult('ST-1')

    expect(ok).toBe(false)
    expect(useExamStore.getState().error).toContain('Lỗi xóa')
  })

  it('SCORE_FIELD_MAP khớp đúng 5 loại điểm', () => {
    expect(SCORE_FIELD_MAP.oral).toMatchObject({ field: 'scoreOral', sourceField: 'scoreOral_source' })
    expect(SCORE_FIELD_MAP['15m'].field).toBe('score15m')
    expect(SCORE_FIELD_MAP['1period'].field).toBe('score1Period')
    expect(SCORE_FIELD_MAP.midterm.field).toBe('scoreMidterm')
    expect(SCORE_FIELD_MAP.final.field).toBe('scoreFinal')
  })
})

describe('examStore — Phase 3 offline path (ADR-023)', () => {
  it('saveScores offline: enqueue save_results + cập nhật local, KHÔNG gọi api', async () => {
    setOffline(true)
    const apiSpy = vi.spyOn(api, 'saveExamResults')
    const syncSpy = vi.spyOn(syncService, 'syncSaveExamResults')

    useExamStore.setState({ selectedSessionId: 'EXS-test-1' })
    const res = await useExamStore.getState().saveScores([{ studentId: 'ST-1', score: 8, source: 'qr_scan' }])

    expect(apiSpy).not.toHaveBeenCalled()
    expect(syncSpy).toHaveBeenCalledWith('EXS-test-1', [{ studentId: 'ST-1', score: 8, source: 'qr_scan' }])
    expect(res).toEqual({ saved: 1, upserted: 0 })
    // Local cache được cập nhật ngay
    expect(useExamStore.getState().results).toHaveLength(1)
    expect(useExamStore.getState().results[0].score).toBe(8)
  })

  it('saveScores offline với answers: local cache lưu answers đã parse', async () => {
    setOffline(true)
    vi.spyOn(syncService, 'syncSaveExamResults')

    useExamStore.setState({ selectedSessionId: 'EXS-test-1' })
    await useExamStore.getState().saveScores([{ studentId: 'ST-1', score: 8, source: 'qr_scan', answers: '{"1":"A","2":null}' }])

    const r = useExamStore.getState().results[0]
    expect(r.answers).toEqual({ 1: 'A', 2: null })
  })

  it('createSession offline: temp ID + enqueue CREATE + không gọi api', async () => {
    setOffline(true)
    const apiSpy = vi.spyOn(api, 'createExam')
    const syncSpy = vi.spyOn(syncService, 'syncCreateExam')

    const session = await useExamStore.getState().createSession({
      classId: 'CL-1', subject: 'Kiểm tra', scoreType: '15m', semester: 1,
    })

    expect(apiSpy).not.toHaveBeenCalled()
    expect(syncSpy).toHaveBeenCalledTimes(1)
    expect(session?.id).toMatch(/^EXS-tmp-/)
    expect(useExamStore.getState().sessions[0].id).toBe(session?.id)
  })

  it('removeResult offline: enqueue remove_result + xóa khỏi local', async () => {
    setOffline(true)
    const apiSpy = vi.spyOn(api, 'removeExamResult')
    const syncSpy = vi.spyOn(syncService, 'syncRemoveExamResult')

    useExamStore.setState({
      selectedSessionId: 'EXS-test-1',
      results: [mkResult('ST-1', 8), mkResult('ST-2', 9)],
    })
    const ok = await useExamStore.getState().removeResult('ST-1')

    expect(apiSpy).not.toHaveBeenCalled()
    expect(syncSpy).toHaveBeenCalledWith('EXS-test-1', 'ST-1')
    expect(ok).toBe(true)
    expect(useExamStore.getState().results.map(r => r.studentId)).toEqual(['ST-2'])
  })

  it('P0-01: completeAndFinalize offline — enqueue complete + preview hiển thị, KHÔNG ghi local', async () => {
    setOffline(true)
    const apiSpy = vi.spyOn(api, 'completeExam')
    const syncSpy = vi.spyOn(syncService, 'syncCompleteExam')
    const gradeSyncSpy = vi.spyOn(syncService, 'syncUpsertGrade')

    useExamStore.setState({
      sessions: [mkSession()],
      selectedSessionId: 'EXS-test-1',
      results: [mkResult('ST-1', 8)],
    })

    const result = await useExamStore.getState().completeAndFinalize()

    expect(apiSpy).not.toHaveBeenCalled()
    expect(syncSpy).toHaveBeenCalledWith('EXS-test-1')
    // Preview hiển thị cho UX, nhưng không có side-effect ghi điểm nào —
    // grades authoritative sẽ về qua pull delta sau khi queued complete sync xong.
    expect(result!.dailyCount).toBe(1)
    expect(useExamStore.getState().sessions[0].status).toBe('completed')
    expect(useDailyGradeStore.getState().entries).toHaveLength(0)
    expect(useGradeStore.getState().getStudentGrade('ST-1', 1)).toBeUndefined()
    expect(gradeSyncSpy).not.toHaveBeenCalled()
  })

  it('FE-F1: revertLocalComplete đưa phiên optimistic completed về draft, không đụng phiên khác', () => {
    useExamStore.setState({
      sessions: [
        mkSession({ id: 'EXS-opt', status: 'completed', completedBy: 'usr-1', completedAt: '2026-08-21T00:00:00Z' }),
        mkSession({ id: 'EXS-other', status: 'completed', completedBy: 'usr-2', completedAt: '2026-08-20T00:00:00Z' }),
        mkSession({ id: 'EXS-draft' }),
      ],
    })

    useExamStore.getState().revertLocalComplete('EXS-opt')

    const sessions = useExamStore.getState().sessions
    const reverted = sessions.find(s => s.id === 'EXS-opt')!
    expect(reverted.status).toBe('draft')
    expect(reverted.completedBy).toBeNull()
    expect(reverted.completedAt).toBeNull()
    // Phiên completed khác (server-confirmed) và phiên draft giữ nguyên
    expect(sessions.find(s => s.id === 'EXS-other')!.status).toBe('completed')
    expect(sessions.find(s => s.id === 'EXS-draft')!.status).toBe('draft')
  })

  it('reopenSession offline: enqueue reopen + local status draft', async () => {
    setOffline(true)
    const syncSpy = vi.spyOn(syncService, 'syncReopenExam')

    useExamStore.setState({ sessions: [mkSession({ status: 'completed' })], selectedSessionId: 'EXS-test-1' })
    await useExamStore.getState().reopenSession()

    expect(syncSpy).toHaveBeenCalledWith('EXS-test-1')
    expect(useExamStore.getState().sessions[0].status).toBe('draft')
  })

  it('deleteSession online: gọi api.deleteExam + xóa session/results khỏi local', async () => {
    const apiSpy = vi.spyOn(api, 'deleteExam').mockResolvedValue({ deleted: true, sessionId: 'EXS-test-1', resultsDeleted: 2 } as any)
    useExamStore.setState({
      sessions: [mkSession(), mkSession({ id: 'EXS-test-2', subject: 'Khác' })],
      selectedSessionId: 'EXS-test-1',
      results: [mkResult('ST-1', 8), mkResult('ST-2', 9)],
    })

    const ok = await useExamStore.getState().deleteSession('EXS-test-1')

    expect(apiSpy).toHaveBeenCalledWith('EXS-test-1')
    expect(ok).toBe(true)
    expect(useExamStore.getState().sessions.map(s => s.id)).toEqual(['EXS-test-2'])
    expect(useExamStore.getState().results).toHaveLength(0)
    expect(useExamStore.getState().selectedSessionId).toBeNull()
  })

  it('deleteSession offline: enqueue DELETE + xóa khỏi local, KHÔNG gọi api', async () => {
    setOffline(true)
    const apiSpy = vi.spyOn(api, 'deleteExam')
    const syncSpy = vi.spyOn(syncService, 'syncDeleteExam')

    useExamStore.setState({
      sessions: [mkSession(), mkSession({ id: 'EXS-test-2', subject: 'Khác' })],
      selectedSessionId: 'EXS-test-1',
      results: [mkResult('ST-1', 8)],
    })

    const ok = await useExamStore.getState().deleteSession('EXS-test-1')

    expect(apiSpy).not.toHaveBeenCalled()
    expect(syncSpy).toHaveBeenCalledWith('EXS-test-1')
    expect(ok).toBe(true)
    expect(useExamStore.getState().sessions.map(s => s.id)).toEqual(['EXS-test-2'])
    expect(useExamStore.getState().results).toHaveLength(0)
    expect(useExamStore.getState().selectedSessionId).toBeNull()
  })

  it('deleteSession lỗi → error set, giữ nguyên local state', async () => {
    vi.spyOn(api, 'deleteExam').mockRejectedValue(new Error('Phiên đã hoàn tất'))
    useExamStore.setState({ sessions: [mkSession()], selectedSessionId: 'EXS-test-1' })

    const ok = await useExamStore.getState().deleteSession('EXS-test-1')

    expect(ok).toBe(false)
    expect(useExamStore.getState().error).toContain('Phiên đã hoàn tất')
    expect(useExamStore.getState().sessions).toHaveLength(1)
  })
})
