import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventTemplatesPanel } from '../../components/operations/EventTemplatesPanel'
import type { OperationEventDetail, OperationEventTemplatePreview } from '../../lib/api/operations'

const mocks = vi.hoisted(() => ({
  getEventTemplates: vi.fn(),
  previewEventTemplate: vi.fn(),
  instantiateEventTemplate: vi.fn(),
  createEventTemplate: vi.fn(),
  createEventTemplateVersion: vi.fn(),
  archiveEventTemplate: vi.fn(),
  restoreEventTemplate: vi.fn(),
}))
let tenantScope = { parishId: 'parish-a', userId: 'user-a' }
vi.mock('../../lib/api/operations', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/api/operations')>()
  return { ...actual, operationsApi: { ...actual.operationsApi, ...mocks } }
})
vi.mock('../../lib/tenantScope', () => ({
  getTenantScopeKey: () => `${tenantScope.parishId}:${tenantScope.userId}`,
  getTenantScope: () => tenantScope,
}))

const template = { id: 'tpl-1', parishId: 'parish-a', scopeUnitId: 'branch-1', name: 'Mẫu trại', description: null, latestVersion: 2, version: 1, isActive: true, createdBy: 'user-a', updatedBy: 'user-a', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const preview: OperationEventTemplatePreview = {
  template, version: 2,
  preview: {
    event: { title: 'Trại hè', description: null, eventType: 'CAMP', durationMinutes: 180, location: null, expectedHeadcount: null, startsAt: '2027-02-01T01:00:00.000Z', endsAt: '2027-02-01T04:00:00.000Z' },
    tasks: [{ index: 0, title: 'Dựng cổng', description: null, phase: 'PREPARATION', priority: 'HIGH', isRequired: true, requiresApproval: false, dueOffsetMinutes: -60, dueAt: '2027-02-01T00:00:00.000Z', checklist: [{ label: 'Kiểm tra', isRequired: true, sortOrder: 0 }] }],
  },
}

describe('EventTemplatesPanel', () => {
  beforeEach(() => {
    tenantScope = { parishId: 'parish-a', userId: 'user-a' }
    Object.values(mocks).forEach(mock => mock.mockReset())
    mocks.getEventTemplates.mockImplementation(async (_page = 1, _limit = 100, archived = false) => ({ success: true, data: archived ? [] : [template], meta: { page: 1, limit: 100, total: archived ? 0 : 1, totalPages: archived ? 0 : 1 }, error: null }))
    mocks.previewEventTemplate.mockResolvedValue(preview)
    mocks.instantiateEventTemplate.mockResolvedValue({ event: { id: 'event-copy', parishId: 'parish-a', sourceTemplateId: 'tpl-1', sourceTemplateVersion: 2, title: 'Trại hè' }, tasks: [{ id: 'task-copy' }], checklist: [], template: { id: 'tpl-1', name: 'Mẫu trại', version: 2 } })
    mocks.createEventTemplate.mockResolvedValue(template)
    mocks.archiveEventTemplate.mockResolvedValue({ ...template, version: 2, isActive: false })
    mocks.restoreEventTemplate.mockResolvedValue({ ...template, version: 3 })
  })

  it('requires preview of the exact version before atomically creating a draft', async () => {
    const onEventCreated = vi.fn().mockResolvedValue(undefined)
    render(<EventTemplatesPanel enabled sourceEvent={null} onEventCreated={onEventCreated} />)
    await screen.findByRole('option', { name: 'Mẫu trại · v2' })
    fireEvent.change(screen.getByLabelText('Thời gian bắt đầu từ mẫu'), { target: { value: '2027-02-01T08:00' } })
    expect(screen.getByRole('button', { name: 'Tạo bản nháp từ mẫu' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }))
    await screen.findByLabelText('Bản xem trước mẫu sự kiện')
    expect(screen.queryByText(/chưa có người được phân công/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản nháp từ mẫu' }))
    await waitFor(() => expect(mocks.instantiateEventTemplate).toHaveBeenCalledWith('tpl-1', expect.objectContaining({ templateVersion: 2, visibility: 'INTERNAL', organizerUserId: 'user-a' }), expect.any(String)))
    await waitFor(() => expect(onEventCreated).toHaveBeenCalledWith('event-copy'))
    expect(screen.getByText(/chưa có người được phân công/i)).toBeInTheDocument()
  })

  it('creates a public template instance through Operations without a client calendar source', async () => {
    render(<EventTemplatesPanel enabled sourceEvent={null} canPublishPublic onEventCreated={vi.fn()} />)
    await screen.findByRole('option', { name: 'Mẫu trại · v2' })
    fireEvent.change(screen.getByLabelText('Thời gian bắt đầu từ mẫu'), { target: { value: '2027-02-01T08:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }))
    await screen.findByLabelText('Bản xem trước mẫu sự kiện')
    fireEvent.click(screen.getByRole('button', { name: 'Công khai' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản nháp từ mẫu' }))

    await waitFor(() => expect(mocks.instantiateEventTemplate).toHaveBeenCalledWith('tpl-1', expect.objectContaining({
      templateVersion: 2, visibility: 'PUBLIC_SUMMARY', organizerUserId: 'user-a',
    }), expect.any(String)))
    expect(mocks.instantiateEventTemplate.mock.calls[0][1]).not.toHaveProperty('sourceParishEventId')
  })

  it('saves the open authorized event as an immutable first version', async () => {
    const sourceEvent: OperationEventDetail = {
      event: { id: 'source-1', parishId: 'parish-a', title: 'Nguồn', eventType: 'MEETING', startsAt: '2027-01-01T01:00:00Z', endsAt: '2027-01-01T02:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'COMPLETED', visibility: 'INTERNAL', scopeUnitId: 'branch-1', version: 5 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] }, permissions: { 'operations.event.create': true },
    }
    render(<EventTemplatesPanel enabled sourceEvent={sourceEvent} onEventCreated={vi.fn()} />)
    expect(screen.queryByLabelText('Thời gian bắt đầu từ mẫu')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tên mẫu sự kiện'), { target: { value: 'Mẫu từ event thành công' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mẫu v1' }))
    await waitFor(() => expect(mocks.createEventTemplate).toHaveBeenCalledWith('source-1', { eventVersion: 5, name: 'Mẫu từ event thành công', description: null }, expect.any(String)))
  })

  it('reuses the same idempotency key when the user retries an unchanged snapshot command', async () => {
    const sourceEvent: OperationEventDetail = {
      event: { id: 'source-1', parishId: 'parish-a', title: 'Nguồn', eventType: 'MEETING', startsAt: '2027-01-01T01:00:00Z', endsAt: '2027-01-01T02:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', scopeUnitId: 'branch-1', version: 5 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] }, permissions: { 'operations.event.create': true },
    }
    mocks.createEventTemplate.mockRejectedValueOnce(new Error('Mất phản hồi sau commit')).mockResolvedValueOnce(template)
    render(<EventTemplatesPanel enabled sourceEvent={sourceEvent} onEventCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Tên mẫu sự kiện'), { target: { value: 'Mẫu retry' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mẫu v1' }))
    await screen.findByText('Mất phản hồi sau commit')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mẫu v1' }))
    await waitFor(() => expect(mocks.createEventTemplate).toHaveBeenCalledTimes(2))
    expect(mocks.createEventTemplate.mock.calls[1][2]).toBe(mocks.createEventTemplate.mock.calls[0][2])
  })

  it('archives an active scoped template only with an explicit reason', async () => {
    const sourceEvent: OperationEventDetail = {
      event: { id: 'source-1', parishId: 'parish-a', title: 'Nguồn', eventType: 'MEETING', startsAt: '2027-01-01T01:00:00Z', endsAt: '2027-01-01T02:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', scopeUnitId: 'branch-1', version: 5 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] }, permissions: { 'operations.event.create': true },
    }
    const onTemplatesChanged = vi.fn()
    render(<EventTemplatesPanel enabled mode="source" sourceEvent={sourceEvent} onEventCreated={vi.fn()} onTemplatesChanged={onTemplatesChanged} />)
    await screen.findByLabelText('Mẫu sự kiện cần tạo phiên bản')
    expect(screen.getByRole('button', { name: 'Lưu trữ mẫu' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Lý do lưu trữ mẫu sự kiện'), { target: { value: 'Tạm ẩn để rà soát' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu trữ mẫu' }))
    await waitFor(() => expect(mocks.archiveEventTemplate).toHaveBeenCalledWith('tpl-1', { expectedVersion: 1, expectedLatestVersion: 2, reason: 'Tạm ẩn để rà soát' }, expect.any(String)))
    await waitFor(() => expect(onTemplatesChanged).toHaveBeenCalled())
  })

  it('hides the previous tenant projection immediately and discards a late response after an account switch', async () => {
    const props = { enabled: true, sourceEvent: null, onEventCreated: vi.fn() }
    const { rerender } = render(<EventTemplatesPanel {...props} />)
    await screen.findByRole('option', { name: 'Mẫu trại · v2' })

    let resolveNewScope!: (value: any) => void
    mocks.getEventTemplates.mockReturnValueOnce(new Promise(done => { resolveNewScope = done }))
    tenantScope = { parishId: 'parish-b', userId: 'user-b' }
    rerender(<EventTemplatesPanel {...props} />)

    expect(screen.queryByRole('option', { name: 'Mẫu trại · v2' })).not.toBeInTheDocument()
    resolveNewScope({ success: true, data: [template], meta: { page: 1, limit: 100, total: 1, totalPages: 1 }, error: null })
    await waitFor(() => expect(mocks.getEventTemplates).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('option', { name: 'Mẫu trại · v2' })).not.toBeInTheDocument()
  })
})
