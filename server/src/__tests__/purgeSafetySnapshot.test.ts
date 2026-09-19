import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db, client } from '../db/index.js'
import { users, branches, academicYears, classes, students, examSessions, assessmentEntries, examFinalizations, examFinalizationItems, leaveRequests, studentFeeRecords, auditLogs, systemSettings } from '../db/schema.js'
import { PURGE_TABLES, PURGE_VERSION_KEY, purgeParishData } from '../services/purgeService.js'
import * as safety from '../services/safetySnapshot.js'
import { getObject } from '../services/blobStorage.js'
import { captureAdminReauth } from '../services/userService.js'
import { generateTokens } from '../middleware/auth.js'
import systemRouter from '../routes/system.js'

const publish = safety.writeSafetySnapshot
let sequence = 0
async function fixture() {
  const parishId = `purge-safety-${Date.now()}-${++sequence}`, password = 'Synthetic-Only-123'
  await db.insert(users).values({ id: 'admin', parishId, username: 'synthetic', fullName: 'Synthetic', passwordHash: await bcrypt.hash(password, 4), role: 'admin', status: 'ACTIVE', tokenVersion: 1 })
  await db.insert(branches).values({ id: 'branch', parishId, name: 'Synthetic', scarfColor: 'green', ageMin: 7, ageMax: 10 })
  await db.insert(academicYears).values({ id: '2026-2027', parishId, startDate: '2026-08-01', endDate: '2027-07-31' })
  await db.insert(classes).values({ id: 'class', parishId, code: 'C1', name: 'Synthetic', branchId: 'branch', academicYearId: '2026-2027' })
  await db.insert(students).values({ id: 'student', parishId, code: 'S1', holyName: 'Synthetic', fullName: 'Synthetic', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Synthetic', parentPhone: '0901234567', address: 'Synthetic', branch: 'ThieuNhi', classId: 'class' })
  const proof = await captureAdminReauth('admin', password, parishId, 'synthetic', 'Vitest', parishId, 'SYSTEM_PURGE_FAILED', 1)
  expect(proof).toBeTruthy()
  const token = generateTokens({ userId: 'admin', parishId, username: 'synthetic', role: 'admin', tokenVersion: 1 }).accessToken
  return {
    parishId,
    purge: () => purgeParishData({ parishId, userId: 'admin', reauth: proof! }),
    request: () => systemRouter.request('/purge', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password, confirmKey: 'XÓA TẤT CẢ' }) }),
  }
}

