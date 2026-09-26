import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { LandingPage } from '../pages/LandingPage'
import { ROUTE_POLICIES, canRoleAccessRoute } from '../constants/routePolicy'
import { useAuthStore } from '../stores/authStore'
import { useAcademicYearStore } from '../stores/academicYearStore'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

describe('LandingPage — trang giới thiệu public trước đăng nhập', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useAuthStore.setState({ user: null, isAuthenticated: false })
    useAcademicYearStore.setState({ currentYear: '' })
  })

  it('exposes / and /about as public routes without roles', () => {
    for (const p of ['/', '/about'] as const) {
      expect(ROUTE_POLICIES[p].requiresAuth).toBe(false)
      expect(ROUTE_POLICIES[p].roles).toEqual([])
      expect(canRoleAccessRoute(p, null)).toBe(true)
      expect(canRoleAccessRoute(p, 'phuhuynh')).toBe(true)
    }
  })

  it('renders hero identity and sets document title without requiring login', () => {
    render(<LandingPage />)

    expect(screen.getByRole('heading', { level: 1, name: /quản lý giáo lý/i })).toBeInTheDocument()
    expect(screen.getAllByText(/Xứ Đoàn Đức Mẹ Fatima/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Thiếu Nhi Thánh Thể Việt Nam/).length).toBeGreaterThanOrEqual(1)
    expect(document.title).toContain('Catevia')
    // Chưa đăng nhập → CTA chính dẫn tới đăng nhập
    expect(screen.getAllByRole('button', { name: /bắt đầu đăng nhập/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('renders interactive hero preview tabs (Học vụ, Xứ đoàn, Phụ huynh)', () => {
    const { container } = render(<LandingPage />)
    const preview = within(container.querySelector('.landing-preview-device') as HTMLElement)

    // Tab Học vụ mặc định active
    expect(preview.getByText(/Lớp Thiếu Nhi 1A/)).toBeInTheDocument()
    expect(preview.getByText(/Chuyên cần Lễ/)).toBeInTheDocument()

    // Chuyển sang tab Xứ đoàn
    const orgTab = screen.getByRole('tab', { name: /xứ đoàn/i })
    fireEvent.click(orgTab)
    expect(preview.getByText(/Thánh Lễ Bổn Mạng Xứ Đoàn/i)).toBeInTheDocument()

    // Chuyển sang tab Phụ huynh
    const parentTab = screen.getByRole('tab', { name: /phụ huynh/i })
    fireEvent.click(parentTab)
    expect(preview.getByText(/Sổ liên lạc điện tử/)).toBeInTheDocument()
    expect(preview.getByText(/Đơn xin phép nghỉ trực tuyến/)).toBeInTheDocument()
  })

  it('toggles mobile navigation menu when clicking hamburger button', () => {
    render(<LandingPage />)

    const menuBtn = screen.getByRole('button', { name: /mở menu điều hướng/i })
    expect(menuBtn).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /menu di động/i })).not.toBeInTheDocument()

    fireEvent.click(menuBtn)
    expect(screen.getByRole('navigation', { name: /menu di động/i })).toBeInTheDocument()

    // Nhấp đóng lại
    const closeBtn = screen.getByRole('button', { name: /đóng menu/i })
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('navigation', { name: /menu di động/i })).not.toBeInTheDocument()
  })

  it('supports keyboard tabs and scrolls to the selected chapter without a timer override', () => {
    const { container } = render(<LandingPage />)
    const scroll = vi.fn()
    const parentChapter = container.querySelector('#story-parent') as HTMLElement
    parentChapter.scrollIntoView = scroll
    const academic = screen.getByRole('tab', { name: /học vụ/i })
    fireEvent.keyDown(academic, { key: 'End' })
    const parent = screen.getByRole('tab', { name: /phụ huynh/i })
    expect(parent).toHaveFocus()
    expect(parent).toHaveAttribute('aria-selected', 'true')
    expect(parent).toHaveAttribute('tabindex', '0')
    expect(academic).toHaveAttribute('tabindex', '-1')
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    fireEvent.keyDown(parent, { key: 'Home' })
    expect(academic).toHaveFocus()
    expect(academic).toHaveAttribute('aria-selected', 'true')
  })

  it('renders two authentication paths and three workspace stories', () => {
    render(<LandingPage />)

    // 2 authentication paths
    expect(screen.getByRole('heading', { name: /cổng glv & huynh trưởng/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /cổng phụ huynh/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /đăng nhập glv & huynh trưởng/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /đăng nhập phụ huynh/i }).length).toBeGreaterThanOrEqual(1)

    // 3 workspace stories
    expect(screen.getByRole('heading', { name: /từ buổi học đến trọn vẹn cả niên khóa/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /một nơi để toàn thể xứ đoàn cùng vận hành/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /phụ huynh luôn biết con mình đang đồng hành thế nào/i })).toBeInTheDocument()
  })

  it('renders the 3 portals bento structure and onboarding guide', () => {
    const { container } = render(<LandingPage />)
    const accessSection = container.querySelector('#cong-dang-nhap') as HTMLElement
    expect(accessSection).toBeInTheDocument()

    // 3 portals
    expect(within(accessSection).getByRole('heading', { name: /cổng phụ huynh/i })).toBeInTheDocument()
    expect(within(accessSection).getByRole('heading', { name: /cổng glv & huynh trưởng/i })).toBeInTheDocument()
    expect(within(accessSection).getByRole('heading', { name: /xác thực chứng chỉ giáo lý/i })).toBeInTheDocument()

    // Onboarding 3 steps inside access section
    expect(within(accessSection).getByRole('heading', { name: /lần đầu đến với catevia\?/i })).toBeInTheDocument()
    expect(within(accessSection).getByText('Nhận tài khoản')).toBeInTheDocument()
    expect(within(accessSection).getByText('Chọn đúng cổng')).toBeInTheDocument()
    expect(within(accessSection).getByText('Đồng hành mọi nơi')).toBeInTheDocument()
  })

  it('renders the five TNTT branches with border color classes and without hardcoded colors', () => {
    const { container } = render(<LandingPage />)

    for (const name of ['Chiên Con', 'Ấu Nhi', 'Thiếu Nhi', 'Nghĩa Sĩ', 'Hiệp Sĩ']) {
      expect(screen.getByText(name, { exact: true })).toBeInTheDocument()
    }
    // Không có mã màu hex cứng trong markup render
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    // Có chứa class viền màu ngành
    expect(container.innerHTML).toContain('border-t-branch-chiencon')
    expect(container.innerHTML).toContain('border-t-branch-aunhi')
  })

  it('shows "Vào hệ thống" when a session already exists', () => {
    useAuthStore.setState({
      user: { id: 'u1', username: 'glv1', fullName: 'GLV 1', role: 'chunhiem', status: 'ACTIVE', parishId: 'p1' },
      isAuthenticated: true,
    })
    render(<LandingPage />)

    expect(screen.getAllByRole('button', { name: /vào hệ thống/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByRole('button', { name: /bắt đầu đăng nhập/i })).not.toBeInTheDocument()
  })

  it('performs no data fetching on the public surface', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<LandingPage />)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('renders the parish group photo accessible and CLS-safe', () => {
    render(<LandingPage />)

    const photo = screen.getByRole('img', { name: /tập thể huynh trưởng và thiếu nhi/i })
    expect(photo).toHaveAttribute('src', '/images/xu-doan-tap-the-original.jpg')
    // Kích thước tường minh giữ chỗ trước khi ảnh tải → không giật layout
    expect(photo).toHaveAttribute('width', '2480')
    expect(photo).toHaveAttribute('height', '1772')
    // Ảnh hero trên màn hình đầu → ưu tiên tải, không lazy
    expect(photo).toHaveAttribute('decoding', 'async')
    expect(photo).toHaveAttribute('fetchpriority', 'high')

    // Thẻ Kính Nổi (Frosted Glass Panel) chứa đầy đủ thông tin nhận diện xứ đoàn
    const glassFigure = screen.getByRole('figure')
    expect(within(glassFigure).getByText('Xứ Đoàn Đức Mẹ Fatima')).toBeInTheDocument()
    expect(within(glassFigure).getByText(/Giáo Xứ Gia Tôn/)).toBeInTheDocument()
    expect(within(glassFigure).getByText(/Bổn mạng Xứ Đoàn/)).toBeInTheDocument()
    expect(within(glassFigure).getByText('4 Tôn Chỉ TNTT')).toBeInTheDocument()
    expect(within(glassFigure).getByText(/Cầu nguyện · Rước lễ · Hy sinh · Làm việc tông đồ/)).toBeInTheDocument()
    expect(within(glassFigure).getByText(/Niên khóa 2025–2026/)).toBeInTheDocument()
  })

  it('renders trust and reliability commitments', () => {
    render(<LandingPage />)

    expect(screen.getByRole('heading', { level: 2, name: /bền bỉ, an toàn và tôn trọng quyền riêng tư/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /ngoại tuyến \(offline-first\)/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /phân quyền theo vai trò/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /máy tính & điện thoại pwa/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /dữ liệu thuộc về giáo xứ/i })).toBeInTheDocument()
  })

  it('renders FAQ accordion with 6 questions and supports toggle interaction', () => {
    render(<LandingPage />)

    expect(screen.getByRole('heading', { level: 2, name: /câu hỏi thường gặp/i })).toBeInTheDocument()

    // 6 questions exist
    const q1Btn = screen.getByRole('button', { name: /làm thế nào để tôi có tài khoản/i })
    expect(q1Btn).toBeInTheDocument()
    expect(q1Btn).toHaveAttribute('aria-expanded', 'false')

    // Initial state: answer is not visible
    expect(screen.queryByText(/tài khoản do ban giáo lý/i)).not.toBeInTheDocument()

    // Click to open question 1
    fireEvent.click(q1Btn)
    expect(q1Btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/tài khoản do ban giáo lý/i)).toBeInTheDocument()

    // Click to close question 1
    fireEvent.click(q1Btn)
    expect(q1Btn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/tài khoản do ban giáo lý/i)).not.toBeInTheDocument()

    // Open question 4 (Offline)
    const q4Btn = screen.getByRole('button', { name: /khi nhà thờ không có wifi/i })
    fireEvent.click(q4Btn)
    expect(q4Btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/catevia hoạt động theo cơ chế ngoại tuyến/i)).toBeInTheDocument()
  })

  it('renders "Lần đầu đến với Catevia?" section and parish data commitment in footer', () => {
    render(<LandingPage />)

    expect(screen.getByRole('heading', { level: 2, name: /lần đầu đến với catevia\?/i })).toBeInTheDocument()
    expect(screen.getByText(/dữ liệu thuộc về xứ đoàn đức mẹ fatima — giáo xứ gia tôn/i)).toBeInTheDocument()
    expect(screen.getByText(/quyền truy cập được phân theo vai trò/i)).toBeInTheDocument()
  })

  it('dynamically reflects active academic year from useAcademicYearStore', () => {
    useAcademicYearStore.setState({ currentYear: '2027-2028' })
    render(<LandingPage />)

    const glassFigure = screen.getByRole('figure')
    expect(within(glassFigure).getByText(/Niên khóa 2027–2028/)).toBeInTheDocument()
    expect(screen.getAllByText(/Lớp Thiếu Nhi 1A — niên khóa 2027–2028/).length).toBeGreaterThanOrEqual(2)
  })

  it('renders the integrated Bento stats strip with 4 key metrics', () => {
    render(<LandingPage />)

    const statsRegion = screen.getByRole('region', { name: /thông số hệ thống catevia/i })
    expect(statsRegion).toBeInTheDocument()
    expect(within(statsRegion).getByText('Ngành sinh hoạt TNTT')).toBeInTheDocument()
    expect(within(statsRegion).getByText('Không gian làm việc')).toBeInTheDocument()
    expect(within(statsRegion).getByText('Cổng đăng nhập')).toBeInTheDocument()
    expect(within(statsRegion).getByText('Tài khoản — 1 Vai trò')).toBeInTheDocument()
  })
})
