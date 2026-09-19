import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setTenantScope, captureTenantScope } from '../lib/tenantScope'
import * as cipher from '../lib/offlineCipher'
import { useSyncStore } from '../stores/syncStore'
import { api, ApiError, setTokens, clearTokens } from '../lib/api'
import { syncSaveExamResults, syncCompleteExam } from '../lib/syncService'
import { flushAttendanceBatchWithIsolation } from '../lib/syncApply'
import { runSyncFlow } from '../lib/syncCoordinator'
import { processOperation } from '../lib/syncProcessor'
import { useGradeStore } from '../stores/gradeStore'
import { useDailyGradeStore } from '../stores/dailyGradeStore'
import { useNoticeStore } from '../stores/noticeStore'
import { resolveConflictWithMerge } from '../lib/syncApply'
import * as reset from '../lib/resetClientData'
import { useStudentStore } from '../stores/studentStore'

vi.mock('../lib/syncProcessor', async original => ({ ...await original<object>(), getBackoffMs: () => 0 }))
vi.mock('../router', () => ({ router: { navigate: vi.fn() } }))
const owner = { userId: 'AUDIT07-U', parishId: 'AUDIT07-P' }
const queue = () => useSyncStore.getState()
const payload = async (row: { payload: string }) => JSON.parse((await cipher.decryptQueueValue(row.payload))!)
function gate() {
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve })
  const blocked = new Promise<void>(resolve => { release = resolve })
  return { enter, release, entered, blocked }
}
beforeEach(async () => {
  vi.restoreAllMocks()
  await db.syncQueue.clear()
  await db.syncConflicts.clear()
  localStorage.clear()
  localStorage.setItem('parish_purge_version', '1')
  setTenantScope(owner)
  setTokens('synthetic-A')
  queue().setStatus('idle')
  useGradeStore.setState({ grades: [] })
  useDailyGradeStore.setState({ entries: [], serverEntries: [] })
  vi.spyOn(api, 'probePurgeVersion').mockResolvedValue(1)
  vi.spyOn(api, 'getStudents').mockResolvedValue({ data: [], total: 0 })
  const envelope = { records: [], mode: 'full', scope: { revision: 'r1', studentIds: [], semester: null } }
  vi.spyOn(api, 'pullGrades').mockResolvedValue(envelope as never)
  vi.spyOn(api, 'pullAttendance').mockResolvedValue(envelope as never)
  vi.spyOn(api, 'getNotices').mockResolvedValue([])
  vi.spyOn(api, 'getClasses').mockResolvedValue([])
  vi.spyOn(api, 'getSyncWatermark').mockResolvedValue({ serverTime: '2026-09-19T01:00:00.000Z', cursorVersion: 1 })
})
afterEach(() => { clearTokens(); setTenantScope(null); vi.restoreAllMocks() })

