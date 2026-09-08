
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PageHeader } from '../../components/common/PageHeader'
import { SubpageHeader } from '../../components/common/SubpageHeader'
import { ModalShell } from '../../components/common/ModalShell'
import { FormField } from '../../components/common/FormField'

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}))

describe('PageHeader (DS §5 / ADR-032)', () => {
  it('renders title and description', () => {
    render(<PageHeader title="Quản lý học viên" description="Danh sách học viên" />)
    expect(screen.getByRole('heading', { name: 'Quản lý học viên' })).toHaveClass('page-header__title')
    expect(screen.getByText('Danh sách học viên')).toHaveClass('page-header__description')
  })

  it('renders icon tile with DS classes', () => {
    render(<PageHeader title="T" icon={<span data-testid="icon" />} />)
    const tile = screen.getByTestId('icon').parentElement
    expect(tile).toHaveClass('page-header__icon')
  })

  it('renders actions on the right', () => {
    render(<PageHeader title="T" actions={<button>Thêm mới</button>} />)
    expect(screen.getByRole('button', { name: 'Thêm mới' })).toBeInTheDocument()
  })

  it('uses the shared elevated page-header surface by default', () => {
    const { container } = render(<PageHeader title="T" />)
    expect(container.firstElementChild).toHaveClass('page-header', 'page-header--card')
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

  it('mounts the dialog at document.body so route transitions cannot clip it', () => {
    const { container } = render(<ModalShell isOpen onClose={vi.fn()} title="T">x</ModalShell>)
    const dialog = screen.getByRole('dialog')
    expect(document.body).toContainElement(dialog)
    expect(container).not.toContainElement(dialog)
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<ModalShell isOpen onClose={onClose} title="T">x</ModalShell>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on overlay click but not inner click', () => {
    const onClose = vi.fn()
    render(<ModalShell isOpen onClose={onClose} title="T">x</ModalShell>)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('x'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close on overlay click when closeOnOverlay=false', () => {
    const onClose = vi.fn()
    render(<ModalShell isOpen onClose={onClose} title="T" closeOnOverlay={false}>x</ModalShell>)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('close button has aria-label Đóng', () => {
    render(<ModalShell isOpen onClose={vi.fn()} title="T">x</ModalShell>)
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveClass('btn', 'btn-icon', 'btn-ghost')
  })
})

describe('FormField (DS §3.2 / ADR-032)', () => {
  it('renders label with required marker', () => {
    render(<FormField label="Họ tên" htmlFor="name" required><input id="name" /></FormField>)
    expect(screen.getByText('Họ tên')).toHaveClass('form-label')
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

  it('merges caller aria-describedby with hint and error ids', () => {
    render(
      <FormField label="Họ tên" htmlFor="name" hint="Nhập đầy đủ">
        <input id="name" aria-describedby="external-help" />
      </FormField>,
    )
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'external-help name-hint')
  })
})

describe('SubpageHeader (DS §23 / DS v4.5)', () => {
  it('renders semantic section with title and subpage-header classes', () => {
    render(
      <SubpageHeader
        icon={<span data-testid="subpage-icon" />}
        title="Bảng Điểm Lớp"
        meta="Học kỳ I · 35 em"
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Bảng Điểm Lớp' })).toHaveClass('subpage-header__title')
    expect(screen.getByText('Học kỳ I · 35 em')).toHaveClass('subpage-header__meta')
    expect(screen.getByTestId('subpage-icon').parentElement).toHaveClass('subpage-header__icon')
  })

  it('renders eyebrow and badge when provided', () => {
    render(
      <SubpageHeader
        icon={<span>Icon</span>}
        title="Tiêu đề"
        eyebrow="Khối Ấu Nhi"
        badge={<span data-testid="subpage-badge">Đang mở</span>}
      />,
    )
    expect(screen.getByText('Khối Ấu Nhi')).toHaveClass('subpage-header__eyebrow')
    expect(screen.getByTestId('subpage-badge').parentElement).toHaveClass('subpage-header__badge')
  })

  it('renders actions and toolbar children', () => {
    render(
      <SubpageHeader
        icon={<span>Icon</span>}
        title="Tiêu đề"
        actions={<button>Xuất Excel</button>}
      >
        <div data-testid="toolbar-child">Filter</div>
      </SubpageHeader>,
    )
    expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeInTheDocument()
    expect(screen.getByTestId('toolbar-child').parentElement).toHaveClass('subpage-header__toolbar')
  })

  it('applies titleId to the heading when provided', () => {
    render(
      <SubpageHeader
        icon={<span>Icon</span>}
        title="Phiên Điểm Danh"
        titleId="attendance-session-title"
      />,
    )
    const heading = screen.getByRole('heading', { level: 2, name: 'Phiên Điểm Danh' })
    expect(heading).toHaveAttribute('id', 'attendance-session-title')
  })
})

