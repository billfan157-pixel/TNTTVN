import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db, client } from '../../server/src/db/index.js'
import { students, users } from '../../server/src/db/schema.js'
import { getStudents } from '../../server/src/services/studentService.js'
import noticesRouter from '../../server/src/routes/notices.js'
import gradesRouter from '../../server/src/routes/grades.js'
import { generateTokens } from '../../server/src/middleware/auth.js'
import { api, setTokens, clearTokens } from '../lib/api'
import { setTenantScope } from '../lib/tenantScope'
import { getDB } from '../lib/db'
import { useNoticeStore } from '../stores/noticeStore'
import { useSyncStore } from '../stores/syncStore'
import { useGradeStore } from '../stores/gradeStore'
import { flushGradeBatchWithIsolation } from '../lib/syncApply'
import { decryptQueueValue } from '../lib/offlineCipher'
import { captureTenantScope } from '../lib/tenantScope'
import { processOperation } from '../lib/syncProcessor'
import { notifyParishNotice } from '../../server/src/services/smartNotifications.js'

vi.mock('../../server/src/services/smartNotifications.js', () => ({ notifyParishNotice: vi.fn().mockResolvedValue(undefined) }))
const parishId = 'gia-ton'
const userId = 'AUDIT07-INTEGRATION'
const ids = ['A07-KEY-A', 'A07-KEY-B', 'A07-KEY-C']

beforeAll(async () => {
  await db.insert(users).values({ id: userId, parishId, username: userId,
    fullName: 'Synthetic Audit07', role: 'admin', status: 'ACTIVE', passwordHash: 'test-only' })
  await db.insert(students).values(ids.map(id => ({ id, code: id, parishId,
    holyName: 'Synthetic', fullName: id, gender: 'Nam' as const, dateOfBirth: '2090-01-01',
    parentName: 'Synthetic', parentPhone: '0000000000', address: 'Synthetic',
    branch: 'AuNhi' as const, classId: 'AU1', updatedAt: '2100-01-02T00:00:00.000Z' })))
})
afterEach(() => { clearTokens(); setTenantScope(null); vi.restoreAllMocks() })
afterAll(async () => {
  await client.execute({ sql: 'DELETE FROM grades WHERE parish_id = ? AND student_id IN (?, ?, ?)', args: [parishId, ...ids] })
  await client.execute({ sql: 'DELETE FROM students WHERE parish_id = ? AND id IN (?, ?, ?)', args: [parishId, ...ids] })
  await client.execute({ sql: 'DELETE FROM audit_logs WHERE user_id = ?', args: [userId] })
  await client.execute({ sql: 'DELETE FROM notices WHERE updated_by = ?', args: [userId] })
  await client.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] })
  await getDB().syncQueue.where('userId').equals(userId).delete()
})

