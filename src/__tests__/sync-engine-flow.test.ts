import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('../router', () => ({ router: {} }))
// Backoff thật (5s/15s/60s) làm test timeout — chỉ mock riêng getBackoffMs, giữ nguyên
// processOperation/isNetworkError thật (importOriginal) để hành vi engine không đổi.
vi.mock('../lib/syncProcessor', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/syncProcessor')>()
  return { ...mod, getBackoffMs: () => 0 }
})

import { initDB, getDB } from '../lib/db'
import { useSyncStore } from '../stores/syncStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { runSyncFlow } from '../lib/syncCoordinator'
import { api, ApiError } from '../lib/api'
import * as syncService from '../lib/syncService'
import { decryptQueueValue } from '../lib/offlineCipher'
import type { GradeRecord, AttendanceRecord } from '../types'

// A-NEW-32: payload queue mã hóa (AAD 'syncQueue') — parse qua decrypt (dual-format).
async function readPayload(item: { payload: any }): Promise<any> {
  const raw = await decryptQueueValue(item.payload)
  return JSON.parse(raw ?? '{}')
}

async function resetDB() {
  const db = getDB()
  await db.syncQueue.clear()
  await db.syncMeta.clear()
  await db.stores.clear()
  await useSyncStore.getState().refreshCount()
  useSyncStore.getState().setStatus('idle')
  useSyncStore.getState().setLastError(null)
  useSyncStore.getState().setLastSync('')
  localStorage.setItem('parish_access_token', 'test-token')
  localStorage.setItem('parish_current_user', JSON.stringify({ id: 'U-TEST', parishId: 'PARISH-TEST' }))
}

function mockAllApiMethods() {
  vi.spyOn(api, 'createStudent').mockResolvedValue({ id: 'mock' })
  vi.spyOn(api, 'updateStudent').mockResolvedValue({})
  vi.spyOn(api, 'deleteStudent').mockResolvedValue({ success: true })
  vi.spyOn(api, 'upsertGrade').mockResolvedValue({})
  vi.spyOn(api, 'upsertAttendance').mockResolvedValue({})
  vi.spyOn(api, 'batchUpsertGrades').mockResolvedValue({ results: [] } as any)
  vi.spyOn(api, 'batchUpsertAttendance').mockResolvedValue({ results: [] } as any)
  vi.spyOn(api, 'getStudents').mockResolvedValue({ data: [], total: 0 })
  vi.spyOn(api, 'getGrades').mockResolvedValue([])
  vi.spyOn(api, 'getAttendance').mockResolvedValue([])
  vi.spyOn(api, 'getNotices').mockResolvedValue([])
  vi.spyOn(api, 'getClasses').mockResolvedValue([])
  vi.spyOn(api, 'getClassBranches').mockResolvedValue([])
  vi.spyOn(api, 'getClassAcademicYears').mockResolvedValue([])
}

