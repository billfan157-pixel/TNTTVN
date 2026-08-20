import { beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import authApp from '../routes/auth.js'
import { db } from '../db/index.js'
import { academicYears, branches, classes, students, users } from '../db/schema.js'

const OLD_PASSWORD = 'OldPass1!'
const NEW_PASSWORD = 'NewPass2!'

async function seedParish(params: {
  parishId: string
  parentId: string
  username: string
  phone: string
  childId: string
  childDob: string
  childHolyName: string
  childFullName: string
  suffix: string
}) {
  const now = new Date().toISOString()
  const branchId = `BR-${params.suffix}`
  const yearId = `AY-${params.suffix}`
  const classId = `CLS-${params.suffix}`

  await db.insert(branches).values({
    id: branchId,
    name: `Branch ${params.suffix}`,
    scarfColor: '#000000',
    ageMin: 8,
    ageMax: 18,
    parishId: params.parishId,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing()

  await db.insert(academicYears).values({
    id: yearId,
    startDate: '2026-08-01',
    endDate: '2027-05-31',
    isLocked: 0,
    status: 'OPEN',
    currentSemester: 1,
    parishId: params.parishId,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing()

  await db.insert(classes).values({
    id: classId,
    code: `C-${params.suffix}`,
    name: `Class ${params.suffix}`,
    branchId,
    academicYearId: yearId,
    parishId: params.parishId,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing()

  const passwordHash = await bcrypt.hash(OLD_PASSWORD, 4)
  await db.insert(users).values({
    id: params.parentId,
    username: params.username,
    passwordHash,
    fullName: `Parent ${params.suffix}`,
    phone: params.phone,
    role: 'phuhuynh',
    status: 'ACTIVE',
    tokenVersion: 1,
    mustChangePassword: 0,
    parishId: params.parishId,
    createdAt: now,
  }).onConflictDoNothing()

  await db.update(users)
    .set({ passwordHash, tokenVersion: 1, status: 'ACTIVE', failedAttempts: 0 })
    .where(and(eq(users.id, params.parentId), eq(users.parishId, params.parishId)))

  await db.insert(students).values({
    id: params.childId,
    code: `ST-${params.suffix}`,
    holyName: params.childHolyName,
    fullName: params.childFullName,
    gender: 'Nam',
    dateOfBirth: params.childDob,
    parentName: `Parent ${params.suffix}`,
    parentPhone: params.phone,
    address: 'Test address',
    branch: 'ThieuNhi',
    classId,
    status: 'Đang học',
    parishId: params.parishId,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing()
}

async function readParent(parentId: string, parishId: string) {
  const [row] = await db.select().from(users).where(and(eq(users.id, parentId), eq(users.parishId, parishId))).limit(1)
  if (!row) throw new Error(`Missing seeded parent ${parishId}/${parentId}`)
  return row
}

describe('parent password reset tenant isolation', () => {
  beforeAll(async () => {
    await seedParish({
      parishId: 'parent-reset-a', parentId: 'PARENT-A', username: 'parent-a', phone: '0912345678',
      childId: 'CHILD-A', childDob: '2015-01-02', childHolyName: 'Phêrô', childFullName: 'Nguyễn Văn An', suffix: 'PRA',
    })
    await seedParish({
      parishId: 'parent-reset-b', parentId: 'PARENT-B', username: 'parent-b', phone: '0912345678',
      childId: 'CHILD-B', childDob: '2016-03-04', childHolyName: 'Phaolô', childFullName: 'Trần Văn Bình', suffix: 'PRB',
    })
    await seedParish({
      parishId: 'parent-reset-c', parentId: 'PARENT-C', username: 'parent-c', phone: '0987654321',
      childId: 'CHILD-C', childDob: '2014-05-06', childHolyName: 'Maria', childFullName: 'Lê Minh Châu', suffix: 'PRC',
    })
    await seedParish({
      parishId: 'parent-reset-d', parentId: 'PARENT-D', username: 'parent-d', phone: '0987654321',
      childId: 'CHILD-D', childDob: '2014-05-06', childHolyName: 'Maria', childFullName: 'Lê Minh Châu', suffix: 'PRD',
    })
  })

  it('resets only the unique parish whose child evidence matches', async () => {
    const res = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.21.0.1' },
      body: JSON.stringify({
        phone: '0912345678',
        childDob: '02/01/2015',
        childName: 'Phêrô',
        newPassword: NEW_PASSWORD,
      }),
    })

    expect(res.status).toBe(200)
    const parentA = await readParent('PARENT-A', 'parent-reset-a')
    const parentB = await readParent('PARENT-B', 'parent-reset-b')
    expect(await bcrypt.compare(NEW_PASSWORD, parentA.passwordHash)).toBe(true)
    expect(parentA.tokenVersion).toBe(2)
    expect(await bcrypt.compare(OLD_PASSWORD, parentB.passwordHash)).toBe(true)
    expect(parentB.tokenVersion).toBe(1)
  })

  it('fails closed when identical verification evidence matches more than one parish', async () => {
    const beforeC = await readParent('PARENT-C', 'parent-reset-c')
    const beforeD = await readParent('PARENT-D', 'parent-reset-d')

    const res = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.21.0.2' },
      body: JSON.stringify({
        phone: '0987654321',
        childDob: '2014-05-06',
        childName: 'Maria',
        newPassword: NEW_PASSWORD,
      }),
    })

    expect(res.status).toBe(400)
    const afterC = await readParent('PARENT-C', 'parent-reset-c')
    const afterD = await readParent('PARENT-D', 'parent-reset-d')
    expect(afterC.passwordHash).toBe(beforeC.passwordHash)
    expect(afterD.passwordHash).toBe(beforeD.passwordHash)
    expect(afterC.tokenVersion).toBe(1)
    expect(afterD.tokenVersion).toBe(1)
  })
})
