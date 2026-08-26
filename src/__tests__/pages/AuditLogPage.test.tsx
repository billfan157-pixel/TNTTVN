import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AuditLogPage from '../../pages/AuditLogPage'
import { api } from '../../lib/api'

// AUDIT-FIX (2026-08-12): Server ghi audit với action GENERIC 'CREATE'/'UPDATE' +
// entityType 'grade' (gradeService.ts) — KHÔNG có action 'UPSERT_GRADE'. Trang
// trước đây chỉ map nhãn UPSERT_GRADE → import điểm hiện raw "CREATE" và filter
// "Cập nhật điểm" trả rỗng (tưởng không ghi nhận).

function makeLog(overrides: Record<string, unknown>) {
  return {
    id: 'AUD-1',
    userId: 'USR-1',
    userName: 'Admin',
    action: 'CREATE',
    entityType: 'grade',
    entityId: 'GR-1',
    oldValue: null,
    newValue: '{}',
    ip: null,
    userAgent: null,
    createdAt: '2026-08-12T03:00:00.000Z',
    ...overrides,
  }
}

function makePolicyEntry(overrides: Record<string, unknown>) {
  return {
    id: 'POL-1',
    userId: 'USR-1',
    userName: 'Admin',
    action: 'UPDATE',
    entityType: 'settings',
    entityId: null,
    oldValue: null,
    newValue: '{}',
    createdAt: '2026-08-16T03:00:00.000Z',
    policyMetadata: {
      type: 'POLICY_UPDATE',
      previousVersion: 'policy-settings-xyz-1000',
      currentVersion: 'policy-settings-xyz-2000',
      changedFields: ['gradeWeights'],
      summary: { gpaBefore: 7.5, gpaAfter: 8.0, labelBefore: 'Giỏi', labelAfter: 'Xuất Sắc' },
    },
    ...overrides,
  }
}

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(api, 'getAuditLogs').mockResolvedValue({
      success: true,
      data: [
        makeLog({ action: 'CREATE', entityType: 'grade' }),
        makeLog({ action: 'UPDATE', entityType: 'grade' }),
        makeLog({ action: 'CREATE_USER', entityType: 'user' }),
      ],
      meta: { page: 1, limit: 25, total: 3, totalPages: 1 },
    })
  })

  it('import điểm (CREATE/UPDATE + grade) hiển thị nhãn tiếng Việt, KHÔNG hiện action raw', async () => {
    render(<AuditLogPage />)
    await waitFor(() => expect(screen.getByText('Thêm điểm')).toBeTruthy())
    expect(screen.getAllByText('Cập nhật điểm').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tạo tài khoản').length).toBeGreaterThan(0)
    expect(screen.queryByText('CREATE')).toBeNull()
    expect(screen.queryByText('UPDATE')).toBeNull()
    expect(screen.queryByText('UPSERT_GRADE')).toBeNull()
  })

  it('filter "Cập nhật điểm" (UPDATE|grade) gửi action=UPDATE + entityType=grade — có kết quả thật', async () => {
    render(<AuditLogPage />)
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBe(2))
    const actionSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(actionSelect, { target: { value: 'UPDATE|grade' } })
    await waitFor(() => {
      expect(api.getAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityType: 'grade' }))
    })
  })

  it('filter action generic (CREATE) không gửi entityType', async () => {
    render(<AuditLogPage />)
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBe(2))
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'CREATE' } })
    await waitFor(() => {
      expect(api.getAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }))
      const lastCall = vi.mocked(api.getAuditLogs).mock.calls.at(-1)![0]
      expect((lastCall as any).entityType).toBeUndefined()
    })
  })

  it('tab "Chính Sách & Tác Động" gọi /policy-history và hiển thị nội dung enriched (ADR-047 merge)', async () => {
    vi.spyOn(api, 'getPolicyHistory').mockResolvedValue({
      success: true,
      data: [makePolicyEntry({})],
      meta: {
        page: 1,
        limit: 50,
        total: 1,
        totalPages: 1,
        summary: { policyUpdates: 1, gradeOverrides: 0, promotionDecisions: 0, semesterLocks: 0, total: 1 },
      },
    })
    render(<AuditLogPage />)
    fireEvent.click(screen.getByText('Chính Sách & Tác Động'))
    await waitFor(() => {
      expect(api.getPolicyHistory).toHaveBeenCalled()
    })
    expect((await screen.findAllByText('Cập Nhật Chính Sách')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/gradeWeights/)).toBeTruthy()
    expect(screen.getByText(/Ảnh hưởng GPA: 7.50 → 8.00/)).toBeTruthy()
  })
})
