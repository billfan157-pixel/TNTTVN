/**
 * Hợp đồng mobile của QuickScoreEntry (< 1024px): mỗi em một thẻ thay vì bảng
 * 1312px trôi ngoài màn hình — ô nhập có nhãn riêng từng em, lưu bằng nút "Lưu"
 * tường minh, giữ nguyên kiểm tra khoảng điểm và badge điểm tự luận.
 * jsdom không có matchMedia (hook trả false = bảng desktop), nên mọi test ở đây
 * phải stub mobile tường minh.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QuickScoreEntry } from '../../components/exam/QuickScoreEntry'

function stubMobileViewport() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
  }))
}

const an = { id: 'ST-1', name: 'Nguyễn Văn An', code: 'TN001', holyName: 'Giuse' }
const binh = { id: 'ST-2', name: 'Trần Bình', code: 'TN002', holyName: null }

describe('QuickScoreEntry — danh sách thẻ mobile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('render một thẻ cho mỗi em kèm ô nhập có nhãn thay cho bảng rộng', () => {
    stubMobileViewport()
    render(<QuickScoreEntry students={[an, binh]} savedScores={{ 'ST-1': 8 }} maxScore={10} onSave={vi.fn()} />)

    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Nhập điểm cho Nguyễn Văn An' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nhập điểm cho Trần Bình' })).toBeInTheDocument()
    expect(screen.getByText('Đã lưu: 8')).toBeInTheDocument()
    expect(screen.getByText('Chưa có điểm')).toBeInTheDocument()
  })

  it('chỉ lưu qua nút Lưu tường minh, nhận dấu phẩy thập phân và chặn điểm ngoài khoảng', () => {
    stubMobileViewport()
    const onSave = vi.fn()
    render(<QuickScoreEntry students={[an]} savedScores={{}} maxScore={10} onSave={onSave} />)

    const input = screen.getByRole('textbox', { name: 'Nhập điểm cho Nguyễn Văn An' })
    const save = screen.getByRole('button', { name: 'Lưu' })
    expect(save).toBeDisabled()

    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Điểm từ 0 đến 10')

    // Tây/Nam bộ gõ dấu phẩy: input[type=number] sẽ nuốt giá trị "9,5" thành rỗng.
    fireEvent.change(input, { target: { value: '9,5' } })
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledWith('ST-1', 9.5)
  })

  it('hiện badge điểm tự luận và điểm tổng TN+TL ở chế độ tự luận', () => {
    stubMobileViewport()
    render(
      <QuickScoreEntry
        students={[an]}
        savedScores={{ 'ST-1': 7 }}
        totalScores={{ 'ST-1': 8.5 }}
        maxScore={4}
        onSave={vi.fn()}
        essayMode
      />,
    )

    expect(screen.getByText('Điểm TL: 7')).toBeInTheDocument()
    expect(screen.getByText('Tổng (TN+TL): 8.5')).toBeInTheDocument()
  })
})
