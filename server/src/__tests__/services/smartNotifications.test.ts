import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('../../services/notificationQueue.js', () => ({
  enqueueNotification: vi.fn(),
}))

import { enqueueNotification } from '../../services/notificationQueue.js'
import { notifyAbsence, notifyReportCard, notifySundayMassReminder, notifyClassReminder } from '../../services/smartNotifications.js'
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

function webpushUserIds(): string[] {
  const call = webpushCalls()[0]
  const options = call[6] as { webpushUserIds?: string[] } | undefined
  return options?.webpushUserIds ?? []
}

function telegramCalls() {
  return vi.mocked(enqueueNotification).mock.calls.filter((call) => call[0] === 'telegram')
}

describe('smartNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifyAbsence fails closed when no parent account can be resolved', async () => {
    await notifyAbsence('parish-1', 'Nguyễn Văn A', 'Giuse', 'Lớp TN1', '01/01/2025', 'AbsentUnexcused', 'Cha A', '0901234567')
    expect(enqueueNotification).toHaveBeenCalledTimes(1)
    const channels = vi.mocked(enqueueNotification).mock.calls.map((call) => call[0])
    expect(channels).toEqual(['telegram'])
    const call = telegramCalls()[0]
    expect(call[1]).toBe('absence')
    expect(call[2]).toContain('vắng mặt không phép')
  })

  it('notifyAbsence fails closed for excused absence without a parent account', async () => {
    await notifyAbsence('parish-1', 'Nguyễn Văn A', 'Giuse', 'Lớp TN1', '01/01/2025', 'AbsentExcused', 'Cha A', '0901234567', 'Ốm')
    expect(enqueueNotification).toHaveBeenCalledTimes(1)
    expect(telegramCalls()[0][2]).toContain('vắng mặt có phép')
  })

  it('notifyReportCard fails closed without stable student identity', async () => {
    await notifyReportCard('parish-1', 'Nguyễn Văn A', 'Giuse', 'Lớp TN1', 8.5, 'Giỏi', 90, 18, 20)
    expect(enqueueNotification).toHaveBeenCalledTimes(1)
    expect(telegramCalls()[0][1]).toBe('report')
    expect(telegramCalls()[0][2]).toContain('Phiếu Điểm')
  })

  it('notifySundayMassReminder fails closed when parish has no parent accounts', async () => {
    await notifySundayMassReminder('parish-1')
    expect(enqueueNotification).toHaveBeenCalledTimes(1)
    expect(telegramCalls()[0][1]).toBe('reminder')
    expect(telegramCalls()[0][2]).toContain('{sundayMassTime}')
    expect(telegramCalls()[0][2]).not.toContain('8h00')
  })

  it('notifyClassReminder fails closed when class has no parent accounts', async () => {
    await notifyClassReminder('parish-1', 'Lớp TN1', '15/01/2025')
    expect(enqueueNotification).toHaveBeenCalledTimes(1)
    const ctx = telegramCalls()[0][3]
    expect(ctx.className).toBe('Lớp TN1')
    expect(ctx.date).toBe('15/01/2025')
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
    await notifyAbsence(parishId, 'Nguyễn Văn A', 'Giuse', 'Lớp TN1', '01/01/2025', 'AbsentUnexcused', 'PH Thiếu Nhi', '0901234567')
    expect(webpushUserIds()).toEqual([parentThieuNhiId])
  })

  it('notifyReportCard targets only the matching parent account by phone', async () => {
    await notifyReportCard(parishId, 'Nguyễn Văn A', 'Giuse', 'Lớp TN1', 8.5, 'Giỏi', 90, 18, 20, undefined, '0901234567')
    expect(webpushUserIds()).toEqual([parentThieuNhiId])
  })

  it('notifyClassReminder targets parents in the requested class only', async () => {
    await notifyClassReminder(parishId, 'Lớp TN1', '15/01/2025')
    expect(webpushUserIds()).toEqual(expect.arrayContaining([parentThieuNhiId, parentAuNhiId]))
  })

  it('targetBranch cụ thể → chỉ webpush tới phụ huynh có con trong chi đoàn đó (khớp phone chuẩn hóa)', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    await notifyParishNotice(parishId, 'Lễ Mừng', 'Nội dung', 'Admin', 'ThieuNhi')

    expect(webpushCalls()).toHaveLength(1)
    expect(webpushUserIds()).toEqual([parentThieuNhiId])
  })

  it('targetBranch = All → webpush tới TẤT CẢ phụ huynh, telegram vẫn gửi staff', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    const sent = await notifyParishNotice(parishId, 'Thông báo chung', 'Nội dung', 'Admin', 'All')

    expect(webpushCalls()).toHaveLength(1)
    const ids = webpushUserIds()
    expect(ids).toContain(parentThieuNhiId)
    expect(ids).toContain(parentAuNhiId)
    expect(telegramCalls()).toHaveLength(1)
    expect(telegramCalls()[0][3]).toEqual(expect.objectContaining({ title: 'Thông báo chung', parentPhone: '0911222333' }))
    expect(sent).toBe(1)
  })

  it('không có phụ huynh khớp branch → KHÔNG enqueue webpush (không broadcast)', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    await notifyParishNotice(parishId, 'Lễ HiepSi', 'Nội dung', 'Admin', 'HiepSi')

    expect(webpushCalls()).toHaveLength(0)
  })

  it('phụ huynh INACTIVE bị loại khỏi danh sách mục tiêu', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    await db.update(users).set({ status: 'INACTIVE' }).where(eq(users.id, parentThieuNhiId))
    try {
      await notifyParishNotice(parishId, 'Thông báo', 'Nội dung', 'Admin', 'All')
      const ids = webpushUserIds()
      expect(ids).not.toContain(parentThieuNhiId)
      expect(ids).toContain(parentAuNhiId)
    } finally {
      await db.update(users).set({ status: 'ACTIVE' }).where(eq(users.id, parentThieuNhiId))
    }
  })
})