describe('Audit07 owner, compaction and completion barriers', () => {
  it('retries a retained grade draft after enqueue rejection with its score intact', async () => {
    const edit = { studentId: 'ST-RETRY', semester: 1 as const, scoreFinal: 8 }
    const add = vi.spyOn(queue(), 'addOp').mockRejectedValueOnce(new Error('Synthetic quota error'))
    await expect(useGradeStore.getState().upsertGrade(edit)).rejects.toThrow('quota')
    expect(useGradeStore.getState().grades[0].scoreFinal).toBe(8)
    add.mockRestore()
    await useGradeStore.getState().upsertGrade(edit)
    expect(await payload((await queue().getPendingOps())[0])).toMatchObject({ scoreFinal: 8, _syncGradePatch: true })
  })

  it('preserves a newer queued field when an older grade request conflicts', async () => {
    const base = { id: 'GR-RACE', studentId: 'ST-RACE', academicYear: '2026-2027', semester: 1, version: 1, _syncGradePatch: true }
    await queue().addOp({ entity: 'grade', entityId: base.id, operation: 'UPDATE', payload: JSON.stringify({ ...base, scoreFinal: 6 }) })
    const [older] = await queue().getPendingOps()
    await queue().claimOp(older.id)
    await queue().addOp({ entity: 'grade', entityId: base.id, operation: 'UPDATE', payload: JSON.stringify({ ...base, scoreFinal: 8 }) })
    await resolveConflictWithMerge(older, { ...base, version: 2, scoreFinal: 9, scoreOral: 7 }, captureTenantScope()!)
    const [retry] = await queue().getPendingOps()
    expect(await payload(retry)).toMatchObject({ scoreFinal: 8, version: 2 })
    expect(useGradeStore.getState().grades[0]).toMatchObject({ scoreFinal: 8, scoreOral: 7 })
  })

  it('uses the last immutable ID, not a shrinking total, to finish the student delta', async () => {
    useStudentStore.setState({ students: [] })
    vi.mocked(api.getStudents)
      .mockResolvedValueOnce({ data: [{ id: 'A' }, { id: 'B' }], total: 3 } as never)
      .mockResolvedValueOnce({ data: [{ id: 'C' }], total: 1 } as never)
    await useStudentStore.getState().fetchStudents({ updatedAfter: '2026-09-01', updatedBefore: '2026-09-19', limit: 2, throwOnError: true })
    expect(api.getStudents).toHaveBeenNthCalledWith(2, expect.objectContaining({ afterId: 'B' }))
    expect(useStudentStore.getState().students.map(row => row.id)).toEqual(['A', 'B', 'C'])
  })
  it('never dispatches an attendance batch when owner changes during decrypt', async () => {
    const data = { studentId: 'ST-X', date: '2026-09-19', type: 'SundayMass', status: 'Present' }
    await queue().addOp({ entity: 'attendance', entityId: 'AT-X', operation: 'UPDATE', payload: JSON.stringify(data) })
    const [op] = await queue().getPendingOps()
    await queue().claimOp(op.id)
    const captured = captureTenantScope()!
    const boundary = gate(), original = cipher.decryptQueueValue
    vi.spyOn(cipher, 'decryptQueueValue').mockImplementationOnce(async value => { boundary.enter(); await boundary.blocked; return original(value) })
    const send = vi.spyOn(api, 'batchUpsertAttendance').mockResolvedValue({ results: [] } as never)
    const flushing = flushAttendanceBatchWithIsolation([op], data, queue(), { mergedConflictCount: 0 }, captured)
    await boundary.entered
    setTenantScope({ ...owner, userId: 'USER-B' }); setTokens('synthetic-B')
    boundary.release(); await flushing
    expect(send).not.toHaveBeenCalled()
    expect(await db.syncQueue.get(op.id)).toMatchObject(owner)
  })

  it('also fences an individual command after asynchronous decrypt', async () => {
    await queue().addOp({ entity: 'notice', entityId: 'NC-X', operation: 'DELETE', payload: '{}' })
    const [op] = await queue().getPendingOps(), captured = captureTenantScope()!
    const boundary = gate(), original = cipher.decryptQueueValue
    vi.spyOn(cipher, 'decryptQueueValue').mockImplementationOnce(async value => { boundary.enter(); await boundary.blocked; return original(value) })
    const send = vi.spyOn(api, 'deleteNotice')
    const processing = processOperation(op, captured)
    const rejected = expect(processing).rejects.toThrow(/owner changed/)
    await boundary.entered
    setTenantScope({ ...owner, userId: 'USER-B' })
    boundary.release(); await rejected
    expect(send).not.toHaveBeenCalled()
  })

  it('preserves an enqueue committed while compaction is encrypting its old snapshot', async () => {
    await queue().addOp({ entity: 'student', entityId: 'ST-TEMP', operation: 'CREATE', payload: JSON.stringify({ fullName: 'Original' }) })
    await queue().addOp({ entity: 'student', entityId: 'ST-TEMP', operation: 'UPDATE', payload: JSON.stringify({ parentPhone: 'old' }) })
    const boundary = gate(), original = cipher.encryptQueueValue
    vi.spyOn(cipher, 'encryptQueueValue').mockImplementationOnce(async value => { boundary.enter(); await boundary.blocked; return original(value) })
    const compacting = queue().compactQueue()
    await boundary.entered
    await queue().addOp({ entity: 'student', entityId: 'ST-TEMP', operation: 'UPDATE', payload: JSON.stringify({ parentPhone: 'new' }) })
    boundary.release(); await compacting
    let rows = await queue().getPendingOps()
    expect(rows).toHaveLength(2)
    expect(await payload(rows.find(row => row.operation === 'UPDATE')!)).toEqual({ parentPhone: 'new' })
    await queue().compactQueue()
    rows = await queue().getPendingOps()
    expect(rows).toHaveLength(1)
    expect(await payload(rows[0])).toEqual({ fullName: 'Original', parentPhone: 'new' })
  })

  it('holds complete after a result network failure and releases it after result ACK', async () => {
    const save = vi.spyOn(api, 'saveExamResults').mockRejectedValue(new ApiError(0, 'Network offline', '/exams'))
    const complete = vi.spyOn(api, 'completeExam').mockResolvedValue({ id: 'EX-X', status: 'completed' } as never)
    await syncSaveExamResults('EX-X', [{ studentId: 'ST-X', score: 8 }])
    await syncCompleteExam('EX-X')
    const rows = await queue().getPendingOps()
    await db.syncQueue.update(rows.find(row => row.entity === 'exam_result')!.id, { createdAt: '2026-09-19T00:00:00.000Z' })
    await db.syncQueue.update(rows.find(row => row.entity === 'exam')!.id, { createdAt: '2026-09-19T00:00:01.000Z' })
    await runSyncFlow(true)
    expect(complete).not.toHaveBeenCalled()
    expect(await queue().getPendingOps()).toHaveLength(2)
    save.mockResolvedValue({ results: [] } as never)
    queue().setStatus('idle')
    await runSyncFlow(true)
    expect(complete).toHaveBeenCalledExactlyOnceWith('EX-X')
    expect(await queue().getPendingOps()).toHaveLength(0)
  })

  it('only retries the edited grade field and retains another users newer final score', async () => {
    useGradeStore.setState({ grades: [{ id: 'GR-X', studentId: 'ST-X', academicYear: '2026-2027', semester: 1, version: 1, scoreMidterm: 5, scoreFinal: 5, scoreMidterm_source: 'manual', scoreFinal_source: 'manual' } as never] })
    await useGradeStore.getState().upsertGrade({ studentId: 'ST-X', academicYear: '2026-2027', semester: 1, scoreMidterm: 8 })
    const [op] = await queue().getPendingOps()
    expect(await payload(op)).not.toHaveProperty('scoreFinal')
    await queue().claimOp(op.id)
    const server = { ...useGradeStore.getState().grades[0], version: 2, scoreFinal: 9 }
    await resolveConflictWithMerge(op, server, captureTenantScope()!)
    const [retry] = await queue().getPendingOps()
    expect(await payload(retry)).toMatchObject({ scoreMidterm: 8, version: 2, _syncGradePatch: true })
    expect(await payload(retry)).not.toHaveProperty('scoreFinal')
    expect(useGradeStore.getState().grades[0].scoreFinal).toBe(9)
  })

  it('merges disjoint queued grade patches rather than losing the first edit', async () => {
    const base = { studentId: 'ST-X', academicYear: '2026-2027', semester: 1 as const }
    await useGradeStore.getState().upsertGrade({ ...base, scoreMidterm: 8 })
    await useGradeStore.getState().upsertGrade({ ...base, scoreFinal: 9 })
    const rows = await queue().getPendingOps()
    expect(rows).toHaveLength(1)
    expect(await payload(rows[0])).toMatchObject({ scoreMidterm: 8, scoreFinal: 9, _syncGradePatch: true })
  })

  it('retains explicit clears and their source without creating unrelated null fields', async () => {
    await useGradeStore.getState().upsertGrade({ studentId: 'ST-CLEAR', semester: 1,
      scoreDaoDuc: null, scoreDaoDuc_source: 'manual' } as never)
    const [op] = await queue().getPendingOps()
    expect(await payload(op)).toMatchObject({ scoreDaoDuc: null, scoreDaoDuc_source: 'manual', _syncGradePatch: true })
    expect(await payload(op)).not.toHaveProperty('scoreFinal')
  })

  it('quarantines legacy grade conflict without guessing which snapshot fields were edited', async () => {
    await queue().addOp({ entity: 'grade', entityId: 'GR-OLD', operation: 'UPDATE', payload: JSON.stringify({ studentId: 'ST-X', scoreMidterm: 8, scoreFinal: 5 }) })
    const [op] = await queue().getPendingOps()
    await queue().claimOp(op.id)
    await resolveConflictWithMerge(op, { id: 'GR-OLD', studentId: 'ST-X', version: 2, scoreFinal: 9 }, captureTenantScope()!)
    expect(await db.syncQueue.get(op.id)).toMatchObject({ status: 'failed' })
    expect(await db.syncConflicts.count()).toBe(1)
  })

  it('reports a legacy conflict as failed review rather than successful merge', async () => {
    await queue().addOp({ entity: 'grade', entityId: 'GR-LEGACY-UX', operation: 'UPDATE',
      payload: JSON.stringify({ studentId: 'ST-X', semester: 1, academicYear: '2026-2027', scoreFinal: 5 }) })
    vi.spyOn(api, 'batchUpsertGrades').mockResolvedValue({ results: [{ studentId: 'ST-X', status: 'conflict',
      currentGrade: { id: 'GR-LEGACY-UX', studentId: 'ST-X', version: 2, scoreFinal: 9 } }] })
    await runSyncFlow(true)
    expect(queue().lastError).toContain('thất bại')
    expect(queue().lastError).not.toContain('đã được hợp nhất')
    expect(await db.syncQueue.where('status').equals('failed').count()).toBe(1)
  })

  it('does not publish a daily grade on rejected enqueue, and a retry succeeds', async () => {
    const add = vi.spyOn(queue(), 'addOp').mockRejectedValueOnce(new Error('Synthetic quota error'))
    await expect(useDailyGradeStore.getState().addEntry('ST-X', 'oral', 8, 1)).rejects.toThrow('quota')
    expect(useDailyGradeStore.getState().entries).toEqual([])
    expect(useGradeStore.getState().grades).toEqual([])
    expect(await db.syncQueue.count()).toBe(0)
    add.mockRestore()
    await useDailyGradeStore.getState().addEntry('ST-X', 'oral', 8, 1)
    expect(useDailyGradeStore.getState().entries).toHaveLength(1)
    expect(await db.syncQueue.count()).toBe(1)
    vi.spyOn(queue(), 'addOp').mockRejectedValueOnce(new Error('Synthetic delete failure'))
    await expect(useDailyGradeStore.getState().removeEntry(useDailyGradeStore.getState().entries[0].id)).rejects.toThrow('delete failure')
    expect(useDailyGradeStore.getState().entries).toHaveLength(1)
  })

  it('does not dispatch old intent before generation reset, or on an unavailable probe', async () => {
    await queue().addOp({ entity: 'notice', entityId: 'NC-OLD', operation: 'CREATE', payload: '{}' })
    const create = vi.spyOn(api, 'createNotice')
    vi.mocked(api.probePurgeVersion).mockResolvedValue(null)
    await runSyncFlow(true)
    expect(create).not.toHaveBeenCalled()
    expect(await db.syncQueue.count()).toBe(1)
    const clearing = vi.spyOn(reset, 'resetClientData').mockResolvedValue(undefined)
    vi.mocked(api.probePurgeVersion).mockResolvedValue(2)
    queue().setStatus('idle')
    await runSyncFlow(true)
    expect(clearing).toHaveBeenCalledWith(2)
    expect(create).not.toHaveBeenCalled()
  })

  it('keeps newer online notice intent behind an unsettled offline edit', async () => {
    let server = { id: 'NC-ORDER', title: 'Initial', content: 'Synthetic', author: 'Synthetic', date: '2026-09-19', priority: 'normal' }
    const update = vi.spyOn(api, 'updateNotice').mockRejectedValueOnce(new ApiError(0, 'Network error', '/notices'))
      .mockImplementation(async (_id, data) => { server = { ...server, ...data }; return server })
    useNoticeStore.setState({ notices: [server as never] })
    await useNoticeStore.getState().updateNotice('NC-ORDER', { title: 'Older' })
    await useNoticeStore.getState().updateNotice('NC-ORDER', { title: 'Newer' })
    expect(update).toHaveBeenCalledTimes(1)
    await runSyncFlow(true)
    expect(update).toHaveBeenCalledTimes(2)
    expect(server.title).toBe('Newer')
  })

  it('serializes a second notice edit behind an in-flight failure and keeps disjoint fields', async () => {
    const boundary = gate()
    const update = vi.spyOn(api, 'updateNotice').mockImplementationOnce(async () => {
      boundary.enter(); await boundary.blocked
      throw new ApiError(0, 'Network error', '/notices')
    }).mockResolvedValue({ id: 'NC-RACE', title: 'Older', content: 'Newer content' } as never)
    const first = useNoticeStore.getState().updateNotice('NC-RACE', { title: 'Older' })
    await boundary.entered
    const second = useNoticeStore.getState().updateNotice('NC-RACE', { content: 'Newer content' })
    boundary.release()
    await Promise.all([first, second])
    expect(update).toHaveBeenCalledTimes(1)
    const rows = await queue().getPendingOps()
    expect(rows).toHaveLength(1)
    expect(await payload(rows[0])).toMatchObject({ title: 'Older', content: 'Newer content' })
    await runSyncFlow(true)
    expect(update).toHaveBeenLastCalledWith('NC-RACE', { title: 'Older', content: 'Newer content' })
    expect(await db.syncQueue.count()).toBe(0)
  })

  it('does not overtake a permanently failed notice predecessor', async () => {
    const id = await queue().addOp({ entity: 'notice', entityId: 'NC-FAILED', operation: 'UPDATE', payload: JSON.stringify({ title: 'Older' }) })
    await queue().updateOp(id, { status: 'failed', lastError: 'Client error 400: review required', createdAt: '2026-01-01' })
    const update = vi.spyOn(api, 'updateNotice')
    await useNoticeStore.getState().updateNotice('NC-FAILED', { title: 'Newer' })
    await runSyncFlow(true)
    expect(update).not.toHaveBeenCalled()
    expect(await db.syncQueue.count()).toBe(2)
  })
})
