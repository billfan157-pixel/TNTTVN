import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { attendance, auditLogs, semesterLocks, users, students, classes, branches, academicYears } from '../../db/schema.js'
import { attendanceApplicationService } from '../../services/AttendanceApplicationService.js'
import { drizzleAttendanceRepository } from '../../repositories/DrizzleAttendanceRepository.js'
import { drizzleSemesterLockRepository } from '../../repositories/DrizzleSemesterLockRepository.js'
import { AttendanceRecord } from '../../domain/AttendanceRecord.js'
import { eq } from 'drizzle-orm'

describe('Attendance Application Service Micro-Step A1.2 Integration Tests', () => {
  const testParish = 'parish-att-test'
  const teacherUserId = 'usr-teacher-att'
  const adminUserId = 'usr-admin-att'
  const studentId = 'st-att-01'
  const classId = 'cl-att-01'
  const branchId = 'br-att-01'
  const yearId = 'AY-2025-2026'
  const academicYear = '2025-2026'

  beforeAll(async () => {
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: 'CL-ATT', name: 'Lớp Att', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()
    await db.insert(users).values([
      { id: teacherUserId, username: 'teacheratt', fullName: 'Teacher Att', passwordHash: 'hash', role: 'chunhiem', parishId: testParish },
      { id: adminUserId, username: 'adminatt', fullName: 'Admin Att', passwordHash: 'hash', role: 'admin', parishId: testParish },
    ]).onConflictDoNothing()

    await db.insert(students).values({
      id: studentId,
      code: 'ST-ATT-01',
      holyName: 'Phaolo',
      fullName: 'Nguyen Van Att',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'P',
      parentPhone: '000',
      address: 'X',
      branch: 'AuNhi',
      classId,
      parishId: testParish,
    }).onConflictDoNothing()
  })

  beforeEach(async () => {
    await db.delete(attendance)
    await db.delete(semesterLocks)
    await db.delete(auditLogs).where(eq(auditLogs.parishId, testParish))
  })

  it('1. markAttendance creates new attendance record successfully', async () => {
    const record = await attendanceApplicationService.markAttendance({
      studentId,
      date: '2025-10-05',
      type: 'CatechismClass',
      status: 'Present',
      userId: teacherUserId,
      parishId: testParish,
      academicYear,
      semester: 1,
    })

    expect(record.status).toBe('Present')
    expect(record.version).toBe(1)

    const saved = await drizzleAttendanceRepository.findByStudentAndSession(studentId, '2025-10-05', 'CatechismClass', testParish)
    expect(saved).not.toBeNull()
    expect(saved?.status).toBe('Present')
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.parishId, testParish))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: 'MARK_ATTENDANCE', entityId: record.id })
  })

  it('rejects an impossible calendar date before opening a write transaction', async () => {
    await expect(attendanceApplicationService.markAttendance({
      studentId,
      date: '2025-02-31',
      type: 'CatechismClass',
      status: 'Present',
      userId: teacherUserId,
      parishId: testParish,
    })).rejects.toThrow(/ngày YYYY-MM-DD có thật/i)
    expect(await db.select().from(attendance)).toHaveLength(0)
    expect(await db.select().from(auditLogs).where(eq(auditLogs.parishId, testParish))).toHaveLength(0)
  })

  it('2. Status correction increments version to version 2', async () => {
    // 1. Initial mark
    await attendanceApplicationService.markAttendance({
      studentId,
      date: '2025-10-05',
      type: 'CatechismClass',
      status: 'AbsentUnexcused',
      userId: teacherUserId,
      parishId: testParish,
      academicYear,
      semester: 1,
    })

    // 2. Correction to AbsentExcused
    const updated = await attendanceApplicationService.markAttendance({
      studentId,
      date: '2025-10-05',
      type: 'CatechismClass',
      status: 'AbsentExcused',
      note: 'Có đơn phép',
      userId: teacherUserId,
      parishId: testParish,
      academicYear,
      semester: 1,
    })

    expect(updated.status).toBe('AbsentExcused')
    expect(updated.note).toBe('Có đơn phép')
    expect(updated.version).toBe(2)
  })

  it('3. Locked semester blocks attendance mutation (Throws 403 Forbidden)', async () => {
    // Lock HK1
    await drizzleSemesterLockRepository.setLockState(academicYear, 1, true, adminUserId, testParish)

    await expect(
      attendanceApplicationService.markAttendance({
        studentId,
        date: '2025-10-05',
        type: 'CatechismClass',
        status: 'Present',
        userId: teacherUserId,
        parishId: testParish,
        academicYear,
        semester: 1,
      })
    ).rejects.toThrow(/Học kỳ 1 năm học 2025-2026 đã bị khóa sổ điểm/)
  })

  it('4. Optimistic locking failure throws VersionConflictError (409 Conflict)', async () => {
    // Initial mark (v1)
    const rec1 = await attendanceApplicationService.markAttendance({
      studentId,
      date: '2025-10-05',
      type: 'CatechismClass',
      status: 'Present',
      userId: teacherUserId,
      parishId: testParish,
      academicYear,
      semester: 1,
    })

    // Simulate stale memory object (v1) attempting save after db updated to v2
    rec1.updateStatus('AbsentUnexcused', null, teacherUserId) // rec1 becomes v2 in memory

    // Force DB version ahead artificially
    await db.update(attendance).set({ version: 5 }).where(eq(attendance.id, rec1.id))

    // Attempt save stale object -> SQL optimistic lock fails (where version = 1)
    await expect(
      drizzleAttendanceRepository.save(rec1, teacherUserId, testParish)
    ).rejects.toThrow(/đã bị thay đổi bởi người dùng khác/)
  })

  it('5. Idempotent call with identical status produces zero extra version mutations', async () => {
    await attendanceApplicationService.markAttendance({
      studentId,
      date: '2025-10-05',
      type: 'CatechismClass',
      status: 'Present',
      userId: teacherUserId,
      parishId: testParish,
      academicYear,
      semester: 1,
    })

    const rec2 = await attendanceApplicationService.markAttendance({
      studentId,
      date: '2025-10-05',
      type: 'CatechismClass',
      status: 'Present',
      userId: teacherUserId,
      parishId: testParish,
      academicYear,
      semester: 1,
    })

    expect(rec2.version).toBe(1)
  })

  it('6. markAttendance for future date fails with 400 Bad Request', async () => {
    await expect(
      attendanceApplicationService.markAttendance({
        studentId,
        date: '2099-12-31',
        type: 'CatechismClass',
        status: 'Present',
        userId: teacherUserId,
        parishId: testParish,
        academicYear,
        semester: 1,
      })
    ).rejects.toThrow(/Không thể điểm danh cho ngày trong tương lai/)
  })

  it('7. allowedClassIds loại trừ class của học sinh → 403/TOCTOU (finding #12)', async () => {
    await expect(
      attendanceApplicationService.markAttendance({
        studentId,
        date: '2025-10-06',
        type: 'CatechismClass',
        status: 'Present',
        userId: teacherUserId,
        parishId: testParish,
        academicYear,
        semester: 1,
        allowedClassIds: ['cl-khong-phep'],
      })
    ).rejects.toThrow('Bạn không có quyền điểm danh thiếu nhi này')
  })

  it('8. ATT-01 race: 2 thiết bị cùng ghi 1 slot → UNIQUE insert hội tụ qua update, không 500', async () => {
    // Thiết bị A ghi trước (v1)
    const a = await attendanceApplicationService.markAttendance({
      studentId,
      date: '2025-10-07',
      type: 'CatechismClass',
      status: 'Present',
      userId: teacherUserId,
      parishId: testParish,
      academicYear,
      semester: 1,
    })

    // Thiết bị B giữ bản v1 cũ — save dòng KHÁC id (cùng student/date/type) → UNIQUE race
    const bRecord = new AttendanceRecord({
      id: 'att-race-device-b',
      studentId,
      parishId: testParish,
      date: '2025-10-07',
      type: 'CatechismClass',
      status: 'AbsentUnexcused',
      version: 2,
    })
    await expect(drizzleAttendanceRepository.save(bRecord, teacherUserId, testParish)).resolves.toBeUndefined()

    const merged = await drizzleAttendanceRepository.findByStudentAndSession(studentId, '2025-10-07', 'CatechismClass', testParish)
    expect(merged?.id).toBe(a.id)
    expect(merged?.status).toBe('AbsentUnexcused')
    expect(merged?.version).toBe(2)
  })

  it('9. ATT-01 idempotent: dòng đối thủ cùng version → skip, không ghi đè', async () => {
    await attendanceApplicationService.markAttendance({
      studentId,
      date: '2025-10-08',
      type: 'CatechismClass',
      status: 'Present',
      userId: teacherUserId,
      parishId: testParish,
      academicYear,
      semester: 1,
    })

    const bRecord = new AttendanceRecord({
      id: 'att-race-device-b2',
      studentId,
      parishId: testParish,
      date: '2025-10-08',
      type: 'CatechismClass',
      status: 'AbsentExcused',
      version: 1,
    })
    await drizzleAttendanceRepository.save(bRecord, teacherUserId, testParish)

    const merged = await drizzleAttendanceRepository.findByStudentAndSession(studentId, '2025-10-08', 'CatechismClass', testParish)
    expect(merged?.id).not.toBe(bRecord.id)
    expect(merged?.status).toBe('Present')
    expect(merged?.version).toBe(1)
  })

  it('10. ATT-03: thiết bị khác giáo xứ không thể cập nhật dòng attendance (WHERE parish_id)', async () => {
    const rec = await attendanceApplicationService.markAttendance({
      studentId,
      date: '2025-10-09',
      type: 'CatechismClass',
      status: 'Present',
      userId: teacherUserId,
      parishId: testParish,
      academicYear,
      semester: 1,
    })
    rec.updateStatus('AbsentExcused', 'x', teacherUserId) // v2 trong bộ nhớ

    // Save với parish khác → không chạm dòng thật (FK/PK constraint fail trên parish khác)
    await expect(drizzleAttendanceRepository.save(rec, teacherUserId, 'parish-khac')).rejects.toThrow()

    const after = await drizzleAttendanceRepository.findByStudentAndSession(studentId, '2025-10-09', 'CatechismClass', testParish)
    expect(after?.status).toBe('Present')
    expect(after?.version).toBe(1)
  })
})
