import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import backupRouter from '../routes/backup.js'
import { db } from '../db/index.js'
import { academicYears, auditLogs, branches, classes, students, users } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'

const parishA = 'backup-restore-domain2-a'
const parishB = 'backup-restore-domain2-b'
const adminId = 'usr-backup-restore-domain2-admin'
const branchId = 'br-backup-restore-domain2-shared'
const yearId = 'ay-backup-restore-domain2-shared'
const classId = 'cl-backup-restore-domain2-shared'
const studentId = 'st-backup-restore-domain2-shared'
const password = 'BackupRestore@123'

const { accessToken } = generateTokens({
  userId: adminId,
  username: 'backup_restore_domain2_admin',
  role: 'admin',
  parishId: parishA,
  tokenVersion: 1,
})

async function cleanupParish(parishId: string): Promise<void> {
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(students).where(eq(students.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
  await db.delete(branches).where(eq(branches.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
}

async function seedTenant(parishId: string, suffix: string): Promise<void> {
  await db.insert(branches).values({
    id: branchId,
    parishId,
    name: `Backup Restore Branch ${suffix}`,
    scarfColor: 'Xanh',
    ageMin: 6,
    ageMax: 9,
  })

  await db.insert(academicYears).values({
    id: yearId,
    parishId,
    startDate: '2026-09-01',
    endDate: '2027-05-31',
  })

  await db.insert(classes).values({
    id: classId,
    parishId,
    code: 'BK-RESTORE-D2',
    name: `Backup Restore Class ${suffix}`,
    branchId,
    academicYearId: yearId,
    idempotencyKey: 'backup-restore-domain2-shared-key',
  })

  await db.insert(students).values({
    id: studentId,
    parishId,
    code: 'BK-RESTORE-STUDENT',
    holyName: 'Giuse',
    fullName: `Backup Restore Student ${suffix}`,
    gender: 'Nam',
    dateOfBirth: '2015-01-01',
    parentName: 'Backup Parent',
    parentPhone: '0900123456',
    address: 'Test',
    branch: 'AuNhi',
    classId,
  })
}

describe('Backup restore tenant-local ID isolation', () => {
  beforeAll(async () => {
    await cleanupParish(parishA)
    await cleanupParish(parishB)
    await seedTenant(parishA, 'A')
    await seedTenant(parishB, 'B')

    await db.insert(users).values({
      id: adminId,
      parishId: parishA,
      username: 'backup_restore_domain2_admin',
      passwordHash: await bcrypt.hash(password, 4),
      fullName: 'Backup Restore Domain 2 Admin',
      role: 'admin',
      status: 'ACTIVE',
      tokenVersion: 1,
    })
  })

  afterAll(async () => {
    await cleanupParish(parishA)
    await cleanupParish(parishB)
  })

  it('restores parish A when parish B owns the same class and student IDs', async () => {
    const exportRes = await backupRouter.request('/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ adminPassword: password }),
    })

    expect(exportRes.status).toBe(200)
    const snapshot = (await exportRes.json()) as any
    expect(snapshot.data.classes.some((row: any) => row.id === classId)).toBe(true)
    expect(snapshot.data.students.some((row: any) => row.id === studentId)).toBe(true)

    const restoreRes = await backupRouter.request('/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ ...snapshot, adminPassword: password }),
    })

    expect(restoreRes.status).toBe(200)

    const [studentA] = await db
      .select({ fullName: students.fullName })
      .from(students)
      .where(and(eq(students.parishId, parishA), eq(students.id, studentId)))
      .limit(1)
    const [studentB] = await db
      .select({ fullName: students.fullName })
      .from(students)
      .where(and(eq(students.parishId, parishB), eq(students.id, studentId)))
      .limit(1)

    expect(studentA?.fullName).toBe('Backup Restore Student A')
    expect(studentB?.fullName).toBe('Backup Restore Student B')
  })
})
