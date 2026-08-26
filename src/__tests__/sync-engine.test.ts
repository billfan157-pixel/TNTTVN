import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initDB, getDB } from '../lib/db'
import { useSyncStore } from '../stores/syncStore'
import { processOperation, getBackoffMs } from '../lib/syncProcessor'
import * as syncService from '../lib/syncService'
import { api, ApiError } from '../lib/api'
import { decryptQueueValue } from '../lib/offlineCipher'

// A-NEW-32: payload trong queue giờ được mã hóa (AAD 'syncQueue') — test parse
// payload thật phải giải mã trước (dual-format vẫn trả nguyên legacy plaintext).
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
}

function mockAllApiMethods() {
  vi.spyOn(api, 'createStudent').mockResolvedValue({ id: 'mock' })
  vi.spyOn(api, 'updateStudent').mockResolvedValue({})
  vi.spyOn(api, 'deleteStudent').mockResolvedValue({ success: true })
  vi.spyOn(api, 'upsertGrade').mockResolvedValue({})
  vi.spyOn(api, 'upsertAttendance').mockResolvedValue({})
  vi.spyOn(api, 'getStudents').mockResolvedValue({ data: [], total: 0 })
  vi.spyOn(api, 'getGrades').mockResolvedValue([])
  vi.spyOn(api, 'getAttendance').mockResolvedValue([])
  vi.spyOn(api, 'getNotices').mockResolvedValue([])
}

describe('Sync Engine — Queue Operations', () => {
  beforeEach(async () => {
    await initDB()
    await useSyncStore.getState().initDevice()
    await resetDB()
  })

  it('syncCreateStudent adds CREATE op to queue', async () => {
    const studentData = { id: 'ST-TEST-1', fullName: 'Nguyễn Văn A', branch: 'AuNhi', classId: 'AU2' }
    await syncService.syncCreateStudent(studentData as any)

    const pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(1)
    expect(pending[0].entity).toBe('student')
    expect(pending[0].operation).toBe('CREATE')
    expect(pending[0].entityId).toBe('ST-TEST-1')
    const payload = await readPayload(pending[0])
    expect(payload.fullName).toBe('Nguyễn Văn A')
  })

  it('syncUpdateStudent adds UPDATE op to queue', async () => {
    await syncService.syncUpdateStudent('ST-TEST-1', { fullName: 'Nguyễn Văn B' })

    const pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(1)
    expect(pending[0].entity).toBe('student')
    expect(pending[0].operation).toBe('UPDATE')
    expect(pending[0].entityId).toBe('ST-TEST-1')
  })

  it('syncDeleteStudent adds DELETE op to queue', async () => {
    await syncService.syncDeleteStudent('ST-TEST-1')

    const pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(1)
    expect(pending[0].operation).toBe('DELETE')
  })

  it('syncUpsertGrade adds UPDATE op for grades', async () => {
    const gradeData = { id: 'GR-TEST-1', studentId: 'ST-TEST-1', semester: 1, scoreFinal: 9 }
    await syncService.syncUpsertGrade(gradeData as any)

    const pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(1)
    expect(pending[0].entity).toBe('grade')
    expect(pending[0].operation).toBe('UPDATE')
  })

  it('syncBatchUpsertGrades adds multiple grade ops', async () => {
    await syncService.syncBatchUpsertGrades([
      { id: 'GR-TEST-1', studentId: 'ST-001', semester: 1 } as any,
      { id: 'GR-TEST-2', studentId: 'ST-002', semester: 1 } as any,
    ])

    const pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(2)
  })

  it('syncSaveAttendance adds UPDATE op with composite entityId', async () => {
    await syncService.syncSaveAttendance({ studentId: 'ST-001', date: '2026-07-26', type: 'SundayMass', status: 'Present' } as any)

    const pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(1)
    expect(pending[0].entity).toBe('attendance')
    expect(pending[0].entityId).toBe('ST-001-2026-07-26-SundayMass')
  })

  it('syncBatchSaveAttendance adds multiple attendance ops', async () => {
    await syncService.syncBatchSaveAttendance(
      '2026-07-26', 'CatechismClass',
      [
        { studentId: 'ST-001', status: 'Present' },
        { studentId: 'ST-002', status: 'AbsentExcused', note: 'Ốm' },
      ],
    )

    const pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(2)
  })

  it('pendingCount reflects number of pending ops', async () => {
    expect(useSyncStore.getState().pendingCount).toBe(0)

    await syncService.syncCreateStudent({ id: 'ST-A', fullName: 'A' } as any)
    await useSyncStore.getState().refreshCount()
    expect(useSyncStore.getState().pendingCount).toBe(1)

    await syncService.syncCreateStudent({ id: 'ST-B', fullName: 'B' } as any)
    await useSyncStore.getState().refreshCount()
    expect(useSyncStore.getState().pendingCount).toBe(2)
  })
})

