import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PageHeader } from '../../components/common/PageHeader'
import { ModalShell } from '../../components/common/ModalShell'
import { FormField } from '../../components/common/FormField'

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}))

describe('PageHeader (DS §5 / ADR-032)', () => {
  it('renders title and description', () => {
    render(<PageHeader title="Quản lý học viên" description="Danh sách học viên" />)
    expect(screen.getByRole('heading', { name: 'Quản lý học viên' })).toHaveClass('text-lg', 'font-extrabold', 'text-text-main')
    expect(screen.getByText('Danh sách học viên')).toHaveClass('text-xs', 'text-text-muted')
  })

  it('renders icon tile with DS classes', () => {
    render(<PageHeader title="T" icon={<span data-testid="icon" />} />)
    const tile = screen.getByTestId('icon').parentElement
    expect(tile).toHaveClass('bg-parish-primary-light', 'text-parish-primary')
  })

  it('renders actions on the right', () => {
    render(<PageHeader title="T" actions={<button>Thêm mới</button>} />)
    expect(screen.getByRole('button', { name: 'Thêm mới' })).toBeInTheDocument()
  })
})

describe('ModalShell (DS / ADR-032)', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ModalShell isOpen={false} onClose={vi.fn()} title="T">x</ModalShell>)
    expect(container.innerHTML).toBe('')
  })

  it('renders dialog with aria attributes and title', () => {
    render(<ModalShell isOpen onClose={vi.fn()} title="Nhập điểm">nội dung</ModalShell>)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Nhập điểm' })).toBeInTheDocument()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<ModalShell isOpen onClose={onClose} title="T">x</ModalShell>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on overlay click but not inner click', () => {
    const onClose = vi.fn()
    const { container } = render(<ModalShell isOpen onClose={onClose} title="T">x</ModalShell>)
    fireEvent.click(container.querySelector('.modal-overlay')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(container.querySelector('.modal-content')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close on overlay click when closeOnOverlay=false', () => {
    const onClose = vi.fn()
    const { container } = render(<ModalShell isOpen onClose={onClose} title="T" closeOnOverlay={false}>x</ModalShell>)
    fireEvent.click(container.querySelector('.modal-overlay')!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('close button has aria-label Đóng', () => {
    render(<ModalShell isOpen onClose={vi.fn()} title="T">x</ModalShell>)
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveClass('btn', 'btn-icon', 'btn-ghost')
  })

  it('separates scrollable body from a persistent footer', () => {
    const { container } = render(
      <ModalShell isOpen onClose={vi.fn()} title="T" footer={<button>Lưu</button>}>
        <span>Nội dung dài</span>
      </ModalShell>,
    )
    expect(container.querySelector('.modal-content__body')).toHaveTextContent('Nội dung dài')
    expect(container.querySelector('.modal-content__footer')).toContainElement(screen.getByRole('button', { name: 'Lưu' }))
  })
})

describe('FormField (DS §3.2 / ADR-032)', () => {
  it('renders label with required marker', () => {
    render(<FormField label="Họ tên" htmlFor="name" required><input id="name" /></FormField>)
    expect(screen.getByText('Họ tên')).toHaveClass('text-xs', 'font-bold')
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('wires aria-invalid and aria-describedby to error', () => {
    render(<FormField label="Họ tên" htmlFor="name" error="Bắt buộc"><input id="name" /></FormField>)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'name-error')
    expect(screen.getByText('Bắt buộc')).toHaveAttribute('role', 'alert')
    expect(screen.getByText('Bắt buộc')).toHaveClass('form-error')
  })

  it('wires aria-describedby to hint when no error', () => {
    render(<FormField label="Họ tên" htmlFor="name" hint="Nhập đầy đủ"><input id="name" /></FormField>)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-describedby', 'name-hint')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('does not render hint when error present', () => {
    render(<FormField label="Họ tên" htmlFor="name" hint="Nhập đầy đủ" error="Sai"><input id="name" /></FormField>)
    expect(screen.queryByText('Nhập đầy đủ')).not.toBeInTheDocument()
  })
})
