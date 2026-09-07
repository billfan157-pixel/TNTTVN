import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))
vi.mock('../router', () => ({ router: {} }))

import { api } from '../lib/api'
import { dexieStorage, getDB, initDB } from '../lib/db'
import { flushAcademicCache } from '../lib/academicPull'
import { setTenantScope } from '../lib/tenantScope'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { syncUpsertGrade, syncSaveAttendance } from '../lib/syncService'
import { academicPullFixture } from './helpers/academicPull'

let sequence = 0
beforeEach(async () => {
  await initDB()
  const owner = { parishId: `scope-cache-${++sequence}`, userId: 'teacher' }
  setTenantScope(owner)
  localStorage.setItem('parish_current_user', JSON.stringify({ id: owner.userId, parishId: owner.parishId, role: 'chunhiem' }))
  await getDB().syncQueue.clear()
  useGradeStore.setState({ grades: [], syncScopeRevision: null })
  useAttendanceStore.setState({ attendance: [], syncScopeRevision: null })
  await flushAcademicCache('parish_store_grades')
  await flushAcademicCache('parish_store_attendance')
})
afterEach(() => { vi.restoreAllMocks(); setTenantScope(null) })

const cases = [
  {
    entity: 'grade', cache: 'parish_store_grades', field: 'grades', method: 'pullGrades' as const,
    row: (id: string) => ({ id, studentId: id, semester: 1, academicYear: '2026-2027', scoreFinal: 8 }),
    set: (rows: any[]) => useGradeStore.setState({ grades: rows }),
    rows: () => useGradeStore.getState().grades,
    fetch: () => useGradeStore.getState().fetchGrades('2026-08-01', true),
    enqueue: (id: string) => syncUpsertGrade({ studentId: id, semester: 1, academicYear: '2026-2027', scoreFinal: 9 }),
  },
  {
    entity: 'attendance', cache: 'parish_store_attendance', field: 'attendance', method: 'pullAttendance' as const,
    row: (id: string) => ({ id, studentId: id, date: '2026-08-02', type: 'SundayMass', status: 'Present' }),
    set: (rows: any[]) => useAttendanceStore.setState({ attendance: rows }),
    rows: () => useAttendanceStore.getState().attendance,
    fetch: () => useAttendanceStore.getState().fetchAttendance('2026-08-01', true),
    enqueue: (id: string) => syncSaveAttendance({ studentId: id, date: '2026-08-02', type: 'SundayMass', status: 'AbsentExcused' }),
  },
]

describe.each(cases)('XD-06 $entity cache', c => {
  it('retracts revoked rows durably, keeps allowed pending edits, and never deletes queued intent', async () => {
    c.set([c.row('revoked'), c.row('allowed')])
    await c.enqueue('revoked')
    await c.enqueue('allowed')
    const queue = await getDB().syncQueue.toArray()
    vi.spyOn(api, c.method).mockResolvedValue(academicPullFixture([], ['allowed']))
    await c.fetch()
    expect(c.rows().map(row => row.studentId)).toEqual(['allowed'])
    expect(await getDB().syncQueue.toArray()).toEqual(queue)
    const persisted = JSON.parse((await dexieStorage.getItem(c.cache))!)
    expect(persisted.state[c.field].map((row: any) => row.studentId)).toEqual(['allowed'])
    expect(persisted.version).toBe(2)
    const raw = await getDB().stores.get(`${c.cache}:${JSON.parse(localStorage.getItem('parish_current_user')!).parishId}:teacher`)
    expect(raw?.value).not.toContain('revoked')
  })

  it('rejects a delayed earlier response after a newer pull retracts the scope', async () => {
    let release!: (value: any) => void
    const delayed = new Promise<any>(resolve => { release = resolve })
    const spy = vi.spyOn(api, c.method).mockReturnValueOnce(delayed).mockResolvedValueOnce(academicPullFixture([]))
    const old = c.fetch()
    const rejected = expect(old).rejects.toThrow('Stale academic pull')
    await c.fetch()
    release(academicPullFixture([c.row('revoked')]))
    await rejected
    expect(c.rows()).toEqual([])
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('rejects a response crossing a user boundary, including re-login with the same IDs', async () => {
    let release!: (value: any) => void
    vi.spyOn(api, c.method).mockReturnValue(new Promise<any>(resolve => { release = resolve }))
    const old = c.fetch()
    const rejected = expect(old).rejects.toThrow('Stale academic pull')
    const user = JSON.parse(localStorage.getItem('parish_current_user')!)
    setTenantScope(null)
    setTenantScope({ parishId: user.parishId, userId: user.id })
    release(academicPullFixture([c.row('revoked')]))
    await rejected
    expect(c.rows()).toEqual([])
  })

  it.each([
    [],
    { ...academicPullFixture([]), mode: 'delta' },
    academicPullFixture([{ studentId: 'outside' }], []),
  ])('does not acknowledge a missing, inconsistent or out-of-scope contract', async bad => {
    vi.spyOn(api, c.method).mockResolvedValue(bad as any)
    await expect(c.fetch()).rejects.toThrow()
    expect(c.rows()).toEqual([])
  })

  it('fails the pull if cache persistence fails, then retries without losing pending operations', async () => {
    c.set([c.row('revoked')])
    await flushAcademicCache(c.cache)
    await c.enqueue('revoked')
    vi.spyOn(api, c.method).mockResolvedValue(academicPullFixture([]))
    const failure = vi.spyOn(dexieStorage, 'setItem').mockRejectedValue(new Error('synthetic quota'))
    await expect(c.fetch()).rejects.toThrow('synthetic quota')
    await flushAcademicCache(c.cache).catch(() => {})
    failure.mockRestore()
    expect(await getDB().syncQueue.count()).toBe(1)
    await c.fetch()
    expect(JSON.parse((await dexieStorage.getItem(c.cache))!).state[c.field]).toEqual([])
    expect(await getDB().syncQueue.count()).toBe(1)
  })
})

it('version-1 academic read cache is retired without touching encrypted mutation ownership', async () => {
  await syncUpsertGrade({ studentId: 'pending', semester: 1, scoreFinal: 8 })
  await dexieStorage.setItem('parish_store_grades', JSON.stringify({ version: 1, state: { grades: [{ studentId: 'revoked' }] } }))
  await useGradeStore.persist.rehydrate()
  expect(useGradeStore.getState().grades).toEqual([])
  expect(useGradeStore.getState().syncScopeRevision).toBeNull()
  expect(await getDB().syncQueue.count()).toBe(1)
})
