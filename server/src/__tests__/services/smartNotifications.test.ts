import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('../../services/notificationQueue.js', () => ({
  enqueueNotification: vi.fn(),
}))

import { enqueueNotification } from '../../services/notificationQueue.js'
import { notifyAbsence, notifyBatchReportCards, notifyReportCard, notifySundayMassReminder, notifyClassReminder } from '../../services/smartNotifications.js'
import { db } from '../../db/index.js'
import { users, students, classes, branches, academicYears } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'

const PREFIX = Date.now()
const parishId = `parish-notice-${PREFIX}`
const branchId = `br-notice-${PREFIX}`
const yearId = `yr-notice-${PREFIX}`
const classId = `cl-notice-${PREFIX}`
const parentThieuNhiId = `usr-tn-${PREFIX}`
const parentAuNhiId = `usr-an-${PREFIX}`
const staffId = `usr-staff-${PREFIX}`

function webpushCalls() {
  return vi.mocked(enqueueNotification).mock.calls.filter((call) => call[0] === 'webpush')
}

function webpushTargetGroups(): string[][] {
  return webpushCalls().map((call) => {
    const options = call[6] as { webpushUserIds?: string[] } | undefined
    return options?.webpushUserIds ?? []
  })
}

function allWebpushUserIds(): string[] {
  return webpushTargetGroups().flat()
}

describe('smartNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifyAbsence fails closed when no parent account can be resolved', async () => {
    await notifyAbsence('parish-1', 'Nguyễn Văn A', 'Giuse', 'Lớp TN1', '01/01/2025', 'AbsentUnexcused', 'Cha A', '0901234567')
    expect(enqueueNotification).not.toHaveBeenCalled()
  })

  it('notifyAbsence fails closed for excused absence without a parent account', async () => {
    await notifyAbsence('parish-1', 'Nguyễn Văn A', 'Giuse', 'Lớp TN1', '01/01/2025', 'AbsentExcused', 'Cha A', '0901234567', 'Ốm')
    expect(enqueueNotification).not.toHaveBeenCalled()
  })

  it('notifyReportCard fails closed without stable student identity', async () => {
    await notifyReportCard('parish-1', 'Nguyễn Văn A', 'Giuse', 'Lớp TN1', 8.5, 'Giỏi', 90, 18, 20)
    expect(enqueueNotification).not.toHaveBeenCalled()
  })

  it('notifySundayMassReminder fails closed when parish has no parent accounts', async () => {
    await expect(notifySundayMassReminder('parish-1')).resolves.toBe(false)
    expect(enqueueNotification).not.toHaveBeenCalled()
  })

  it('notifyClassReminder fails closed when class has no parent accounts', async () => {
    await notifyClassReminder('parish-1', 'Lớp TN1', '15/01/2025')
    expect(enqueueNotification).not.toHaveBeenCalled()
  })
})

