import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db, client } from '../db/index.js'
import { users, branches, academicYears, classes, students, auditLogs } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'
import backupRouter from '../routes/backup.js'

let sequence = 0
async function fixture() {
  const parishId = `export-snapshot-${Date.now()}-${++sequence}`, password = 'Synthetic-Only-123'
  await db.insert(users).values({ id: 'admin', parishId, username: 'synthetic', fullName: 'Synthetic', role: 'admin', passwordHash: await bcrypt.hash(password, 4), tokenVersion: 1 })
  await db.insert(branches).values({ id: 'branch', parishId, name: 'Synthetic', scarfColor: 'green', ageMin: 7, ageMax: 10 })
  await db.insert(academicYears).values({ id: '2026-2027', parishId, startDate: '2026-08-01', endDate: '2027-07-31' })
  await db.insert(classes).values({ id: 'class', parishId, code: 'C1', name: 'Before capture', branchId: 'branch', academicYearId: '2026-2027' })
  const profile = { parishId, holyName: 'Synthetic', fullName: 'Before capture', gender: 'Nam' as const, dateOfBirth: '2015-01-01', parentName: 'Synthetic', parentPhone: '0901234567', address: 'Synthetic', branch: 'ThieuNhi' as const, classId: 'class' }
  const token = generateTokens({ userId: 'admin', parishId, role: 'admin', username: 'synthetic', tokenVersion: 1 }).accessToken
  return { parishId, profile, export: () => backupRouter.request('/export', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPassword: password }) }) }
}

describe('DR-P2-004 point-in-time academic export', () => {
  beforeEach(async () => { await client.execute("DELETE FROM rate_limits WHERE key = 'admin-reauth:unknown'") })
  afterEach(() => vi.restoreAllMocks())

  it('captures all 14 tables once before streaming, including more than the old page size', async () => {
    const f = await fixture(), other = await fixture()
    for (let start = 0; start < 2001; start += 50) {
      await db.insert(students).values(Array.from({ length: Math.min(50, 2001 - start) }, (_, i) => ({ ...f.profile, id: `S${String(start + i).padStart(4, '0')}`, code: `S${start + i}` })))
    }
    await db.insert(students).values({ ...other.profile, id: 'foreign', code: 'FOREIGN' })
    const original = db.transaction.bind(db)
    let capturedReads = 0, injected = false
    vi.spyOn(db, 'transaction').mockImplementationOnce(async callback => {
      const result = await original(async tx => {
        const select = tx.select.bind(tx) as unknown as (...args: any[]) => any
        vi.spyOn(tx, 'select').mockImplementation((...args: any[]) => { capturedReads++; return select(...args) })
        return callback(tx)
      })
      // A committed parent + child edit before response serialization must not
      // mix either new value into the transaction's frozen output.
      await original(async tx => {
        await tx.update(students).set({ fullName: 'After capture' }).where(eq(students.parishId, f.parishId))
        await tx.update(classes).set({ name: 'After capture' }).where(eq(classes.parishId, f.parishId))
      })
      injected = true
      return result
    })
    const response = await f.export()
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(injected).toBe(true)
    expect(capturedReads).toBe(14)
    expect(body.version).toBe('2.1-question-bank')
    expect(body.data.students).toHaveLength(2001)
    expect(new Set(body.data.students.map((row: any) => row.id)).size).toBe(2001)
    expect(body.data.students.every((row: any) => row.parishId === f.parishId && row.fullName === 'Before capture')).toBe(true)
    expect(body.data.classes[0].name).toBe('Before capture')
    expect(body.checksum).toBe(createHash('sha256').update(JSON.stringify(body.data)).digest('hex'))
    expect(body.counts.students).toBe(2001)
    expect((await db.select().from(classes).where(eq(classes.parishId, f.parishId)))[0].name).toBe('After capture')
  })

  it('returns failure before publishing a partial success-shaped download when capture fails', async () => {
    const f = await fixture()
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('Synthetic capture failure'))
    const response = await f.export()
    expect(response.status).toBe(500)
    expect(response.headers.get('Content-Disposition')).toBeNull()
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, f.parishId), eq(auditLogs.action, 'EXPORT_BACKUP')))).toHaveLength(0)
  })
})
