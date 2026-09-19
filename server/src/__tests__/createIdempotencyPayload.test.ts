import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  academicYears,
  auditLogs,
  branches,
  classes,
  examSessions,
  notices,
  students,
  users,
} from '../db/schema.js'
import { createClass, updateClass } from '../services/classService.js'
import { createStudent, updateStudent } from '../services/studentService.js'
import { createNotice, updateNotice } from '../services/noticeService.js'
import { createExamSession } from '../services/examService.js'
import { CreateIdempotencyConflictError } from '../services/createIdempotency.js'
import classesRouter from '../routes/classes.js'
import { generateTokens } from '../middleware/auth.js'

const parishId = 'parish-create-idempotency'
const userId = 'usr-create-idempotency'
const yearId = '2098-2099'
const branchId = 'branch-create-idempotency'

async function cleanup() {
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(examSessions).where(eq(examSessions.parishId, parishId))
  await db.delete(students).where(eq(students.parishId, parishId))
  await db.delete(notices).where(eq(notices.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
  await db.delete(branches).where(eq(branches.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
}

describe('payload-bound create idempotency', () => {
  beforeAll(async () => {
    await cleanup()
    await db.insert(branches).values({
      id: branchId,
      name: 'Ấu Nhi',
      scarfColor: '#16A34A',
      ageMin: 7,
      ageMax: 9,
      parishId,
    })
    await db.insert(academicYears).values({
      id: yearId,
      startDate: '2098-08-01',
      endDate: '2099-07-31',
      parishId,
    })
    await db.insert(users).values({
      id: userId,
      username: 'create_idempotency_admin',
      fullName: 'Create Idempotency Admin',
      passwordHash: 'test-only',
      role: 'admin',
      parishId,
    })
  })

  afterAll(cleanup)

  it('returns the canonical class only for an identical replay', async () => {
    const data = {
      code: 'IDEM-C1',
      name: 'Lớp Idempotency',
      branchId,
      academicYearId: yearId,
      room: 'P1',
    }
    const first = await createClass(data, userId, parishId, 'test', 'Vitest', 'idem-class-1')
    const replay = await createClass(data, userId, parishId, 'test', 'Vitest', 'idem-class-1')
    expect(replay.id).toBe(first.id)
    await updateClass(first.id, { room: 'P9' }, userId, parishId, 'test', 'Vitest')
    const replayAfterUpdate = await createClass(data, userId, parishId, 'test', 'Vitest', 'idem-class-1')
    expect(replayAfterUpdate).toMatchObject({ id: first.id, room: 'P9' })
    await expect(createClass({ ...data, room: 'P2' }, userId, parishId, 'test', 'Vitest', 'idem-class-1'))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', existing: { id: first.id } })
  })

  it('keeps pre-fingerprint class rows replayable through normalized-row compatibility', async () => {
    const legacy = {
      id: 'class-legacy-idempotency',
      code: 'IDEM-LEGACY',
      name: 'Lớp legacy',
      branchId,
      academicYearId: yearId,
      room: null,
      idempotencyKey: 'idem-class-legacy',
      parishId,
    }
    await db.insert(classes).values(legacy)

    await expect(createClass({
      code: legacy.code,
      name: legacy.name,
      branchId,
      academicYearId: yearId,
      room: null,
    }, userId, parishId, 'test', 'Vitest', legacy.idempotencyKey)).resolves.toMatchObject({ id: legacy.id })

    await expect(createClass({
      code: legacy.code,
      name: 'Payload khác',
      branchId,
      academicYearId: yearId,
      room: null,
    }, userId, parishId, 'test', 'Vitest', legacy.idempotencyKey)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      existing: { id: legacy.id },
    })
  })

  it('returns an explicit route conflict with the authorized canonical row', async () => {
    const data = {
      code: 'IDEM-ROUTE',
      name: 'Lớp route',
      branchId,
      academicYearId: yearId,
      room: 'P1',
    }
    const first = await createClass(data, userId, parishId, 'test', 'Vitest', 'idem-class-route')
    const token = generateTokens({
      userId,
      username: 'create_idempotency_admin',
      role: 'admin',
      parishId,
    }).accessToken
    const response = await classesRouter.request('/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...data, room: 'P2', idempotencyKey: 'idem-class-route' }),
    })
    const body = await response.json() as any
    expect(response.status).toBe(409)
    expect(body.error).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      details: { existing: { id: first.id } },
    })
  })

  it('rejects a student replay whose create intent changed', async () => {
    const [classRow] = await db.select().from(classes).where(and(
      eq(classes.parishId, parishId),
      eq(classes.idempotencyKey, 'idem-class-1'),
    )).limit(1)
    const data = {
      holyName: 'Phêrô',
      fullName: 'Học Sinh Idempotency',
      gender: 'Nam' as const,
      dateOfBirth: '2015-01-01',
      parentName: 'Phụ huynh',
      parentPhone: '0900000000',
      address: 'Giáo xứ',
      branch: 'AuNhi',
      classId: classRow.id,
      status: 'Đang học' as const,
    }
    const first = await createStudent(data, userId, parishId, 'test', 'Vitest', 'idem-student-1', { role: 'admin' })
    const replay = await createStudent(data, userId, parishId, 'test', 'Vitest', 'idem-student-1', { role: 'admin' })
    expect(replay.id).toBe(first.id)
    await updateStudent(first.id, { fullName: 'Tên authoritative hiện tại' }, userId, parishId, 'test', 'Vitest', { role: 'admin' })
    const replayAfterUpdate = await createStudent(data, userId, parishId, 'test', 'Vitest', 'idem-student-1', { role: 'admin' })
    expect(replayAfterUpdate).toMatchObject({ id: first.id, fullName: 'Tên authoritative hiện tại' })
    await expect(createStudent({ ...data, fullName: 'Tên bị thay đổi' }, userId, parishId, 'test', 'Vitest', 'idem-student-1', { role: 'admin' }))
      .rejects.toBeInstanceOf(CreateIdempotencyConflictError)
  })

  it('rejects a notice replay with changed content without duplicating CREATE audit', async () => {
    const data = {
      title: 'Thông báo idempotency',
      content: 'Nội dung ban đầu',
      date: '2098-09-01',
      author: 'Ban Giáo Lý',
      priority: 'normal' as const,
      targetAudience: 'all' as const,
      idempotencyKey: 'idem-notice-1',
    }
    const first = await createNotice(data, userId, parishId, 'test', 'Vitest')
    const replay = await createNotice(data, userId, parishId, 'test', 'Vitest')
    expect(replay.id).toBe(first.id)
    await updateNotice(first.id, { content: 'Nội dung authoritative hiện tại' }, userId, parishId, 'test', 'Vitest')
    const replayAfterUpdate = await createNotice(data, userId, parishId, 'test', 'Vitest')
    expect(replayAfterUpdate).toMatchObject({ id: first.id, content: 'Nội dung authoritative hiện tại' })
    await expect(createNotice({ ...data, content: 'Nội dung khác' }, userId, parishId, 'test', 'Vitest'))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', existing: { id: first.id } })

    const createAudits = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.entityId, first.id),
      eq(auditLogs.action, 'CREATE'),
    ))
    expect(createAudits).toHaveLength(1)
  })

  it('compares exam JSON semantically and rejects a changed create intent', async () => {
    const [classRow] = await db.select().from(classes).where(and(
      eq(classes.parishId, parishId),
      eq(classes.idempotencyKey, 'idem-class-1'),
    )).limit(1)
    const data = {
      classId: classRow.id,
      subject: 'Giáo lý',
      scoreType: '15m' as const,
      semester: 1 as const,
      academicYear: yearId,
      examType: 'multiple_choice' as const,
      questionCount: 2,
      answerKey: JSON.stringify({ 1: 'A', 2: 'B' }),
      idempotencyKey: 'idem-exam-1',
    }
    const first = await createExamSession(data, userId, parishId, 'test', 'Vitest', { role: 'admin' })
    const replay = await createExamSession(
      { ...data, answerKey: JSON.stringify({ 2: 'B', 1: 'A' }) },
      userId,
      parishId,
      'test',
      'Vitest',
      { role: 'admin' },
    )
    expect(replay.id).toBe(first.id)
    await db.update(examSessions).set({ subject: 'Môn authoritative hiện tại' }).where(and(
      eq(examSessions.parishId, parishId),
      eq(examSessions.id, first.id),
    ))
    const replayAfterUpdate = await createExamSession(data, userId, parishId, 'test', 'Vitest', { role: 'admin' })
    expect(replayAfterUpdate).toMatchObject({ id: first.id, subject: 'Môn authoritative hiện tại' })
    await expect(createExamSession(
      { ...data, questionCount: 3 },
      userId,
      parishId,
      'test',
      'Vitest',
      { role: 'admin' },
    )).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', existing: { id: first.id } })
  })
})
