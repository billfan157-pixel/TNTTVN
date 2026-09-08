import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db } from '../../server/src/db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, assessmentEntries } from '../../server/src/db/schema.js'
import auth from '../../server/src/routes/auth.js'
import userRoutes from '../../server/src/routes/users.js'
import dailyRoutes from '../../server/src/routes/dailyEntries.js'
import { generateTokens } from '../../server/src/middleware/auth.js'
import { resetUserPassword, updateUserStatus, forceLogoutUser } from '../../server/src/services/userService.js'
import { removeUserFromClass } from '../../server/src/services/classService.js'
// No real push network requests; actual DB and delivery selection remain.
vi.mock('../../server/src/services/appPushService.js', () => ({ sendAppPushToParish: vi.fn(), sendAppPushToUsers: vi.fn() }))

const P = 'hardening-decision-lab'
const password = 'SyntheticOnly@123'
const app = new Hono().route('/api/auth', auth).route('/api/users', userRoutes).route('/api/daily-entries', dailyRoutes)
const token = (id: string, role: 'admin' | 'chunhiem' | 'phuhuynh', version?: number) => generateTokens({ userId: id, username: id, parishId: P, role, ...(version === undefined ? {} : { tokenVersion: version }) }).accessToken
const req = (path: string, bearer: string, body?: unknown, method = 'POST') => app.request(path, {
  method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
async function interleave<T>(before: () => Promise<void>, action: () => Promise<T>) {
  const original = db.transaction.bind(db)
  let ran = false
  const spy = vi.spyOn(db, 'transaction').mockImplementation(async (callback, config) => {
    if (!ran) { ran = true; await before() }
    return original(callback, config)
  })
  try { const result = await action(); expect(ran).toBe(true); return result } finally { spy.mockRestore() }
}

beforeAll(async () => {
  const hash = await bcrypt.hash(password, 10)
  await db.insert(users).values([
    { id: 'admin', username: 'admin', fullName: 'Synthetic Admin', parishId: P, role: 'admin', passwordHash: hash },
    { id: 'racing-admin', username: 'racing-admin', fullName: 'Synthetic Admin2', parishId: P, role: 'admin', passwordHash: hash },
    { id: 'legacy', username: 'legacy', fullName: 'Synthetic Legacy', parishId: P, role: 'chunhiem', passwordHash: hash },
    { id: 'versionless', username: 'versionless', fullName: 'Synthetic Versionless', parishId: P, role: 'chunhiem', passwordHash: hash },
    { id: 'teacher', username: 'teacher', fullName: 'Synthetic Teacher', parishId: P, role: 'chunhiem', passwordHash: hash },
    { id: 'parent', username: '0900000201', fullName: 'Synthetic Parent', parishId: P, role: 'phuhuynh', passwordHash: hash, phone: '0900000201' },
  ])
  await db.insert(branches).values({ id: 'branch', parishId: P, name: 'Synthetic', scarfColor: 'Xanh', ageMin: 6, ageMax: 12 })
  await db.insert(academicYears).values({ id: '2025-2026', parishId: P, startDate: '2025-09-01', endDate: '2026-06-30' })
  await db.insert(classes).values({ id: 'class', parishId: P, code: 'LAB', name: 'Synthetic Class', branchId: 'branch', academicYearId: '2025-2026' })
  await db.insert(students).values({ id: 'child', parishId: P, code: 'LAB', fullName: 'Synthetic Child', holyName: 'Giuse', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Synthetic Parent', parentPhone: '0900000201', address: 'Synthetic', branch: 'AuNhi', classId: 'class' })
  await db.insert(catechistAssignments).values({ id: 'assignment', parishId: P, classId: 'class', userId: 'teacher', roleInClass: 'chunhiem' })
})
afterAll(async () => {
  const { stopNotificationQueue } = await import('../../server/src/services/notificationQueue.js')
  await stopNotificationQueue()
  vi.unstubAllEnvs()
})

describe('Research-only gap reproduction; PASS does not mean secure', () => {
  it('H2: a synthetically issued versionless token survives force logout unlike a versioned control', async () => {
    const legacy = token('versionless', 'chunhiem')
    const versioned = token('versionless', 'chunhiem', 1)
    await forceLogoutUser('versionless', 'admin', P, 'lab', 'lab')
    expect((await req('/api/auth/me', versioned, undefined, 'GET')).status).toBe(401)
    expect((await req('/api/auth/me', legacy, undefined, 'GET')).status).toBe(200)
  })

  it('H8: legacy-cost login rehash restores old password after real reset commits', async () => {
    let resetPassword = ''
    const response = await interleave(async () => {
      const reset = await resetUserPassword('legacy', 'admin', P, 'lab', 'lab')
      expect(reset).not.toBeNull(); resetPassword = reset!.tempPassword
    }, () => req('/api/auth/login', '', { username: 'legacy', parishId: P, password }))
    expect(response.status).toBe(200)
    const [row] = await db.select().from(users).where(and(eq(users.parishId, P), eq(users.id, 'legacy')))
    expect(row).toMatchObject({ status: 'FORCE_PASSWORD_CHANGE', tokenVersion: 2 })
    expect(await bcrypt.compare(password, row.passwordHash)).toBe(true)
    expect(await bcrypt.compare(resetPassword, row.passwordHash)).toBe(false)
    const freshLogin = await req('/api/auth/login', '', { username: 'legacy', parishId: P, password })
    expect(freshLogin.status).toBe(200)
  })

  it('H8: admin creation still commits after reauthenticated caller is locked before command transaction', async () => {
    const response = await interleave(
      async () => { await updateUserStatus('racing-admin', 'LOCKED', 'admin', P, 'lab', 'lab') },
      () => req('/api/users', token('racing-admin', 'admin', 1), { username: 'post-revoke-admin', fullName: 'Synthetic New Admin', role: 'admin', adminPassword: password }),
    )
    expect(response.status).toBe(201)
    const [row] = await db.select().from(users).where(and(eq(users.parishId, P), eq(users.username, 'post-revoke-admin')))
    expect(row.role).toBe('admin')
    expect((await req('/api/auth/me', token('racing-admin', 'admin', 1), undefined, 'GET')).status).toBe(401)
  })

  it('H3: daily entry commits after its captured class assignment is revoked', async () => {
    const response = await interleave(
      async () => { await removeUserFromClass('class', 'teacher', 'admin', P, 'lab', 'lab') },
      () => req('/api/daily-entries/batch', token('teacher', 'chunhiem', 1), { entries: [{ id: 'post-revoke-entry', studentId: 'child', academicYear: '2025-2026', semester: 2, scoreType: 'oral', value: 9, date: '2026-03-01' }] }),
    )
    expect(response.status).toBe(200)
    expect((await response.json() as any).data.saved).toBe(1)
    expect(await db.select().from(assessmentEntries).where(and(eq(assessmentEntries.parishId, P), eq(assessmentEntries.id, 'post-revoke-entry')))).toHaveLength(1)
  })

})