describe('Sync Engine — Queue Compaction', () => {
  beforeEach(async () => {
    await initDB()
    await useSyncStore.getState().initDevice()
    await resetDB()
  })

  it('compacts CREATE + UPDATE → single CREATE with latest payload', async () => {
    await syncService.syncCreateStudent({ id: 'ST-C1', fullName: 'Initial' } as any)
    await new Promise(r => setTimeout(r, 10))
    await syncService.syncUpdateStudent('ST-C1', { fullName: 'Updated' })
    await useSyncStore.getState().compactQueue()

    const pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(1)
    expect(pending[0].operation).toBe('CREATE')
    const payload = await readPayload(pending[0])
    expect(payload.fullName).toBe('Updated')
  })

  it('compacts CREATE + DELETE → removes all', async () => {
    await syncService.syncCreateStudent({ id: 'ST-C2', fullName: 'Temp' } as any)
    await syncService.syncDeleteStudent('ST-C2')
    await useSyncStore.getState().compactQueue()

    const pending = await useSyncStore.getState().getPendingOps()
    const match = pending.filter(p => p.entityId === 'ST-C2')
    expect(match).toHaveLength(0)
  })

  it('compacts multiple UPDATEs → single last UPDATE', async () => {
    await syncService.syncUpdateStudent('ST-C3', { fullName: 'V1' })
    await new Promise(r => setTimeout(r, 20))
    await syncService.syncUpdateStudent('ST-C3', { fullName: 'V2' })
    await new Promise(r => setTimeout(r, 20))
    await syncService.syncUpdateStudent('ST-C3', { fullName: 'V3' })
    await new Promise(r => setTimeout(r, 20))
    await useSyncStore.getState().compactQueue()

    const pending = await useSyncStore.getState().getPendingOps()
    const match = pending.filter(p => p.entityId === 'ST-C3')
    expect(match).toHaveLength(1)
    expect(match[0].operation).toBe('UPDATE')
    const payload = await readPayload(match[0])
    expect(payload.fullName).toBe('V3')
  })

  it('compacts UPDATE(s) + DELETE → keeps only DELETE', async () => {
    await syncService.syncUpdateStudent('ST-C4', { fullName: 'V1' })
    await syncService.syncUpdateStudent('ST-C4', { fullName: 'V2' })
    await syncService.syncDeleteStudent('ST-C4')
    await useSyncStore.getState().compactQueue()

    const pending = await useSyncStore.getState().getPendingOps()
    const match = pending.filter(p => p.entityId === 'ST-C4')
    expect(match).toHaveLength(1)
    expect(match[0].operation).toBe('DELETE')
  })

  it('keeps single ops unchanged', async () => {
    await syncService.syncCreateStudent({ id: 'ST-C5', fullName: 'Single' } as any)
    await syncService.syncUpdateStudent('ST-C6', { fullName: 'Another' })
    await syncService.syncDeleteStudent('ST-C7')
    await useSyncStore.getState().compactQueue()

    const pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(3)
  })

  it('does not merge ops across different entityIds', async () => {
    await syncService.syncCreateStudent({ id: 'ST-D1', fullName: 'A' } as any)
    await syncService.syncUpdateStudent('ST-D2', { fullName: 'B' })
    await syncService.syncDeleteStudent('ST-D3')
    await useSyncStore.getState().compactQueue()

    const pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(3)
  })
})

