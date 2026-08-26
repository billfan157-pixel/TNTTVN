import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InstallPrompt } from '../../components/common/InstallPrompt'

const mockInstall = vi.fn()

vi.mock('../../hooks/useInstallPrompt', () => ({
  useInstallPrompt: vi.fn(() => ({ canInstall: false, install: mockInstall })),
}))

vi.mock('lucide-react', () => ({
  Download: 'svg',
}))

describe('InstallPrompt', () => {
  it('renders nothing when canInstall is false', () => {
    const { container } = render(<InstallPrompt />)
    expect(container.innerHTML).toBe('')
  })

  it('renders install button when canInstall is true', async () => {
    const mod = await import('../../hooks/useInstallPrompt')
    vi.mocked(mod.useInstallPrompt).mockReturnValueOnce({ canInstall: true, install: mockInstall })
    render(<InstallPrompt />)
    expect(screen.getByText('Cài đặt ứng dụng')).toBeDefined()
  })

  it('calls install when button is clicked', async () => {
    const mod = await import('../../hooks/useInstallPrompt')
    vi.mocked(mod.useInstallPrompt).mockReturnValueOnce({ canInstall: true, install: mockInstall })
    render(<InstallPrompt />)
    fireEvent.click(screen.getByText('Cài đặt ứng dụng'))
    expect(mockInstall).toHaveBeenCalledTimes(1)
  })
})