function mkGrade(overrides: Partial<GradeRecord> & { id: string; studentId: string; semester: 1 | 2 }): GradeRecord {
  return {
    academicYear: '2026 - 2027',
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

function mkAttendance(overrides: Partial<AttendanceRecord> & { id: string; studentId: string }): AttendanceRecord {
  return {
    date: '2026-08-02',
    type: 'SundayMass',
    status: 'Present',
    ...overrides,
  }
}

/** addOp là fire-and-forget (không await) — chờ op xuất hiện trong queue trước khi chạy sync. */
async function waitForQueueSize(min: number) {
  for (let i = 0; i < 100; i++) {
    const ops = await useSyncStore.getState().getPendingOps()
    if (ops.length >= min) return
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error('sync queue not populated')
}

describe('Sync Engine — runSyncFlow exit path (audit #1/#4)', () => {
  beforeEach(async () => {
    await initDB()
    await useSyncStore.getState().initDevice()
    await resetDB()
    mockAllApiMethods()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('op lỗi network (ApiError status 0) → status retrying, KHÔNG kẹt syncing, cycle sau retry được', async () => {
    vi.mocked(api.createStudent).mockRejectedValue(new ApiError(0, 'Network error — unable to reach server', '/students'))
    syncService.syncCreateStudent({ id: 'ST-NET-1', fullName: 'A', branch: 'AuNhi', classId: 'AU2' })
    await waitForQueueSize(1)

    await runSyncFlow()

    const state = useSyncStore.getState()
    expect(state.status).not.toBe('syncing')
    expect(state.status).toBe('retrying')

    const ops = await getDB().syncQueue.toArray()
    const op = ops.find(o => o.entityId === 'ST-NET-1')
    expect(op?.status).toBe('retrying')
    expect(op?.retryCount).toBe(1)

    // Cycle kế tiếp không bị guard 'syncing' chặn → retry thành công
    vi.mocked(api.createStudent).mockResolvedValue({ id: 'ST-SRV-1' })
    await runSyncFlow()
    expect(useSyncStore.getState().status).not.toBe('syncing')
    const remaining = await useSyncStore.getState().getPendingOps()
    expect(remaining.filter(o => o.entityId === 'ST-NET-1')).toHaveLength(0)
  })

  it('op fail lỗi vĩnh viễn (400) → status idle + lastError, không kẹt syncing', async () => {
    vi.mocked(api.createStudent).mockRejectedValue(new ApiError(400, 'Bad Request', '/students'))
    syncService.syncCreateStudent({ id: 'ST-PERM-1', fullName: 'A', branch: 'AuNhi', classId: 'AU2' })
    await waitForQueueSize(1)

    await runSyncFlow()

    const state = useSyncStore.getState()
    expect(state.status).not.toBe('syncing')
    expect(state.status).toBe('idle')
    expect(state.lastError).toContain('thất bại')

    const ops = await getDB().syncQueue.toArray()
    expect(ops.find(o => o.entityId === 'ST-PERM-1')?.status).toBe('failed')
  })
})

describe('Sync Engine — grade batch rehydrate server record (audit #2)', () => {
  beforeEach(async () => {
    await initDB()
    await useSyncStore.getState().initDevice()
    await resetDB()
    mockAllApiMethods()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('grade saved → bản ghi local được rehydrate id/version server trước khi xóa op', async () => {
    useGradeStore.getState().upsertGrade({ studentId: 'ST-1', semester: 1, scoreFinal: 8 }, true)
    const before = useGradeStore.getState().grades.find(g => g.studentId === 'ST-1' && g.semester === 1)
    expect(before?.id).toMatch(/^GR-/)

    syncService.syncUpsertGrade({ id: before!.id, studentId: 'ST-1', semester: 1, scoreFinal: 8 })
    await waitForQueueSize(1)
    const serverRecord = { id: 'GR-SRV-1', studentId: 'ST-1', semester: 1, academicYear: '2026-2027', version: 2, scoreFinal: 9 }
    vi.mocked(api.batchUpsertGrades).mockResolvedValue({
      results: [{
        studentId: 'ST-1',
        status: 'saved',
        record: serverRecord,
      }],
    } as any)
    // Sau khi queue rỗng, engine pull incremental/full — server phải trả lại chính
    // record vừa lưu (nếu không, pull full sẽ thay bằng dữ liệu cũ hơn).
    vi.mocked(api.getGrades).mockResolvedValue([serverRecord] as any)

    await runSyncFlow()

    const after = useGradeStore.getState().grades.find(g => g.studentId === 'ST-1' && g.semester === 1)
    expect(after?.id).toBe('GR-SRV-1')
    expect(after?.version).toBe(2)
    expect(after?.scoreFinal).toBe(9)

    const pending = await useSyncStore.getState().getPendingOps()
    expect(pending.filter(o => o.entity === 'grade')).toHaveLength(0)
    expect(useSyncStore.getState().status).not.toBe('syncing')
  })
})

describe('Sync Engine — conflict field-level merge (audit F9)', () => {
  beforeEach(async () => {
    await initDB()
    await useSyncStore.getState().initDevice()
    await resetDB()
    mockAllApiMethods()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('grade conflict → giữ chỉnh sửa local trên field đã đổi, giữ server trên field khác, re-queue với version server', async () => {
    useGradeStore.getState().upsertGrade({ studentId: 'ST-9', semester: 1, scoreFinal: 8 }, true)
    const before = useGradeStore.getState().grades.find(g => g.studentId === 'ST-9' && g.semester === 1)
    syncService.syncUpsertGrade({ id: before!.id, studentId: 'ST-9', semester: 1, scoreFinal: 8 })
    await waitForQueueSize(1)

    // Server đã bị thiết bị khác sửa: scoreFinal 9, scoreOral 7, version 3.
    vi.mocked(api.batchUpsertGrades).mockResolvedValue({
      results: [{
        studentId: 'ST-9',
        status: 'conflict',
        currentGrade: { id: 'GR-SRV-9', studentId: 'ST-9', semester: 1, academicYear: '2026-2027', version: 3, scoreFinal: 9, scoreOral: 7 },
      }],
    } as any)

    await runSyncFlow()

    // Local edit (scoreFinal 8) được GIỮ — không bị server (9) đè như trước.
    const after = useGradeStore.getState().grades.find(g => g.studentId === 'ST-9' && g.semester === 1)
    expect(after?.id).toBe('GR-SRV-9')
    expect(after?.version).toBe(3)
    expect(after?.scoreFinal).toBe(8)
    // Field khác giữ giá trị server.
    expect(after?.scoreOral).toBe(7)

    // Op mới được re-queue với version server hiện hành → cycle sau không conflict.
    const pending = await useSyncStore.getState().getPendingOps()
    const requeued = pending.find(o => o.entity === 'grade' && o.entityId === 'GR-SRV-9')
    expect(requeued).toBeDefined()
    expect(requeued!.operation).toBe('UPDATE')
    const payload = await readPayload(requeued!)
    expect(payload.version).toBe(3)
    expect(payload.scoreFinal).toBe(8)
    expect(payload.scoreOral).toBe(7)
  })

  it('attendance conflict → merge status local + re-queue, không server-wins', async () => {
    useAttendanceStore.getState().setAttendance([
      mkAttendance({ id: 'AT-CONF', studentId: 'ST-10', status: 'AbsentUnexcused', version: 1 } as any),
    ])
    syncService.syncSaveAttendance({ id: 'AT-CONF', studentId: 'ST-10', date: '2026-08-02', type: 'SundayMass', status: 'AbsentUnexcused', version: 1 })
    await waitForQueueSize(1)

    // Thiết bị khác đã đổi status sang Present (version 4).
    vi.mocked(api.batchUpsertAttendance).mockResolvedValue({
      results: [{ studentId: 'ST-10', status: 'conflict', record: { id: 'AT-SRV-10', studentId: 'ST-10', date: '2026-08-02', type: 'SundayMass', status: 'Present', version: 4 } }],
    } as any)

    await runSyncFlow()

    const after = useAttendanceStore.getState().attendance.find(a => a.studentId === 'ST-10')
    // Natural key (studentId+date+type) giữ row local; id được đổi khi pull về.
    expect(after?.status).toBe('AbsentUnexcused')
    expect(after?.version).toBe(4)

    const pending = await useSyncStore.getState().getPendingOps()
    const requeued = pending.find(o => o.entity === 'attendance' && o.entityId === 'AT-SRV-10')
    expect(requeued).toBeDefined()
    const payload = await readPayload(requeued!)
    expect(payload.version).toBe(4)
    expect(payload.status).toBe('AbsentUnexcused')
  })
})

describe('Sync Engine — student CREATE idempotency (audit #3)', () => {
  beforeEach(async () => {
    await initDB()
    await useSyncStore.getState().initDevice()
    await resetDB()
    mockAllApiMethods()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('processOperation student CREATE gửi idempotencyKey = entityId (temp id)', async () => {
    vi.mocked(api.createStudent).mockResolvedValue({ id: 'ST-SRV-X' })
    syncService.syncCreateStudent({ id: 'ST-TMP-X', fullName: 'Nguyễn Văn X', branch: 'AuNhi', classId: 'AU2' })
    await waitForQueueSize(1)

    await runSyncFlow()

    expect(api.createStudent).toHaveBeenCalledWith({
      fullName: 'Nguyễn Văn X',
      branch: 'AuNhi',
      classId: 'AU2',
      idempotencyKey: 'ST-TMP-X',
    })
  })
})

describe('Sync Engine — natural-key merge khi pull incremental (audit #6)', () => {
  beforeEach(async () => {
    await initDB()
    await useSyncStore.getState().initDevice()
    await resetDB()
    mockAllApiMethods()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('grade: row server cùng natural key thay thế row local temp id — không tạo dòng trùng', async () => {
    useGradeStore.getState().setGrades([mkGrade({ id: 'GR-TEMP', studentId: 'ST-6', semester: 1, scoreFinal: 8 })])
    vi.mocked(api.getGrades).mockResolvedValue([
      mkGrade({ id: 'GR-SRV', studentId: 'ST-6', semester: 1, academicYear: '2026-2027', scoreFinal: 9 }) as any,
    ])

    await useGradeStore.getState().fetchGrades('2026-08-01T00:00:00.000Z')

    const match = useGradeStore.getState().grades.filter(g => g.studentId === 'ST-6' && g.semester === 1)
    expect(match).toHaveLength(1)
    expect(match[0].id).toBe('GR-SRV')
  })

  it('grade: row có op pending KHÔNG bị server đè (giữ thay đổi chưa sync)', async () => {
    useGradeStore.getState().setGrades([mkGrade({ id: 'GR-TEMP', studentId: 'ST-6', semester: 1, scoreFinal: 8 })])
    await syncService.syncUpsertGrade({ id: 'GR-TEMP', studentId: 'ST-6', semester: 1, scoreFinal: 8 })
    vi.mocked(api.getGrades).mockResolvedValue([
      mkGrade({ id: 'GR-SRV', studentId: 'ST-6', semester: 1, academicYear: '2026-2027', scoreFinal: 9 }) as any,
    ])

    await useGradeStore.getState().fetchGrades('2026-08-01T00:00:00.000Z')

    const match = useGradeStore.getState().grades.filter(g => g.studentId === 'ST-6' && g.semester === 1)
    expect(match).toHaveLength(1)
    expect(match[0].id).toBe('GR-TEMP')
    expect(match[0].scoreFinal).toBe(8)
  })

  it('attendance: row server cùng natural key thay thế row local temp id — không tạo dòng trùng', async () => {
    useAttendanceStore.getState().setAttendance([
      mkAttendance({ id: 'AT-TEMP', studentId: 'ST-7', status: 'Present' }),
    ])
    vi.mocked(api.getAttendance).mockResolvedValue([
      mkAttendance({ id: 'AT-SRV', studentId: 'ST-7', status: 'AbsentUnexcused' }) as any,
    ])

    await useAttendanceStore.getState().fetchAttendance('2026-08-01T00:00:00.000Z')

    const match = useAttendanceStore.getState().attendance.filter(a => a.studentId === 'ST-7')
    expect(match).toHaveLength(1)
    expect(match[0].id).toBe('AT-SRV')
  })

  it('attendance: row có op pending KHÔNG bị server đè', async () => {
    useAttendanceStore.getState().setAttendance([
      mkAttendance({ id: 'AT-TEMP', studentId: 'ST-7', status: 'Present' }),
    ])
    await syncService.syncSaveAttendance({ id: 'AT-TEMP', studentId: 'ST-7', date: '2026-08-02', type: 'SundayMass', status: 'Present' })
    vi.mocked(api.getAttendance).mockResolvedValue([
      mkAttendance({ id: 'AT-SRV', studentId: 'ST-7', status: 'AbsentUnexcused' }) as any,
    ])

    await useAttendanceStore.getState().fetchAttendance('2026-08-01T00:00:00.000Z')

    const match = useAttendanceStore.getState().attendance.filter(a => a.studentId === 'ST-7')
    expect(match).toHaveLength(1)
    expect(match[0].id).toBe('AT-TEMP')
    expect(match[0].status).toBe('Present')
  })
})