describe('Sync Engine — Process Operation', () => {
  beforeEach(async () => {
    await initDB()
    await useSyncStore.getState().initDevice()
    await resetDB()
    mockAllApiMethods()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('processes student CREATE via api.createStudent', async () => {
    vi.mocked(api.createStudent).mockResolvedValue({ id: 'ST-P1' })

    const opId = await useSyncStore.getState().addOp({
      entity: 'student', entityId: 'ST-P1', operation: 'CREATE',
      payload: JSON.stringify({ id: 'ST-P1', fullName: 'New Student', branch: 'AuNhi', classId: 'AU2' }),
    })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    expect(result.ok).toBe(true)
    // Client must NOT send id/code — server generates them. Idempotency key
    // (audit finding #3) = temp id of the op, sent so a retry never duplicates.
    expect(api.createStudent).toHaveBeenCalledWith({ fullName: 'New Student', branch: 'AuNhi', classId: 'AU2', idempotencyKey: 'ST-P1' })
  })

  it('processes student UPDATE via api.updateStudent', async () => {
    vi.mocked(api.updateStudent).mockResolvedValue({ id: 'ST-P1', fullName: 'Updated' })

    const opId = await useSyncStore.getState().addOp({
      entity: 'student', entityId: 'ST-P1', operation: 'UPDATE',
      payload: JSON.stringify({ fullName: 'Updated' }),
    })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    expect(result.ok).toBe(true)
    expect(api.updateStudent).toHaveBeenCalledWith('ST-P1', { fullName: 'Updated' })
  })

  it('processes student DELETE via api.deleteStudent', async () => {
    vi.mocked(api.deleteStudent).mockResolvedValue({ success: true })

    const opId = await useSyncStore.getState().addOp({
      entity: 'student', entityId: 'ST-P1', operation: 'DELETE',
      payload: JSON.stringify({}),
    })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    expect(result.ok).toBe(true)
    expect(api.deleteStudent).toHaveBeenCalledWith('ST-P1')
  })

  it('processes grade UPDATE via api.upsertGrade', async () => {
    vi.mocked(api.upsertGrade).mockResolvedValue({ id: 'GR-P1' })

    const opId = await useSyncStore.getState().addOp({
      entity: 'grade', entityId: 'ST-P1', operation: 'UPDATE',
      payload: JSON.stringify({ studentId: 'ST-P1', semester: 1, scoreFinal: 9 }),
    })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    expect(result.ok).toBe(true)
    expect(api.upsertGrade).toHaveBeenCalled()
    expect(api.upsertGrade).toHaveBeenCalledWith({ studentId: 'ST-P1', semester: 1, scoreFinal: 9 })
  })

  it('processes attendance UPDATE via api.upsertAttendance', async () => {
    vi.mocked(api.upsertAttendance).mockResolvedValue({ id: 'AT-P1' })

    const opId = await useSyncStore.getState().addOp({
      entity: 'attendance', entityId: 'ST-001-2026-07-26', operation: 'UPDATE',
      payload: JSON.stringify({ studentId: 'ST-001', date: '2026-07-26', type: 'SundayMass', status: 'Present' }),
    })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    expect(result.ok).toBe(true)
    expect(api.upsertAttendance).toHaveBeenCalledWith({ studentId: 'ST-001', date: '2026-07-26', type: 'SundayMass', status: 'Present' })
  })
})

describe('Sync Engine — Retry Policy', () => {
  beforeEach(async () => {
    await initDB()
    await useSyncStore.getState().initDevice()
    await resetDB()
    mockAllApiMethods()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns recoverable=true for 500 error (retryCount < 5)', async () => {
    vi.mocked(api.createStudent).mockRejectedValue(new ApiError(500, 'Internal Server Error', '/students'))

    const opId = await useSyncStore.getState().addOp({
      entity: 'student', entityId: 'ST-R1', operation: 'CREATE',
      payload: JSON.stringify({ id: 'ST-R1' }),
    })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    expect(result.ok).toBe(false)
    expect((result as any).recoverable).toBe(true)
  })

  it('returns recoverable=false for 400 error', async () => {
    vi.mocked(api.createStudent).mockRejectedValue(new ApiError(400, 'Bad Request', '/students'))

    const opId = await useSyncStore.getState().addOp({
      entity: 'student', entityId: 'ST-R2', operation: 'CREATE',
      payload: JSON.stringify({ id: 'ST-R2' }),
    })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    expect(result.ok).toBe(false)
    expect((result as any).recoverable).toBe(false)
  })

  it('returns recoverable=false for 403 error', async () => {
    vi.mocked(api.createStudent).mockRejectedValue(new ApiError(403, 'Forbidden', '/students'))

    const opId = await useSyncStore.getState().addOp({
      entity: 'student', entityId: 'ST-R3', operation: 'CREATE',
      payload: JSON.stringify({ id: 'ST-R3' }),
    })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    expect(result.ok).toBe(false)
    expect((result as any).recoverable).toBe(false)
  })

  it('returns recoverable=false for 404 error', async () => {
    vi.mocked(api.deleteStudent).mockRejectedValue(new ApiError(404, 'Not Found', '/students/ST-R4'))

    const opId = await useSyncStore.getState().addOp({
      entity: 'student', entityId: 'ST-R4', operation: 'DELETE',
      payload: JSON.stringify({}),
    })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    expect(result.ok).toBe(false)
    expect((result as any).recoverable).toBe(false)
  })

  it('SYNC-CONFLICT-1: student CREATE 409 (business conflict) → ok=false, recoverable=false — op KHÔNG bị nuốt', async () => {
    vi.mocked(api.createStudent).mockRejectedValue(new ApiError(409, 'Conflict', '/students'))

    const opId = await useSyncStore.getState().addOp({
      entity: 'student', entityId: 'ST-R5', operation: 'CREATE',
      payload: JSON.stringify({ id: 'ST-R5' }),
    })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    // Trước đây: ok=true + isConflict → engine removeOp → mất chỉnh sửa offline
    // vĩnh viễn (server-wins thầm lặng). Giờ: permanent-fail giữ payload, user
    // xử lý tường minh qua SystemDiagnostics (Retry/Remove).
    expect(result.ok).toBe(false)
    expect((result as any).recoverable).toBe(false)
    expect((result as any).isConflict).toBeUndefined()
  })

  it('returns recoverable=false for 401 auth error', async () => {
    vi.mocked(api.createStudent).mockRejectedValue(new ApiError(401, 'Unauthorized', '/students'))

    const opId = await useSyncStore.getState().addOp({
      entity: 'student', entityId: 'ST-R6', operation: 'CREATE',
      payload: JSON.stringify({ id: 'ST-R6' }),
    })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    expect(result.ok).toBe(false)
    expect((result as any).recoverable).toBe(false)
  })

  it('returns recoverable=true cho ApiError status 0 (network, finding #4) kể cả retryCount >= MAX_RETRIES', async () => {
    vi.mocked(api.createStudent).mockRejectedValue(new ApiError(0, 'Network error — unable to reach server', '/students'))

    const opId = await useSyncStore.getState().addOp({
      entity: 'student', entityId: 'ST-R7', operation: 'CREATE',
      payload: JSON.stringify({ id: 'ST-R7' }),
    })
    await useSyncStore.getState().updateOp(opId, { retryCount: 5 })

    const op = (await getDB().syncQueue.get(opId))!
    const result = await processOperation(op)
    expect(result.ok).toBe(false)
    expect((result as any).recoverable).toBe(true)
  })
})

describe('Sync Engine — Backoff Calculation', () => {
  it('uses 5s for retryCount=0', () => {
    expect(getBackoffMs(0)).toBe(5000)
  })

  it('uses 15s for retryCount=1', () => {
    expect(getBackoffMs(1)).toBe(15000)
  })

  it('uses 60s for retryCount=2 and beyond', () => {
    expect(getBackoffMs(2)).toBe(60000)
    expect(getBackoffMs(3)).toBe(60000)
    expect(getBackoffMs(10)).toBe(60000)
  })
})

describe('Sync Engine — Full Lifecycle (Enqueue → Compact → Process)', () => {
  beforeEach(async () => {
    await initDB()
    await useSyncStore.getState().initDevice()
    await resetDB()
    mockAllApiMethods()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueue → compact → process → empty queue', async () => {
    vi.mocked(api.createStudent).mockResolvedValue({ id: 'ST-FINAL' })

    // 1. Enqueue operations
    await syncService.syncCreateStudent({ id: 'ST-FINAL', fullName: 'Final Test' } as any)
    await syncService.syncUpdateStudent('ST-FINAL', { fullName: 'Final Test Updated' })
    await syncService.syncCreateStudent({ id: 'ST-FINAL-2', fullName: 'Another' } as any)

    let pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(3)

    // 2. Compact
    await useSyncStore.getState().compactQueue()
    pending = await useSyncStore.getState().getPendingOps()
    expect(pending).toHaveLength(2)

    // 3. Process each operation
    for (const op of pending) {
      const result = await processOperation(op)
      expect(result.ok).toBe(true)
    }

    // 4. Remove completed ops
    for (const op of pending) {
      await useSyncStore.getState().removeOp(op.id)
    }

    const remaining = await useSyncStore.getState().getPendingOps()
    expect(remaining).toHaveLength(0)
    expect(api.createStudent).toHaveBeenCalledTimes(2)
  })
})
