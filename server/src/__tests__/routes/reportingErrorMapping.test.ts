import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

// OBS-FIX regression: exception KHÔNG phân loại từ service phải → 500 + log,
// KHÔNG được nuốt im lặng rồi tự gán 400 như trước đây.
const getStudentReportCardMock = vi.fn()
const getClassSummaryMock = vi.fn()
const listClassesMock = vi.fn()

vi.mock('../../services/ReportingApplicationService.js', () => ({
  reportingApplicationService: {
    getStudentReportCard: (...args: unknown[]) => getStudentReportCardMock(...args),
    getClassSummary: (...args: unknown[]) => getClassSummaryMock(...args),
    listClasses: (...args: unknown[]) => listClassesMock(...args),
  },
}))

import reportingRouter from '../../routes/reporting.js'
import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { generateId } from '../../utils/id.js'
import { generateTokens } from '../../middleware/auth.js'

describe('OBS-FIX: reporting route error mapping (400-swallow regression)', () => {
  const parishId = 'parish-obs-fix'
  const parentId = generateId('USR')
  const adminId = generateId('USR')
  const assistantId = generateId('USR')
  let parentToken: string
  let adminToken: string
  let assistantToken: string
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(users).values([
      {
        id: parentId, username: generateId('pa'), fullName: 'PH OBS', phone: '0911110000',
        passwordHash: 'hash', role: 'phuhuynh', parishId, tokenVersion: 1, status: 'ACTIVE', createdAt: now,
      },
      {
        id: adminId, username: generateId('adm'), fullName: 'Admin OBS',
        passwordHash: 'hash', role: 'admin', parishId, tokenVersion: 1, status: 'ACTIVE', createdAt: now,
      },
      {
        id: assistantId, username: `ast_${assistantId}`, fullName: 'Assistant OBS',
        passwordHash: 'hash', role: 'phuta', parishId, tokenVersion: 1, status: 'ACTIVE', createdAt: now,
      },
    ])
    parentToken = generateTokens({ userId: parentId, username: 'ph_obs', role: 'phuhuynh', parishId, tokenVersion: 1 }).accessToken
    adminToken = generateTokens({ userId: adminId, username: 'adm_obs', role: 'admin', parishId, tokenVersion: 1 }).accessToken
    assistantToken = generateTokens({ userId: assistantId, username: 'ast_obs', role: 'phuta', parishId, tokenVersion: 1 }).accessToken
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    getStudentReportCardMock.mockReset()
    getClassSummaryMock.mockReset()
    listClassesMock.mockReset()
    consoleErrorSpy.mockClear()
  })

  it('1. Lỗi KHÔNG phân loại (DB crash) → 500 + console.error, KHÔNG tự gán 400, không lộ message nội bộ', async () => {
    getStudentReportCardMock.mockRejectedValue(new Error('SQLITE_BUSY: database is locked'))

    const res = await reportingRouter.request('/report-card/ST-obs-01?academicYear=2026-2027', {
      headers: { Authorization: `Bearer ${parentToken}` },
    })

    expect(res.status).toBe(500)
    const json = (await res.json()) as any
    const err = typeof json.error === 'object' ? json.error : json.error
    expect(err.code).toBe('REPORT_GENERATION_ERROR')
    expect(JSON.stringify(json)).not.toContain('SQLITE_BUSY')
    // Bắt buộc có log server-side — đây là lý do chính của fix
    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(String(consoleErrorSpy.mock.calls[0]?.[0])).toContain('/report-card/ST-obs-01')
  })

  it('2. Lỗi nghiệp vụ có status tường minh (403 spec sở hữu) → vẫn 403 FORBIDDEN', async () => {
    const err403 = new Error('Bạn không có quyền truy cập phiếu điểm của thiếu nhi này')
    ;(err403 as any).status = 403
    getStudentReportCardMock.mockRejectedValue(err403)

    const res = await reportingRouter.request('/report-card/ST-obs-01?academicYear=2026-2027', {
      headers: { Authorization: `Bearer ${parentToken}` },
    })

    expect(res.status).toBe(403)
    const json = (await res.json()) as any
    const err = typeof json.error === 'object' ? json.error : json.error
    expect(err.code).toBe('FORBIDDEN')
  })

  it('3. class-summary: lỗi không phân loại → 500 + log (cùng semantic với report-card)', async () => {
    getClassSummaryMock.mockRejectedValue(new Error('no such column: parish_id'))

    const res = await reportingRouter.request('/class-summary/CLS-obs-01?academicYear=2026-2027', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    expect(res.status).toBe(500)
    const json = (await res.json()) as any
    const err = typeof json.error === 'object' ? json.error : json.error
    expect(err.code).toBe('REPORT_GENERATION_ERROR')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('4. class-summary preserves the existing assistant reporting surface while service owns class scope', async () => {
    getClassSummaryMock.mockResolvedValue({ classId: 'CLS-obs-01', students: [] })

    const res = await reportingRouter.request('/class-summary/CLS-obs-01?academicYear=2026-2027', {
      headers: { Authorization: `Bearer ${assistantToken}` },
    })

    expect(res.status).toBe(200)
    expect(getClassSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: assistantId, role: 'phuta', parishId }),
      'CLS-obs-01',
      '2026-2027',
    )
  })

  it('5. official class inventory is server-scoped and available to assistants', async () => {
    listClassesMock.mockResolvedValue([{ id: 'CLS-obs-01', name: 'Lớp OBS', branchId: 'BR-01', academicYear: '2026-2027' }])

    const res = await reportingRouter.request('/classes?academicYear=2026-2027', {
      headers: { Authorization: `Bearer ${assistantToken}` },
    })

    expect(res.status).toBe(200)
    expect(listClassesMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: assistantId, role: 'phuta', parishId }),
      '2026-2027',
    )
  })
})
