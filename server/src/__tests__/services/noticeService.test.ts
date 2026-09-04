import { afterAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { auditLogs, notices as noticesTable } from '../../db/schema.js'
import { getNotices, createNotice, updateNotice, deleteNotice } from '../../services/noticeService.js'

describe('Server noticeService Layer Unit Tests', () => {
  let createdNoticeId: string
  let audienceChangedNoticeId: string
  let staffOnlyNoticeId: string

  it('createNotice creates a new parish notice', async () => {
    const noticeData = {
      title: 'Thông báo Kiểm Tra Đầu Năm',
      content: 'Đề nghị các thiếu nhi chuẩn bị kinh bổn...',
      date: '2026-08-01',
      author: 'Trưởng Ban Giáo Lý',
      priority: 'important' as const,
      targetBranch: 'All',
    }

    const created = await createNotice(noticeData, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    expect(created).not.toBeNull()
    expect(created?.title).toBe('Thông báo Kiểm Tra Đầu Năm')
    createdNoticeId = created!.id

    const [audit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, 'thanh-gia'),
      eq(auditLogs.entityId, createdNoticeId),
      eq(auditLogs.action, 'CREATE'),
    ))
    expect(audit).toBeDefined()
    expect(audit.newValue).not.toContain(noticeData.title)
    expect(audit.newValue).not.toContain(noticeData.content)
  })

  it('updateNotice modifies existing parish notice', async () => {
    const updated = await updateNotice(createdNoticeId, { title: 'Thông báo Đã Đổi Tên' }, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    expect(updated).not.toBeNull()
    expect(updated?.title).toBe('Thông báo Đã Đổi Tên')

    const [audit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, 'thanh-gia'),
      eq(auditLogs.entityId, createdNoticeId),
      eq(auditLogs.action, 'UPDATE'),
    ))
    expect(audit.newValue).not.toContain('Thông báo Đã Đổi Tên')
  })

  it('getNotices fetches list of notices for parish', async () => {
    const notices = await getNotices('thanh-gia')
    expect(Array.isArray(notices)).toBe(true)
    const exists = notices.some((n) => n.id === createdNoticeId)
    expect(exists).toBe(true)
  })

  it('deleteNotice emits an incremental tombstone, hides it from snapshots, and is idempotent', async () => {
    const beforeDelete = new Date(Date.now() - 1000).toISOString()
    const deleted = await deleteNotice(createdNoticeId, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    expect(deleted).toBe(true)

    const fullSnapshot = await getNotices('thanh-gia')
    expect(fullSnapshot.some((notice) => notice.id === createdNoticeId)).toBe(false)

    const delta = await getNotices('thanh-gia', beforeDelete)
    const tombstone = delta.find((notice) => notice.id === createdNoticeId)
    expect(tombstone?.deletedAt).toBeTruthy()

    await expect(deleteNotice(createdNoticeId, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')).resolves.toBe(true)
  })

  it('emits a redacted tombstone when a notice is no longer visible to parents', async () => {
    const beforeCreate = new Date(Date.now() - 1000).toISOString()
    const created = await createNotice({
      title: 'Thông báo cho phụ huynh',
      content: 'Nội dung riêng cho phụ huynh',
      date: '2026-08-02',
      author: 'Ban Giáo Lý',
      priority: 'normal',
      targetBranch: 'All',
      targetAudience: 'parents',
    }, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    audienceChangedNoticeId = created.id

    const visibleDelta = await getNotices('thanh-gia', beforeCreate, 50, 1, undefined, 'phuhuynh')
    expect(visibleDelta.find((notice) => notice.id === audienceChangedNoticeId)?.deletedAt).toBeNull()

    await updateNotice(audienceChangedNoticeId, { targetAudience: 'staff' }, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    const hiddenDelta = await getNotices('thanh-gia', beforeCreate, 50, 1, undefined, 'phuhuynh')
    const tombstone = hiddenDelta.find((notice) => notice.id === audienceChangedNoticeId)
    expect(tombstone?.deletedAt).toBeTruthy()
    expect(tombstone?.title).toBe('')
    expect(tombstone?.content).toBe('')
    expect(tombstone?.author).toBe('')

    const parentSnapshot = await getNotices('thanh-gia', undefined, 50, 1, undefined, 'phuhuynh')
    expect(parentSnapshot.some((notice) => notice.id === audienceChangedNoticeId)).toBe(false)
  })

  it('does not disclose a newly-created staff notice in a parent delta', async () => {
    const beforeCreate = new Date(Date.now() - 1000).toISOString()
    const created = await createNotice({
      title: 'Thông báo nội bộ',
      content: 'Nội dung chỉ dành cho nhân sự',
      date: '2026-08-03',
      author: 'Ban Điều Hành',
      priority: 'urgent',
      targetBranch: 'All',
      targetAudience: 'staff',
    }, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    staffOnlyNoticeId = created.id

    const parentDelta = await getNotices('thanh-gia', beforeCreate, 50, 1, undefined, 'phuhuynh')
    expect(parentDelta.some((notice) => notice.id === staffOnlyNoticeId)).toBe(false)
  })

  afterAll(async () => {
    if (createdNoticeId) await db.delete(noticesTable).where(and(eq(noticesTable.parishId, 'thanh-gia'), eq(noticesTable.id, createdNoticeId)))
    if (createdNoticeId) await db.delete(auditLogs).where(and(eq(auditLogs.parishId, 'thanh-gia'), eq(auditLogs.entityId, createdNoticeId)))
    if (audienceChangedNoticeId) await db.delete(noticesTable).where(and(eq(noticesTable.parishId, 'thanh-gia'), eq(noticesTable.id, audienceChangedNoticeId)))
    if (audienceChangedNoticeId) await db.delete(auditLogs).where(and(eq(auditLogs.parishId, 'thanh-gia'), eq(auditLogs.entityId, audienceChangedNoticeId)))
    if (staffOnlyNoticeId) await db.delete(noticesTable).where(and(eq(noticesTable.parishId, 'thanh-gia'), eq(noticesTable.id, staffOnlyNoticeId)))
    if (staffOnlyNoticeId) await db.delete(auditLogs).where(and(eq(auditLogs.parishId, 'thanh-gia'), eq(auditLogs.entityId, staffOnlyNoticeId)))
  })
})

