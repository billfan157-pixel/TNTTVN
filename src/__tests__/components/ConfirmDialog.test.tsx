import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}))

vi.mock('lucide-react', () => ({
  AlertTriangle: 'svg',
}))

describe('ConfirmDialog', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ConfirmDialog isOpen={false} message="Test" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders message and buttons when isOpen is true', () => {
    render(<ConfirmDialog isOpen={true} message="Are you sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Are you sure?')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDefined()
    expect(screen.getByText('Hủy')).toBeDefined()
  })

  it('renders custom button text', () => {
    render(<ConfirmDialog isOpen={true} message="Test" confirmText="Xóa" cancelText="Không" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Xóa')).toBeDefined()
    expect(screen.getByText('Không')).toBeDefined()
  })

  it('renders custom title', () => {
    render(<ConfirmDialog isOpen={true} title="Cảnh báo" message="Test" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Cảnh báo')).toBeDefined()
  })

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog isOpen={true} message="Test" onConfirm={onConfirm} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog isOpen={true} message="Test" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Hủy'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when overlay is clicked', () => {
    const onCancel = vi.fn()
    const { container } = render(<ConfirmDialog isOpen={true} message="Test" onConfirm={vi.fn()} onCancel={onCancel} />)
    const overlay = container.querySelector('[role="alertdialog"]')
    fireEvent.click(overlay!)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog isOpen={true} message="Test" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not call onCancel for non-Escape keys', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog isOpen={true} message="Test" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('uses danger variant colors', () => {
    const { container } = render(<ConfirmDialog isOpen={true} message="Test" variant="danger" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    const overlay = container.querySelector('[role="alertdialog"]')
    expect(overlay).toBeDefined()
    const buttons = container.querySelectorAll('button')
    const confirmBtn = buttons[buttons.length - 1]
    expect(confirmBtn.style.background).toContain('var(--color-parish-danger)')
  })

  it('stops propagation when clicking inside modal', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog isOpen={true} message="Test" onConfirm={vi.fn()} onCancel={onCancel} />)
    const inner = document.querySelector('.modal-content')
    fireEvent.click(inner!)
    expect(onCancel).not.toHaveBeenCalled()
  })
})

