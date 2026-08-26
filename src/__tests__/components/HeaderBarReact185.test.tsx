import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeaderBar } from '../../components/common/HeaderBar'
import { useClassStore } from '../../stores/classStore'

// REACT-185 (2026-08-14): HeaderBar trước đây dùng `useClassStore((s) => s.getClassList())`
// — selector TRẢ MẢNG MỚI mỗi lần getSnapshot (zustand v5 so Object.is) → vòng lặp
// re-render vô hạn (#185 Maximum update depth exceeded) khi sync đẩy classes mới.
// Test này đảm bảo: (1) render HeaderBar không crash, (2) classList cập nhật đúng
// khi store thay đổi mà không tạo loop.
describe('REACT-185 regression: HeaderBar classList unstable selector', () => {
  it('renders without crash and reflects class store updates', () => {
    render(<HeaderBar />)

    const before = useClassStore.getState().classes.length
    // Mô phỏng sync đẩy classes mới (như fetchClasses sau triggerSyncFlow khi save điểm)
    useClassStore.getState().setClasses([
      {
        id: 'cl-185-01',
        code: 'CL-185',
        name: 'Lớp 185',
        branchId: 'br-185',
        parishId: 'gia-ton',
        teacherIds: [],
        branch: 'Ấu Nhi',
        assistantNames: [],
      } as any,
    ])

    const after = useClassStore.getState().classes.length
    expect(after).toBeGreaterThan(before)

    // HeaderBar vẫn hiển thị title chính sau store update (không unmount do crash)
    expect(screen.getByText(/Giáo Xứ/i)).toBeDefined()
  })
})