describe('notifyParishNotice (web push CÓ CHỦ ĐÍCH tới phụ huynh)', () => {
  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({ id: branchId, name: 'Phân Ngành Notice', scarfColor: '#fff', ageMin: 8, ageMax: 12, parishId })
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-06-30', parishId })
    await db.insert(classes).values({ id: classId, code: `CL-${PREFIX}`, name: 'Lớp TN1', branchId, academicYearId: yearId, parishId })
    await db.insert(users).values([
      { id: parentThieuNhiId, username: `tn_${PREFIX}`, passwordHash: 'hash', fullName: 'PH Thiếu Nhi', phone: '0901 234 567', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: parentAuNhiId, username: `an_${PREFIX}`, passwordHash: 'hash', fullName: 'PH Ấu Nhi', phone: '0987654321', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: staffId, username: `staff_${PREFIX}`, passwordHash: 'hash', fullName: 'Giáo Lý Viên', phone: '0911222333', role: 'phuta', parishId, status: 'ACTIVE', tokenVersion: 1 },
    ])
    await db.insert(students).values([
      { id: `st-tn-${PREFIX}`, code: `ST-TN-${PREFIX}`, holyName: 'Giuse', fullName: 'Nguyễn Văn A', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'PH Thiếu Nhi', parentPhone: '0901234567', address: 'X', branch: 'ThieuNhi', classId, parishId, status: 'Đang học', createdAt: now, updatedAt: now },
      { id: `st-an-${PREFIX}`, code: `ST-AN-${PREFIX}`, holyName: 'Maria', fullName: 'Trần Thị B', gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'PH Ấu Nhi', parentPhone: '0987654321', address: 'Y', branch: 'AuNhi', classId, parishId, status: 'Đang học', createdAt: now, updatedAt: now },
    ])
  })

  afterAll(async () => {
    await db.delete(students).where(and(eq(students.parishId, parishId), eq(students.classId, classId)))
    await db.delete(classes).where(eq(classes.id, classId))
    await db.delete(academicYears).where(eq(academicYears.id, yearId))
    await db.delete(branches).where(eq(branches.id, branchId))
    await db.delete(users).where(eq(users.parishId, parishId))
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifyAbsence targets only the matching parent account', async () => {
    await notifyAbsence(parishId, 'Nguyễn Văn A', 'Giuse', 'Lớp TN1', '01/01/2025', 'AbsentUnexcused', 'PH Thiếu Nhi', '0901234567', undefined, `st-tn-${PREFIX}`)
    expect(allWebpushUserIds()).toEqual([parentThieuNhiId])
  })

  it('notifyReportCard targets the canonical student parent despite a conflicting phone', async () => {
    await notifyReportCard(parishId, 'Nguyễn Văn A', 'Giuse', 'Lớp TN1', 8.5, 'Giỏi', 90, 18, 20, `st-tn-${PREFIX}`, '0987654321')
    expect(allWebpushUserIds()).toEqual([parentThieuNhiId])
  })

  it('notifyClassReminder targets parents in the requested class only', async () => {
    await notifyClassReminder(parishId, 'Lớp TN1', '15/01/2025')
    expect(allWebpushUserIds()).toEqual(expect.arrayContaining([parentThieuNhiId, parentAuNhiId]))
  })

  it('batch failure diagnostics do not log student name or class PII', async () => {
    vi.mocked(enqueueNotification).mockRejectedValueOnce(new Error('queue unavailable'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const studentName = 'Tên Nhạy Cảm'
    const className = 'Lớp Bí Mật'
    try {
      await notifyBatchReportCards(parishId, [{
        studentId: `st-tn-${PREFIX}`,
        studentName,
        holyName: 'Giuse',
        className,
        score: 8,
        rank: 'Khá',
        attendanceRate: 90,
        attendancePresent: 18,
        attendanceTotal: 20,
      }])
      const rendered = JSON.stringify(errorSpy.mock.calls)
      expect(rendered).not.toContain(studentName)
      expect(rendered).not.toContain(className)
      expect(rendered).toContain(`st-tn-${PREFIX}`)
      expect(rendered).toContain('Error')
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('notifySundayMassReminder uses explicit parent targets on app push only', async () => {
    await expect(notifySundayMassReminder(parishId)).resolves.toBe(true)
    expect(webpushCalls()).toHaveLength(1)
    expect(allWebpushUserIds()).toEqual(expect.arrayContaining([parentThieuNhiId, parentAuNhiId]))
  })

  it('targetBranch cụ thể → chỉ webpush tới phụ huynh có con trong chi đoàn đó (khớp phone chuẩn hóa)', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    await notifyParishNotice(parishId, 'Lễ Mừng', 'Nội dung', 'Admin', 'ThieuNhi')

    expect(webpushCalls()).toHaveLength(2)
    expect(webpushTargetGroups()).toContainEqual([parentThieuNhiId])
    expect(webpushTargetGroups()).toContainEqual([staffId])
  })

  it('targetBranch = All → app push tách nhóm staff và tất cả phụ huynh', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    const sent = await notifyParishNotice(parishId, 'Thông báo chung', 'Nội dung', 'Admin', 'All')

    expect(webpushCalls()).toHaveLength(2)
    const ids = allWebpushUserIds()
    expect(ids).toContain(parentThieuNhiId)
    expect(ids).toContain(parentAuNhiId)
    expect(ids).toContain(staffId)
    expect(sent).toBe(3)
  })

  it('không có phụ huynh khớp branch → chỉ enqueue staff, không broadcast phụ huynh', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    await notifyParishNotice(parishId, 'Lễ HiepSi', 'Nội dung', 'Admin', 'HiepSi')

    expect(webpushTargetGroups()).toEqual([[staffId]])
  })

  it('phụ huynh INACTIVE bị loại khỏi danh sách mục tiêu', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    await db.update(users).set({ status: 'INACTIVE' }).where(eq(users.id, parentThieuNhiId))
    try {
      await notifyParishNotice(parishId, 'Thông báo', 'Nội dung', 'Admin', 'All')
      const ids = allWebpushUserIds()
      expect(ids).not.toContain(parentThieuNhiId)
      expect(ids).toContain(parentAuNhiId)
    } finally {
      await db.update(users).set({ status: 'ACTIVE' }).where(eq(users.id, parentThieuNhiId))
    }
  })
})