describe('Audit07 real persistence convergence', () => {
  it('preserves unedited database scores across a real route conflict and patch retry', async () => {
    const token = generateTokens({ userId, username: userId, role: 'admin', parishId }).accessToken
    setTenantScope({ userId, parishId }); setTokens(token)
    await getDB().syncQueue.clear()
    const requestGrade = async (path: string, data: unknown) => {
      const response = await gradesRouter.request(path, { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const body = await response.json() as { data: any }
      expect(response.status, JSON.stringify(body)).toBe(200)
      return body.data
    }
    const initial = await requestGrade('/', { studentId: ids[1], academicYear: '2025-2026', semester: 1,
      scoreOral: 6, scoreMidterm: 5, scoreFinal: 7 })
    useGradeStore.setState({ grades: [initial] })
    await useGradeStore.getState().upsertGrade({ studentId: ids[1], academicYear: '2025-2026', semester: 1, scoreMidterm: 8 })
    // Another client commits after our local edit but before delivery. This
    // deliberately exercises stale-version replay, not simultaneous DB writes.
    const newer = await requestGrade('/', { studentId: ids[1], academicYear: '2025-2026', semester: 1,
      scoreFinal: 9, version: initial.version })
    expect(newer.scoreOral).toBe(6)
    vi.spyOn(api, 'batchUpsertGrades').mockImplementation(data => requestGrade('/batch', { grades: data }))
    const state = { mergedConflictCount: 0 }
    for (let attempt = 0; attempt < 2; attempt++) {
      const store = useSyncStore.getState()
      const [pending] = await store.getPendingOps()
      expect(pending).toBeDefined()
      const claimed = await store.claimOp(pending.id)
      const patch = JSON.parse((await decryptQueueValue(claimed!.payload))!)
      expect(patch).not.toHaveProperty('scoreFinal')
      expect(patch).not.toHaveProperty('scoreOral')
      await flushGradeBatchWithIsolation([patch], [claimed!], store, state, captureTenantScope()!)
    }
    expect(state.mergedConflictCount).toBe(1)
    expect(await useSyncStore.getState().getPendingOps()).toHaveLength(0)
    const saved = (await client.execute({
      sql: 'SELECT score_oral, score_midterm, score_final, version FROM grades WHERE parish_id = ? AND student_id = ? AND semester = 1',
      args: [parishId, ids[1]],
    })).rows[0]
    expect(saved).toMatchObject({ score_oral: 6, score_midterm: 8, score_final: 9 })
    const cleared = await requestGrade('/', { studentId: ids[1], academicYear: '2025-2026', semester: 1,
      scoreMidterm: null, version: saved.version })
    expect(cleared).toMatchObject({ scoreOral: 6, scoreMidterm: null, scoreFinal: 9 })
  })

  it('finishes a keyset delta after an already-read row moves beyond the watermark', async () => {
    const lower = '2100-01-01T00:00:00.000Z', upper = '2100-01-03T00:00:00.000Z'
    const first = await getStudents(parishId, lower, 2, 1, upper, '')
    expect(first.data.map(row => row.id)).toEqual(ids.slice(0, 2))
    // A real committed mutation changes the window BETWEEN page requests.
    await client.execute({ sql: 'UPDATE students SET updated_at = ? WHERE id = ? AND parish_id = ?', args: ['2100-01-04T00:00:00.000Z', ids[0], parishId] })
    const second = await getStudents(parishId, lower, 2, 1, upper, first.data[1].id)
    expect(second.data.map(row => row.id)).toEqual([ids[2]])
    expect((await getStudents(parishId, upper, 2, 1, '2100-01-05T00:00:00.000Z', '')).data.map(row => row.id)).toEqual([ids[0]])
    expect((await getStudents('other-parish', lower, 2, 1, upper, '')).data).toEqual([])
  })

  it('replays a lost direct CREATE acknowledgement through the durable queue without a second row or notification', async () => {
    const token = generateTokens({ userId, username: userId, role: 'admin', parishId }).accessToken
    setTenantScope({ userId, parishId }); setTokens(token)
    await getDB().syncQueue.clear()
    const committedIds: string[] = []
    vi.spyOn(api, 'createNotice').mockImplementation(async data => {
      const response = await noticesRouter.request('/', { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      expect(response.status).toBe(201)
      const body = await response.json() as { data: { id: string } }
      committedIds.push(body.data.id)
      if (committedIds.length === 1) throw new TypeError('Failed to fetch after server commit')
      return body.data as never
    })
    const local = await useNoticeStore.getState().createNotice({ title: 'Synthetic ACK loss', content: 'Synthetic',
      date: '2026-09-19', author: 'Synthetic', priority: 'normal' } as never)
    const [op] = await useSyncStore.getState().getPendingOps()
    expect(op.entityId).toBe(local.id)
    expect(await processOperation(op)).toMatchObject({ ok: true, data: { id: committedIds[0] } })
    expect(committedIds).toEqual([committedIds[0], committedIds[0]])
    expect((await client.execute({ sql: 'SELECT id FROM notices WHERE idempotency_key = ? AND parish_id = ?', args: [local.id, parishId] })).rows).toHaveLength(1)
    expect((await client.execute({ sql: 'SELECT id FROM audit_logs WHERE parish_id = ? AND user_id = ? AND entity_type = ? AND entity_id = ? AND action = ?', args: [parishId, userId, 'notice', committedIds[0], 'CREATE'] })).rows).toHaveLength(1)
    expect(notifyParishNotice).toHaveBeenCalledTimes(1)
  })
})