describe('DR safety snapshot coverage and destructive-state fence', () => {
  beforeEach(async () => { await client.execute("DELETE FROM rate_limits WHERE key IN ('admin-reauth:synthetic', 'admin-reauth:unknown', 'purge:unknown')") })
  afterEach(() => vi.restoreAllMocks())

  it('compares row multisets including values/duplicates, not SELECT/property order', () => {
    const baseline = { facts: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }], empty: [] }
    const digest = safety.safetySnapshotDigest(baseline)
    expect(() => safety.assertSafetySnapshotUnchanged(digest, { empty: [], facts: [{ value: 2, id: 'b' }, { value: 1, id: 'a' }] })).not.toThrow()
    for (const changed of [
      { ...baseline, facts: [{ id: 'a', value: 9 }, { id: 'b', value: 2 }] },
      { ...baseline, facts: [{ id: 'a', value: 1 }, { id: 'a', value: 1 }] },
      { facts: baseline.facts },
    ]) expect(() => safety.assertSafetySnapshotUnchanged(digest, changed)).toThrow(safety.SafetySnapshotStaleError)
  })

  it('persists every cascade-deleted fact, keeps tenant scope, and guards executable FK closure', async () => {
    const f = await fixture(), other = await fixture()
    await db.insert(examSessions).values({ id: 'exam', parishId: f.parishId, classId: 'class', subject: 'Synthetic', scoreType: 'oral', semester: 1, academicYear: '2026-2027', createdBy: 'admin' })
    await db.insert(assessmentEntries).values({ id: 'entry', parishId: f.parishId, studentId: 'student', examSessionId: 'exam', academicYear: '2026-2027', semester: 1, scoreType: 'oral', rawScore: 8, score: 8, source: 'exam_finalization', createdBy: 'admin' })
    await db.insert(examFinalizations).values({ id: 'receipt', parishId: f.parishId, examSessionId: 'exam', completedBy: 'admin', completedAt: new Date().toISOString() })
    await db.insert(examFinalizationItems).values({ id: 'item', parishId: f.parishId, finalizationId: 'receipt', examResultId: 'result', studentId: 'student', scoreField: 'oral', status: 'committed', rawScore: 8, finalScore: 8 })
    await db.insert(leaveRequests).values({ id: 'leave', parishId: f.parishId, studentId: 'student', classId: 'class', parentName: 'Synthetic', parentPhone: '0901234567', date: '2026-09-19', sessionTypes: '[]', reason: 'Synthetic' })
    await db.insert(studentFeeRecords).values({ id: 'fee', parishId: f.parishId, studentId: 'student', classId: 'class', academicYear: '2026-2027', title: 'Synthetic', expectedAmount: 100 })
    const affected = ['assessment_entries', 'exam_finalizations', 'exam_finalization_items', 'leave_requests', 'student_fee_records']
    const before: Record<string, unknown[]> = {}
    for (const name of affected) before[name] = (await client.execute({ sql: `SELECT * FROM ${name} WHERE parish_id = ?`, args: [f.parishId] })).rows
    let key = ''
    vi.spyOn(safety, 'writeSafetySnapshot').mockImplementationOnce(async (...args) => { key = await publish(...args); return key })
    const result = await f.purge()
    const payload = JSON.parse((await getObject(key))!.toString())
    for (const name of affected) {
      expect(payload.data[name], name).toEqual(JSON.parse(JSON.stringify(before[name])))
      expect(result.countsBefore[name], name).toBe(1)
      expect((await client.execute({ sql: `SELECT * FROM ${name} WHERE parish_id = ?`, args: [f.parishId] })).rows, name).toHaveLength(0)
    }
    expect(await db.select().from(students).where(eq(students.parishId, other.parishId))).toHaveLength(1)
    expect(await db.select().from(users).where(eq(users.parishId, f.parishId))).toHaveLength(1)
    for (const rows of Object.values(payload.data) as Array<Array<{ parish_id: string }>>) expect(rows.every(row => row.parish_id === f.parishId)).toBe(true)

    // New cascading dependencies must not silently outgrow the safety profile.
    const tables = (await client.execute("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows
    const edges: Array<{ child: string; parent: string }> = []
    for (const { name } of tables) {
      for (const fk of (await client.execute(`PRAGMA foreign_key_list("${name}")`)).rows) {
        if (['CASCADE', 'SET NULL', 'SET DEFAULT'].includes(String(fk.on_delete))) edges.push({ child: String(name), parent: String(fk.table) })
      }
    }
    const closure = new Set<string>(PURGE_TABLES)
    for (let size = -1; size !== closure.size;) {
      size = closure.size
      for (const edge of edges) if (closure.has(edge.parent)) closure.add(edge.child)
    }
    expect([...closure].filter(name => !(name in payload.data))).toEqual([])
  })

  it.each(['update', 'insert', 'delete'] as const)('rejects a stale snapshot after concurrent %s without advancing generation or success audit', async change => {
    const f = await fixture()
    let committed: unknown
    vi.spyOn(safety, 'writeSafetySnapshot').mockImplementationOnce(async (...args) => {
      const key = await publish(...args)
      if (change === 'update') await db.update(students).set({ fullName: 'Concurrent edit' }).where(eq(students.parishId, f.parishId))
      if (change === 'insert') {
        const [row] = await db.select().from(students).where(eq(students.parishId, f.parishId))
        await db.insert(students).values({ ...row, id: 'new', code: 'NEW' })
      }
      if (change === 'delete') await db.delete(students).where(eq(students.parishId, f.parishId))
      committed = await db.select().from(students).where(eq(students.parishId, f.parishId))
      return key
    })
    const response = await f.request()
    expect(response.status).toBe(409)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('SAFETY_SNAPSHOT_STALE')
    expect(await db.select().from(students).where(eq(students.parishId, f.parishId))).toEqual(committed)
    expect(await db.select().from(classes).where(eq(classes.parishId, f.parishId))).toHaveLength(1)
    expect(await db.select().from(systemSettings).where(and(eq(systemSettings.parishId, f.parishId), eq(systemSettings.key, PURGE_VERSION_KEY)))).toHaveLength(0)
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, f.parishId), eq(auditLogs.action, 'SYSTEM_PURGE')))).toHaveLength(0)
    await expect(f.purge()).resolves.toHaveProperty('purgeVersion')
  })

  it('retains the existing manual-ledger FK backstop instead of expanding purge deletion authority', async () => {
    const f = await fixture()
    await db.insert(assessmentEntries).values({ id: 'manual', parishId: f.parishId, studentId: 'student', academicYear: '2026-2027', semester: 1, scoreType: 'oral', rawScore: 8, score: 8, source: 'manual_entry', createdBy: 'admin' })
    await expect(f.purge()).rejects.toThrow()
    expect(await db.select().from(students).where(eq(students.parishId, f.parishId))).toHaveLength(1)
    expect(await db.select().from(assessmentEntries).where(eq(assessmentEntries.parishId, f.parishId))).toHaveLength(1)
  })

  it('also fences updates to cascade-only facts after publication', async () => {
    const f = await fixture()
    await db.insert(studentFeeRecords).values({ id: 'fee', parishId: f.parishId, studentId: 'student', classId: 'class', academicYear: '2026-2027', title: 'Synthetic', expectedAmount: 100 })
    vi.spyOn(safety, 'writeSafetySnapshot').mockImplementationOnce(async (...args) => {
      const key = await publish(...args)
      await db.update(studentFeeRecords).set({ paidAmount: 50 }).where(eq(studentFeeRecords.parishId, f.parishId))
      return key
    })
    await expect(f.purge()).rejects.toMatchObject({ code: 'SAFETY_SNAPSHOT_STALE' })
    expect(await db.select().from(students).where(eq(students.parishId, f.parishId))).toHaveLength(1)
    expect((await db.select().from(studentFeeRecords).where(eq(studentFeeRecords.parishId, f.parishId)))[0].paidAmount).toBe(50)
  })

  it('does not reject an unrelated parish write during publication', async () => {
    const f = await fixture(), other = await fixture()
    vi.spyOn(safety, 'writeSafetySnapshot').mockImplementationOnce(async (...args) => {
      const key = await publish(...args)
      await db.update(students).set({ fullName: 'Other parish edit' }).where(eq(students.parishId, other.parishId))
      return key
    })
    await expect(f.purge()).resolves.toHaveProperty('purgeVersion')
    expect((await db.select().from(students).where(eq(students.parishId, other.parishId)))[0].fullName).toBe('Other parish edit')
  })

  it('does not delete anything if safety publication fails', async () => {
    const f = await fixture()
    vi.spyOn(safety, 'writeSafetySnapshot').mockRejectedValueOnce(new Error('Synthetic storage failure'))
    await expect(f.purge()).rejects.toThrow('Synthetic storage failure')
    expect(await db.select().from(students).where(eq(students.parishId, f.parishId))).toHaveLength(1)
    expect(await db.select().from(systemSettings).where(eq(systemSettings.parishId, f.parishId))).toHaveLength(0)
  })
})
