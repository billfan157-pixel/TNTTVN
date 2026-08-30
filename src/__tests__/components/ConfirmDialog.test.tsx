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

  it('mounts the alert dialog at document.body and releases the shared body lock', () => {
    const { container, unmount } = render(
      <ConfirmDialog isOpen={true} message="Test" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    const dialog = screen.getByRole('alertdialog')

    expect(document.body).toContainElement(dialog)
    expect(container).not.toContainElement(dialog)
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
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
    render(<ConfirmDialog isOpen={true} message="Test" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('alertdialog'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog isOpen={true} message="Test" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('routes Escape to the top-most portaled confirmation only', () => {
    const onOuterCancel = vi.fn()
    const onInnerCancel = vi.fn()
    render(
      <>
        <ConfirmDialog isOpen={true} message="Outer" onConfirm={vi.fn()} onCancel={onOuterCancel} />
        <ConfirmDialog isOpen={true} message="Inner" onConfirm={vi.fn()} onCancel={onInnerCancel} />
      </>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onInnerCancel).toHaveBeenCalledTimes(1)
    expect(onOuterCancel).not.toHaveBeenCalled()
  })

  it('does not call onCancel for non-Escape keys', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog isOpen={true} message="Test" onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('uses danger variant colors', () => {
    render(<ConfirmDialog isOpen={true} message="Test" variant="danger" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận' })
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

