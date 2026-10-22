import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LiturgicalReminderSettings } from '../../components/common/LiturgicalReminderSettings'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
const off = { enabled: false, time: '08:00', timeZone: 'Asia/Ho_Chi_Minh' as const }
beforeEach(() => {
  useAuthStore.setState({ user: { id: 'liturgical-ui-a', parishId: 'ui-parish' } as any })
  vi.spyOn(api, 'getLiturgicalReminder').mockResolvedValue(off)
})
afterEach(() => { cleanup(); useAuthStore.setState({ user: null }); vi.restoreAllMocks() })

describe('personal liturgical reminder controls', () => {
  it('saves the default 08:00 only for the current account and retains the acknowledged schedule after reload', async () => {
    const save = vi.spyOn(api, 'saveLiturgicalReminder').mockResolvedValue({ ...off, enabled: true })
    const view = render(<LiturgicalReminderSettings />)
    const toggle = await screen.findByRole('checkbox', { name: 'Nhận lịch phụng vụ hằng ngày' })
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(screen.getByLabelText('Giờ nhắc')).toHaveValue('08:00')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lịch nhắc' }))
    await screen.findByRole('status')
    expect(save).toHaveBeenCalledWith({ enabled: true, time: '08:00' })
    expect(screen.getByText('Đã lên lịch hằng ngày lúc 08:00, giờ Việt Nam.')).toBeInTheDocument()
    vi.mocked(api.getLiturgicalReminder).mockResolvedValue({ ...off, enabled: true })
    view.unmount(); render(<LiturgicalReminderSettings />)
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked())
  })

  it('keeps the previous saved state on failure and can retry loading without claiming success', async () => {
    vi.mocked(api.getLiturgicalReminder).mockRejectedValueOnce(new Error('Unavailable'))
    const save = vi.spyOn(api, 'saveLiturgicalReminder').mockRejectedValue(new Error('Mất kết nối'))
    render(<LiturgicalReminderSettings />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải lịch nhắc')
    expect(screen.getByRole('button', { name: 'Lưu lịch nhắc' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại tải lịch nhắc' }))
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled())
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lịch nhắc' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối')
    expect(screen.getByText('Lịch nhắc đang tắt.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(save).toHaveBeenCalledOnce()
  })

  it('does not apply a delayed save to a different signed-in account', async () => {
    let finish!: (value: typeof off) => void
    vi.spyOn(api, 'saveLiturgicalReminder').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    render(<LiturgicalReminderSettings />)
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled())
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lịch nhắc' }))
    useAuthStore.setState({ user: { id: 'liturgical-ui-b', parishId: 'another-parish' } as any })
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled())
    finish({ ...off, enabled: true })
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked())
    expect(screen.queryByText('Đã lên lịch hằng ngày lúc 08:00, giờ Việt Nam.')).not.toBeInTheDocument()
  })
})
