import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ParishLogoModal } from '../../components/parish/ParishLogoModal'
import { PARISH_LOGO_MEANING } from '../../constants/parishLogoMeaning'

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}))

describe('ParishLogoModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ParishLogoModal isOpen={false} onClose={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders hero, explorer nav and default symbol detail when open', () => {
    render(<ParishLogoModal isOpen={true} onClose={vi.fn()} />)

    // Title & subtitle
    expect(screen.getAllByText('Ý Nghĩa Logo Xứ Đoàn').length).toBeGreaterThan(0)
    expect(screen.getByText(/Giáo Xứ Gia Tôn — Xứ Đoàn Thiếu Nhi Thánh Thể Đức Mẹ Fatima/)).toBeDefined()

    // Overview
    expect(screen.getByText(PARISH_LOGO_MEANING.overview)).toBeDefined()

    // Explorer nav shows all 4 symbols (accessible name uses full title)
    for (const symbol of PARISH_LOGO_MEANING.symbols) {
      expect(screen.getByRole('button', { name: `Xem ý nghĩa ${symbol.title}` })).toBeDefined()
    }

    // Default detail is the first symbol with its scripture
    expect(screen.getByText('Con Thuyền Đức Tin & Thánh Giá')).toBeDefined()
    expect(screen.getByText(/Hãy ra khơi và thả lưới mà bắt cá/)).toBeDefined()
  })

  it('uses a wide desktop dialog shell (mobile stays bottom-sheet via DS CSS)', () => {
    render(<ParishLogoModal isOpen={true} onClose={vi.fn()} />)

    const dialog = document.body.querySelector('.modal-content')
    expect(dialog?.getAttribute('style')).toContain('1024px')
  })

  it('switches detail panel and reveals 5 branches on colors symbol', () => {
    render(<ParishLogoModal isOpen={true} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Năm Sắc Màu/ }))

    expect(screen.getByText('Năm Sắc Màu Ngành')).toBeDefined()
    for (const branch of PARISH_LOGO_MEANING.branches) {
      expect(screen.getByText(branch.name)).toBeDefined()
    }

    fireEvent.click(screen.getByRole('button', { name: /Đức Mẹ Fatima/ }))
    expect(screen.getByText('Đức Mẹ Fatima — Đấng Bổn Mạng')).toBeDefined()
    expect(screen.getByText(/Giáo hạt Gia Kiệm/)).toBeDefined()
  })

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    render(<ParishLogoModal isOpen={true} onClose={handleClose} />)

    const closeButtons = screen.getAllByRole('button', { name: 'Đóng' })
    expect(closeButtons.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(closeButtons[closeButtons.length - 1])
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('supports thumb-friendly prev and next journey navigation on mobile', () => {
    render(<ParishLogoModal isOpen={true} onClose={vi.fn()} />)

    const prevBtn = screen.getByRole('button', { name: 'Biểu tượng trước' })
    const nextBtn = screen.getByRole('button', { name: 'Biểu tượng tiếp theo' })

    // Ban đầu ở chặng 1: Nút trước bị vô hiệu
    expect(prevBtn).toHaveProperty('disabled', true)
    expect(nextBtn).toHaveProperty('disabled', false)
    expect(screen.getByText('Con Thuyền Đức Tin & Thánh Giá')).toBeDefined()

    // Bấm Tiếp theo -> Chuyển sang chặng 2 (Năm Sắc Màu)
    fireEvent.click(nextBtn)
    expect(screen.getByText('Năm Sắc Màu Ngành')).toBeDefined()
    expect(prevBtn).toHaveProperty('disabled', false)

    // Bấm Tiếp theo -> Chuyển sang chặng 3 (Đức Mẹ Fatima)
    fireEvent.click(nextBtn)
    expect(screen.getByText('Đức Mẹ Fatima — Đấng Bổn Mạng')).toBeDefined()

    // Bấm Tiếp theo -> Chuyển sang chặng 4 (Nhà Thờ Gia Tôn)
    fireEvent.click(nextBtn)
    expect(screen.getByText('Tòa Nhà Giáo Đường Gia Tôn')).toBeDefined()
    expect(nextBtn).toHaveProperty('disabled', true)

    // Bấm Chặng trước -> Quay lại chặng 3 (Đức Mẹ Fatima)
    fireEvent.click(prevBtn)
    expect(screen.getByText('Đức Mẹ Fatima — Đấng Bổn Mạng')).toBeDefined()
    expect(nextBtn).toHaveProperty('disabled', false)
  })
})

