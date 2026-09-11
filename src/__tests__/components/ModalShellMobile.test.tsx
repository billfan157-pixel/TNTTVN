import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ModalShell } from '../../components/common/ModalShell'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import { Button } from '../../components/common/ui/Button'

describe('ModalShell Mobile Mode & Responsive Optimization', () => {
  it('renders mobile sheet grabber handle by default in bottom-sheet mode', () => {
    render(
      <ModalShell isOpen onClose={vi.fn()} title="Tiêu đề Modal">
        <p>Nội dung modal</p>
      </ModalShell>,
    )

    const grabber = screen.getByTestId('mobile-sheet-grabber')
    expect(grabber).toBeInTheDocument()
    expect(grabber).toHaveClass('sm:hidden')
    expect(grabber.firstElementChild).toHaveClass('sheet-grabber')
  })

  it('omits mobile sheet grabber handle when mobileDisplay is fullscreen', () => {
    render(
      <ModalShell isOpen onClose={vi.fn()} title="Tiêu đề Modal" mobileDisplay="fullscreen">
        <p>Nội dung modal fullscreen</p>
      </ModalShell>,
    )

    expect(screen.queryByTestId('mobile-sheet-grabber')).toBeNull()
  })

  it('applies modal-content--shell class and responsive padding structure', () => {
    render(
      <ModalShell isOpen onClose={vi.fn()} title="Tiêu đề Modal">
        <p>Nội dung modal</p>
      </ModalShell>,
    )

    const modalContent = screen.getByRole('dialog').querySelector('.modal-content')
    expect(modalContent).toHaveClass('modal-content--shell', '!p-0', 'flex', 'flex-col')

    const header = modalContent?.querySelector('.modal-content__header')
    expect(header).toHaveClass('px-4', 'py-3', 'sm:px-6', 'sm:py-4')

    const body = modalContent?.querySelector('.modal-content__body')
    expect(body).toHaveClass('p-4', 'sm:p-6', 'overscroll-contain')
  })

  it('applies safe-area padding to body when no footer is provided', () => {
    render(
      <ModalShell isOpen onClose={vi.fn()} title="Tiêu đề Modal">
        <p>Nội dung modal không có footer</p>
      </ModalShell>,
    )

    const modalContent = screen.getByRole('dialog').querySelector('.modal-content')
    const body = modalContent?.querySelector('.modal-content__body')
    expect(body?.className).toContain('pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))]')
  })

  it('renders footer with safe-area padding and !m-0 when footer is provided', () => {
    render(
      <ModalShell
        isOpen
        onClose={vi.fn()}
        title="Tiêu đề Modal"
        footer={<Button>Xác nhận</Button>}
      >
        <p>Nội dung modal có footer</p>
      </ModalShell>,
    )

    const modalContent = screen.getByRole('dialog').querySelector('.modal-content')
    const footer = modalContent?.querySelector('.modal-content__footer')
    expect(footer).toBeInTheDocument()
    expect(footer).toHaveClass('!m-0', 'px-4', 'py-3', 'sm:px-6', 'border-t')
    expect(footer?.className).toContain('pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.5rem))]')
  })

  it('renders close button with mobile-touch-target class', () => {
    render(
      <ModalShell isOpen onClose={vi.fn()} title="Tiêu đề Modal">
        <p>Nội dung</p>
      </ModalShell>,
    )

    const closeBtn = screen.getByRole('button', { name: 'Đóng' })
    expect(closeBtn).toBeInTheDocument()
    expect(closeBtn).toHaveClass('mobile-touch-target')
  })

  it('renders header actions and subtitle in responsive layout', () => {
    render(
      <ModalShell
        isOpen
        onClose={vi.fn()}
        title="Tiêu đề Modal"
        subtitle="Mô tả phụ cho modal"
        headerActions={<button type="button">Hành động</button>}
      >
        <p>Nội dung</p>
      </ModalShell>,
    )

    expect(screen.getByText('Mô tả phụ cho modal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hành động' })).toBeInTheDocument()
  })

  it('supports fullscreen mobile display class modifiers', () => {
    render(
      <ModalShell isOpen onClose={vi.fn()} title="Tiêu đề Modal" mobileDisplay="fullscreen">
        <p>Nội dung</p>
      </ModalShell>,
    )

    const modalContent = screen.getByRole('dialog').querySelector('.modal-content')
    expect(modalContent?.className).toContain('h-[100dvh]')
    expect(modalContent?.className).toContain('rounded-none')
  })
})

describe('ConfirmDialog Mobile Mode & Responsive Optimization', () => {
  it('renders ConfirmDialog with responsive padding and mobile stacked buttons', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <ConfirmDialog
        isOpen
        title="Xác nhận thao tác nguy hiểm"
        message="Dữ liệu sẽ bị xóa hoàn toàn."
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmText="Xóa vĩnh viễn"
        cancelText="Hủy bỏ"
        variant="danger"
      />,
    )

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveClass('app-confirm-layer')

    const modalContent = dialog.querySelector('.modal-content')
    expect(modalContent).toHaveClass('w-full', 'max-w-[420px]', 'p-5', 'sm:p-6')

    const confirmBtn = screen.getByRole('button', { name: 'Xóa vĩnh viễn' })
    expect(confirmBtn).toHaveClass('w-full', 'sm:w-auto', 'min-h-11')

    const cancelBtn = screen.getByRole('button', { name: 'Hủy bỏ' })
    expect(cancelBtn).toHaveClass('w-full', 'sm:w-auto', 'min-h-11')

    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
