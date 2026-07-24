import { describe, it, expect } from 'vitest'
import { getNotices, createNotice, deleteNotice } from '../../services/noticeService.js'

describe('Server noticeService Layer Unit Tests', () => {
  let createdNoticeId: string

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
  })

  it('getNotices fetches list of notices for parish', async () => {
    const notices = await getNotices('thanh-gia')
    expect(Array.isArray(notices)).toBe(true)
    const exists = notices.some((n) => n.id === createdNoticeId)
    expect(exists).toBe(true)
  })

  it('deleteNotice removes specified notice by id', async () => {
    const deleted = await deleteNotice(createdNoticeId, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    expect(deleted).toBe(true)
  })
})
