import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AvailabilityPanel } from '../../components/operations/AvailabilityPanel'
import { operationsApi } from '../../lib/api/operations'
import { setTenantScope } from '../../lib/tenantScope'

vi.mock('../../lib/api/operations', () => ({ operationsApi: { getMyBlockouts: vi.fn(), createBlockout: vi.fn(), updateBlockout: vi.fn(), revokeBlockout: vi.fn() } }))

const emptyPage = { success: true as const, error: null, data: [], meta: { page: 1, limit: 500, total: 0, totalPages: 0 } }
const row = { id: 'B1', parishId: 'P1', userId: 'U1', personId: null, startsAt: '2099-03-01T08:00:00.000Z', endsAt: '2099-03-01T10:00:00.000Z', reason: 'Lý do riêng', version: 4, createdAt: '2099-01-01T00:00:00.000Z' }

describe('AvailabilityPanel', () => {
  beforeEach(() => { vi.resetAllMocks(); setTenantScope({ parishId: 'P1', userId: 'U1' }); vi.mocked(operationsApi.getMyBlockouts).mockResolvedValue(emptyPage) })
  afterEach(() => setTenantScope(null))

  it('creates a self blockout and keeps its private reason out of manager APIs', async () => {
    vi.mocked(operationsApi.createBlockout).mockResolvedValue({ ...row, version: 1 })
    render(<AvailabilityPanel enabled />)
    fireEvent.change(screen.getByLabelText('Bận từ'), { target: { value: '2099-03-01T15:00' } })
    fireEvent.change(screen.getByLabelText('Bận đến'), { target: { value: '2099-03-01T17:00' } })
    fireEvent.change(screen.getByLabelText('Lý do bận riêng tư'), { target: { value: 'Lý do riêng' } })
    fireEvent.click(screen.getByRole('button', { name: 'Báo bận' }))
    await waitFor(() => expect(operationsApi.createBlockout).toHaveBeenCalledWith({
      userId: 'U1', startsAt: new Date('2099-03-01T15:00').toISOString(), endsAt: new Date('2099-03-01T17:00').toISOString(), reason: 'Lý do riêng',
    }, expect.any(String)))
    expect(await screen.findByText('Đã lưu lịch bận.')).toBeInTheDocument()
  })

  it('keeps the create draft when the server rejects the command', async () => {
    vi.mocked(operationsApi.createBlockout).mockRejectedValue(new Error('VERSION_CONFLICT'))
    render(<AvailabilityPanel enabled />)
    fireEvent.change(screen.getByLabelText('Bận từ'), { target: { value: '2099-03-01T15:00' } })
    fireEvent.change(screen.getByLabelText('Bận đến'), { target: { value: '2099-03-01T17:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Báo bận' }))
    expect(await screen.findByText('VERSION_CONFLICT')).toBeInTheDocument()
    expect(screen.getByLabelText('Bận từ')).toHaveValue('2099-03-01T15:00')
  })

  it('edits and revokes only with the current row version', async () => {
    vi.mocked(operationsApi.getMyBlockouts).mockResolvedValue({ ...emptyPage, data: [row], meta: { page: 1, limit: 500, total: 1, totalPages: 1 } })
    vi.mocked(operationsApi.updateBlockout).mockResolvedValue({ ...row, version: 5 })
    vi.mocked(operationsApi.revokeBlockout).mockResolvedValue({ id: row.id, parishId: row.parishId, version: 5, deletedAt: '2099-03-01T00:00:00Z' })
    render(<AvailabilityPanel enabled />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa' }))
    // W3.5 (U-16): editor labels carry the row window, not the raw id.
    fireEvent.change(screen.getByLabelText(/Sửa lý do của khoảng/), { target: { value: 'Lý do mới' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(operationsApi.updateBlockout).toHaveBeenCalledWith('B1', expect.objectContaining({ version: 4, reason: 'Lý do mới' }), expect.any(String)))
    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' }))
    await waitFor(() => expect(operationsApi.revokeBlockout).toHaveBeenCalledWith('B1', 4, expect.any(String)))
  })
})
