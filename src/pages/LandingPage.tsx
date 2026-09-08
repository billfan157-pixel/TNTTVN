import React, { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  HeartHandshake,
  Landmark,
  Menu,
  ShieldCheck,
  Smartphone,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import appLogo from '../assets/app-logo-192.png'
import parishLogo from '../assets/logo-gia-ton.png'
import { BRANCHES } from '../constants/branches'
import { useAuthStore } from '../stores/authStore'
import { LandingHeroPreview } from '../components/landing/LandingHeroPreview'
import { LandingStatsStrip } from '../components/landing/LandingStatsStrip'
import { LandingFAQ } from '../components/landing/LandingFAQ'
import { LandingParishGlassCard } from '../components/landing/LandingParishGlassCard'

const BRANCH_DOT_CLASS: Record<string, string> = {
  ChienCon: 'bg-branch-chiencon',
  AuNhi: 'bg-branch-aunhi',
  ThieuNhi: 'bg-branch-thieunhi',
  NghiaSi: 'bg-branch-nghiasi',
  HiepSi: 'bg-branch-hiepsi',
}

const BRANCH_BORDER_CLASS: Record<string, string> = {
  ChienCon: 'border-t-branch-chiencon',
  AuNhi: 'border-t-branch-aunhi',
  ThieuNhi: 'border-t-branch-thieunhi',
  NghiaSi: 'border-t-branch-nghiasi',
  HiepSi: 'border-t-branch-hiepsi',
}

const PORTALS = [
  {
    icon: GraduationCap,
    title: 'Học Vụ & Giáo Lý',
    description: 'Dành cho Giáo Lý Viên và Ban Điều Hành: đồng hành cùng các em thiếu nhi, theo dõi chuyên cần Thánh Lễ, sổ điểm giáo lý và báo cáo niên khóa.',
    points: ['Danh sách thiếu nhi theo lớp và ngành', 'Sổ điểm giáo lý, bảng tổng kết và học bạ', 'Điểm danh Thánh Lễ Chúa Nhật và giờ giáo lý'],
    to: '/login/nhan-su' as const,
    cta: 'Đăng nhập GLV & Huynh Trưởng',
  },
  {
    icon: Landmark,
    title: 'Xứ Đoàn & Giáo Xứ',
    description: 'Không gian sinh hoạt Xứ Đoàn: lịch phụng vụ, thông báo điều hành, sự kiện xứ đoàn và quỹ sinh hoạt minh bạch.',
    points: ['Hồ sơ, cơ cấu tổ chức và ban huynh trưởng', 'Lịch phụng vụ và sự kiện xứ đoàn', 'Thông báo điều hành và quỹ minh bạch'],
    to: '/login/nhan-su' as const,
    cta: 'Đăng nhập GLV & Huynh Trưởng',
  },
  {
    icon: HeartHandshake,
    title: 'Cổng Phụ Huynh',
    description: 'Dành cho phụ huynh: theo dõi điểm số, chuyên cần Thánh Lễ của con và gửi đơn xin phép vắng học trực tuyến.',
    points: ['Xem điểm và chuyên cần Thánh Lễ của con', 'Gửi đơn xin phép vắng học Giáo lý', 'Nhận thông báo từ xứ đoàn'],
    to: '/login/phuhuynh' as const,
    cta: 'Đăng nhập phụ huynh',
  },
]

const FEATURES = [
  {
    icon: Users,
    title: 'Đồng hành cùng thiếu nhi & lớp học',
    description: 'Hồ sơ thiếu nhi, phân lớp theo 5 ngành TNTT, phân công huynh trưởng và giáo lý viên phụ trách rõ ràng.',
  },
  {
    icon: ClipboardCheck,
    title: 'Sổ điểm Giáo lý & Đánh giá',
    description: 'Sổ điểm giáo lý, ngân hàng câu hỏi Giáo lý & Kinh Thánh, đánh giá học tập và phiếu liên lạc đức tin.',
  },
  {
    icon: CheckSquare,
    title: 'Chuyên cần Thánh Lễ & Đơn xin phép',
    description: 'Điểm danh Thánh Lễ Chúa Nhật, Giờ Chầu Thánh Thể, giờ học giáo lý; phụ huynh gửi đơn xin phép vắng trực tuyến.',
  },
  {
    icon: BarChart3,
    title: 'Báo cáo & Thăng ngành TNTT',
    description: 'Tổng kết niên khóa, xét thăng tiến ngành, in phiếu điểm và chứng nhận Giáo lý có mã xác thực.',
  },
  {
    icon: CalendarDays,
    title: 'Lịch Phụng vụ & Thông báo',
    description: 'Lịch phụng vụ Giáo xứ, sự kiện Xứ đoàn và thông báo mục vụ đến đúng từng lớp và ngành liên quan.',
  },
  {
    icon: WifiOff,
    title: 'Ngoại tuyến (Offline-First) & Đa nền tảng',
    description: 'Hoạt động ổn định cả khi nhà thờ mất mạng, đồng bộ an toàn; dùng tốt trên máy tính và điện thoại.',
  },
]

const STEPS = [
  {
    title: 'Nhận tài khoản',
    description: 'Do Ban Giáo Lý và Ban Điều Hành Xứ Đoàn cấp phát theo danh sách lớp và ban huynh trưởng đã duyệt.',
  },
  {
    title: 'Chọn đúng cổng đăng nhập',
    description: 'Giáo Lý Viên và Huynh Trưởng dùng Cổng GLV & Huynh Trưởng; phụ huynh dùng Cổng Phụ Huynh với số điện thoại đã đăng ký.',
  },
  {
    title: 'Đồng hành mọi nơi',
    description: 'Mở Catevia trên trình duyệt máy tính hoặc điện thoại, cài đặt như ứng dụng để truy cập nhanh.',
  },
]

export function LandingPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Catevia — Quản lý Giáo lý & Thiếu Nhi Thánh Thể'
    return () => {
      document.title = prevTitle
    }
  }, [])

  const homeTo = user ? (user.role === 'phuhuynh' ? '/parent' : '/dashboard') : '/login'

  const handleNavClick = (href: string) => {
    setIsMobileMenuOpen(false)
    if (href.startsWith('#')) {
      const el = document.querySelector(href)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate({ to: href as any })
    }
  }

  return (
    <main className="min-h-screen bg-surface-app text-text-main font-sans">
      <a href="#gioi-thieu-noi-dung" className="skip-link">Bỏ qua đến nội dung chính</a>

      {/* ── Thanh điều hướng public (Chuẩn màu xanh Xứ Đoàn & Logo tròn như saviolaptri.com) ── */}
      <header className="sticky top-0 z-40 bg-parish-primary text-text-inverse border-b border-white/15 backdrop-blur-md shadow-sm">
        <div className="w-full max-w-7xl 2xl:max-w-[1720px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-16 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={parishLogo} alt="Logo Giáo Xứ Gia Tôn" className="w-10 h-10 rounded-full object-contain bg-white/10 p-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-black tracking-wider text-text-inverse uppercase truncate">
                Xứ Đoàn Đức Mẹ Fatima
              </p>
              <p className="text-xs font-medium text-text-inverse/80 truncate">
                Giáo Xứ Gia Tôn — Giáo hạt Gia Kiệm · Giáo Phận Xuân Lộc
              </p>
            </div>
          </div>

          {/* Desktop navigation */}
          <nav aria-label="Điều hướng chính" className="hidden sm:flex items-center gap-2">
            <a
              href="#gioi-thieu-tieu-de"
              className="min-h-11 inline-flex items-center px-3 text-sm font-semibold text-text-inverse/85 hover:text-text-inverse transition-colors"
            >
              Khám phá
            </a>
            <a
              href="#tieu-de-nganh"
              className="min-h-11 inline-flex items-center px-3 text-sm font-semibold text-text-inverse/85 hover:text-text-inverse transition-colors"
            >
              5 Ngành TNTT
            </a>
            <a
              href="#cong-dang-nhap"
              className="min-h-11 inline-flex items-center px-3 text-sm font-semibold text-text-inverse/85 hover:text-text-inverse transition-colors"
            >
              Cổng đăng nhập
            </a>
            <a
              href="#cau-hoi-thuong-gap"
              className="min-h-11 inline-flex items-center px-3 text-sm font-semibold text-text-inverse/85 hover:text-text-inverse transition-colors"
            >
              Hỏi đáp
            </a>
            <button
              type="button"
              onClick={() => navigate({ to: homeTo })}
              className="btn bg-surface-card hover:bg-surface-hover text-parish-primary font-bold btn-sm min-h-11 rounded-lg shadow-sm"
            >
              {user ? 'Vào hệ thống' : 'Đăng nhập'}
            </button>
          </nav>

          {/* Mobile hamburger button chuẩn khung viền bo góc như mẫu xứ đoàn */}
          <div className="flex items-center gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => navigate({ to: homeTo })}
              className="btn bg-surface-card hover:bg-surface-hover text-parish-primary font-bold btn-sm min-h-10 text-xs px-3 rounded-lg"
            >
              {user ? 'Vào hệ thống' : 'Đăng nhập'}
            </button>
            <button
              type="button"
              aria-expanded={isMobileMenuOpen}
              aria-label={isMobileMenuOpen ? 'Đóng menu' : 'Mở menu điều hướng'}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="border border-white/40 rounded-lg p-2 text-text-inverse hover:bg-white/10 flex items-center justify-center min-h-10 min-w-10"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {isMobileMenuOpen && (
          <nav
            aria-label="Menu di động"
            className="sm:hidden bg-parish-primary text-text-inverse border-t border-white/15 px-4 py-3 flex flex-col gap-1 shadow-2xl animate-in fade-in"
          >
            <button
              type="button"
              onClick={() => handleNavClick('#gioi-thieu-tieu-de')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-text-inverse/90 hover:text-text-inverse hover:bg-white/10 rounded-lg flex items-center"
            >
              Khám phá
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('#tieu-de-nganh')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-text-inverse/90 hover:text-text-inverse hover:bg-white/10 rounded-lg flex items-center"
            >
              Năm ngành TNTT
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('#cong-dang-nhap')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-text-inverse/90 hover:text-text-inverse hover:bg-white/10 rounded-lg flex items-center"
            >
              Cổng đăng nhập
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('#cau-hoi-thuong-gap')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-text-inverse/90 hover:text-text-inverse hover:bg-white/10 rounded-lg flex items-center"
            >
              Câu hỏi thường gặp
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('/verify')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-text-inverse/90 hover:text-text-inverse hover:bg-white/10 rounded-lg flex items-center"
            >
              Xác thực chứng chỉ Giáo lý
            </button>
          </nav>
        )}
      </header>

      {/* ── 1. Hero banner tập thể toàn màn hình (Full-bleed trên Desktop chuẩn trang Xứ Đoàn) ── */}
      <section aria-label="Hình ảnh tập thể Xứ Đoàn Đức Mẹ Fatima" className="w-full">
        <LandingParishGlassCard onLogin={() => navigate({ to: homeTo })} isLoggedIn={!!user} />
      </section>

      {/* ── 2. Nội dung chi tiết mở rộng bề ngang trên Desktop ── */}
      <div id="gioi-thieu-noi-dung" className="w-full max-w-7xl 2xl:max-w-[1720px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-16 pb-20 flex flex-col gap-12 lg:gap-16 pt-8 sm:pt-12">
        {/* ── Giới thiệu nền tảng & preview ── */}
        <section aria-labelledby="gioi-thieu-tieu-de" className="flex flex-col gap-6 sm:gap-8">
          <div className="card p-6 sm:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-7 flex flex-col gap-4 sm:gap-5">
              <p className="m-0">
                <span className="badge badge-primary">Phong trào Thiếu Nhi Thánh Thể Việt Nam</span>
              </p>
              <h1 id="gioi-thieu-tieu-de" className="m-0 text-2xl sm:text-4xl font-black tracking-tight text-text-main scroll-mt-24">
                Nền tảng quản lý Giáo lý &amp; Thiếu Nhi Thánh Thể
              </h1>
              {/* Tagline dùng đúng mô tả sản phẩm đã công bố trong index.html */}
              <p className="m-0 text-sm sm:text-base font-semibold italic text-parish-primary">
                Hệ thống quản lý điểm số &amp; theo dõi chuyên cần Thiếu Nhi Thánh Thể.
              </p>
              <p className="m-0 text-sm sm:text-base text-text-secondary leading-relaxed">
                Catevia đồng hành cùng Xứ Đoàn Đức Mẹ Fatima — Giáo Xứ Gia Tôn trong việc chăm sóc
                thiếu nhi, sổ điểm Giáo lý, chuyên cần Thánh lễ, lịch phụng vụ và đời sống xứ đoàn —
                chính xác, minh bạch và thân thiện với mọi lứa tuổi, trên cả máy tính lẫn điện thoại.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate({ to: homeTo })}
                  className="btn btn-primary btn-lg min-h-11"
                >
                  {user ? 'Vào hệ thống' : 'Bắt đầu đăng nhập'}
                  <ArrowRight aria-hidden="true" className="w-4 h-4" />
                </button>
                <a href="#tinh-nang" className="btn btn-secondary btn-lg min-h-11 no-underline">
                  Khám phá tính năng
                </a>
              </div>
              <ul className="m-0 p-0 list-none flex flex-wrap gap-2" aria-label="Cam kết của hệ thống">
                <li className="badge badge-success">
                  <WifiOff aria-hidden="true" className="w-3.5 h-3.5" /> Hoạt động cả khi mất mạng
                </li>
                <li className="badge badge-info">
                  <Smartphone aria-hidden="true" className="w-3.5 h-3.5" /> Máy tính &amp; điện thoại
                </li>
                <li className="badge badge-neutral">
                  <ShieldCheck aria-hidden="true" className="w-3.5 h-3.5" /> Phân quyền theo vai trò
                </li>
              </ul>
            </div>
            <div className="lg:col-span-5">
              <LandingHeroPreview />
            </div>
          </div>
        </section>

        {/* ── Dải số liệu cấu trúc 5 / 3 / 2 / 1 ──────────── */}
        <LandingStatsStrip />

        {/* ── Dải 5 ngành TNTT ──────────────────────────────── */}
        <section aria-labelledby="tieu-de-nganh" className="flex flex-col gap-4">
          <div>
            <h2 id="tieu-de-nganh" className="m-0 text-lg sm:text-xl font-extrabold text-text-main">Năm ngành sinh hoạt TNTT</h2>
            <p className="m-0 mt-1 text-sm text-text-secondary">Mỗi ngành một màu khăn — một hành trình trưởng thành trong đức tin.</p>
          </div>
          <ul className="m-0 p-0 list-none grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.values(BRANCHES).map(branch => (
              <li key={branch.id} className={`card card-interactive p-4 flex flex-col gap-2 border-t-4 ${BRANCH_BORDER_CLASS[branch.id] ?? 'border-t-parish-primary'}`}>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className={`inline-block w-3 h-3 rounded-full ${BRANCH_DOT_CLASS[branch.id] ?? 'bg-parish-primary'}`} />
                  <span className="text-sm font-extrabold text-text-main">{branch.name}</span>
                </span>
                <span className="text-xs font-semibold text-parish-primary">{branch.ageRange}</span>
                <span className="text-xs text-text-muted leading-relaxed">{branch.description}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Ba cổng đăng nhập ─────────────────────────────── */}
        <section id="cong-dang-nhap" aria-labelledby="tieu-de-cong" className="flex flex-col gap-4 scroll-mt-20">
          <div>
            <h2 id="tieu-de-cong" className="m-0 text-lg sm:text-xl font-extrabold text-text-main">Chọn cổng phù hợp với bạn</h2>
            <p className="m-0 mt-1 text-sm text-text-secondary">Mỗi tài khoản thuộc một vai trò duy nhất — hãy vào đúng cổng để thấy đúng nội dung của mình.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PORTALS.map(portal => (
              <article key={portal.title} className="card card-interactive p-5 flex flex-col gap-3">
                <div className="w-12 h-12 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center">
                  <portal.icon aria-hidden="true" className="w-6 h-6" />
                </div>
                <h3 className="m-0 text-base font-bold text-text-main">{portal.title}</h3>
                <p className="m-0 text-sm text-text-secondary leading-relaxed">{portal.description}</p>
                <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                  {portal.points.map(point => (
                    <li key={point} className="flex items-start gap-2 text-xs text-text-secondary">
                      <ChevronRight aria-hidden="true" className="w-3.5 h-3.5 mt-0.5 text-parish-primary shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-2">
                  <button
                    type="button"
                    onClick={() => navigate({ to: portal.to })}
                    className="btn btn-secondary w-full min-h-11"
                  >
                    {portal.cta}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Tính năng ─────────────────────────────────────── */}
        <section id="tinh-nang" aria-labelledby="tieu-de-tinh-nang" className="flex flex-col gap-4 scroll-mt-20">
          <div>
            <h2 id="tieu-de-tinh-nang" className="m-0 text-lg sm:text-xl font-extrabold text-text-main">Mọi việc của xứ đoàn, trong một nơi</h2>
            <p className="m-0 mt-1 text-sm text-text-secondary">Từ lớp giáo lý hằng tuần đến lễ tổng kết cuối năm — Catevia sắp xếp gọn gàng, tra cứu trong vài giây.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(feature => (
              <article key={feature.title} className="card card-interactive p-5 flex flex-col gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center">
                  <feature.icon aria-hidden="true" className="w-5 h-5" />
                </div>
                <h3 className="m-0 text-sm font-bold text-text-main">{feature.title}</h3>
                <p className="m-0 text-xs sm:text-sm text-text-secondary leading-relaxed">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Cách bắt đầu ──────────────────────────────────── */}
        <section aria-labelledby="tieu-de-bat-dau" className="card p-6 sm:p-8 flex flex-col gap-5">
          <div>
            <h2 id="tieu-de-bat-dau" className="m-0 text-lg sm:text-xl font-extrabold text-text-main">Lần đầu đến với Catevia?</h2>
            <p className="m-0 mt-1 text-sm text-text-secondary">Tài khoản do xứ đoàn cấp phát — thông tin của các em luôn thuộc về xứ đoàn và được bảo vệ.</p>
          </div>
          <ol className="m-0 p-0 list-none grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-surface-border bg-surface-app p-4 flex flex-col gap-2">
                <span className="w-8 h-8 rounded-full bg-parish-primary text-text-inverse text-sm font-extrabold flex items-center justify-center" aria-hidden="true">
                  {index + 1}
                </span>
                <p className="m-0 text-sm font-bold text-text-main">{step.title}</p>
                <p className="m-0 text-xs sm:text-sm text-text-secondary leading-relaxed">{step.description}</p>
              </li>
            ))}
          </ol>
          <p className="m-0 flex items-start gap-2 text-xs text-text-muted">
            <ShieldCheck aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0 text-parish-success" />
            <span>Đăng nhập được bảo vệ bằng mật khẩu mã hóa, phiên làm việc có thời hạn và phân quyền chặt chẽ: người dùng chỉ thấy nội dung thuộc phạm vi của mình.</span>
          </p>
        </section>

        {/* ── Câu hỏi thường gặp (FAQ) ────────────────────────── */}
        <LandingFAQ />

        {/* ── Kêu gọi hành động ─────────────────────────────── */}
        <section aria-labelledby="tieu-de-cta" className="card p-6 sm:p-10 text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-card">
            <img src={appLogo} alt="" aria-hidden="true" className="w-full h-full object-cover" />
          </div>
          <h2 id="tieu-de-cta" className="m-0 text-lg sm:text-2xl font-black tracking-tight text-text-main">
            Sẵn sàng đồng hành cùng xứ đoàn?
          </h2>
          <p className="m-0 max-w-xl text-sm text-text-secondary">
            Đăng nhập để điểm danh, xem điểm, nhận thông báo và cùng nhau xây dựng đời sống đức tin cho các em thiếu nhi.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => navigate({ to: '/login/phuhuynh' })} className="btn btn-primary btn-lg min-h-11">
              <HeartHandshake aria-hidden="true" className="w-4 h-4" />
              Cổng Phụ Huynh
            </button>
            <button type="button" onClick={() => navigate({ to: '/login/nhan-su' })} className="btn btn-secondary btn-lg min-h-11">
              <GraduationCap aria-hidden="true" className="w-4 h-4" />
              Cổng GLV &amp; Huynh Trưởng
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: '/verify' })}
            className="min-h-11 inline-flex items-center text-xs font-semibold text-parish-primary hover:underline"
          >
            Xác thực chứng chỉ Giáo lý
          </button>
        </section>
      </div>

      {/* ── Chân trang ──────────────────────────────────────── */}
      <footer className="border-t border-surface-border bg-surface-card">
        <div className="w-full max-w-7xl 2xl:max-w-[1720px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-16 py-10 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={appLogo} alt="Logo Catevia" className="w-9 h-9 rounded-lg object-cover" />
              <div>
                <p className="m-0 text-sm font-extrabold text-text-main">Catevia</p>
                <p className="m-0 text-xs text-text-muted">Xứ Đoàn Đức Mẹ Fatima — Giáo Xứ Gia Tôn · TNTT Việt Nam</p>
              </div>
            </div>
            <nav aria-label="Liên kết chân trang" className="flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => navigate({ to: '/about' as any })} className="min-h-11 px-3 text-xs font-semibold text-text-secondary hover:text-parish-primary transition-colors">
                Giới thiệu
              </button>
              <button type="button" onClick={() => navigate({ to: '/login' })} className="min-h-11 px-3 text-xs font-semibold text-text-secondary hover:text-parish-primary transition-colors">
                Đăng nhập
              </button>
              <button type="button" onClick={() => navigate({ to: '/verify' })} className="min-h-11 px-3 text-xs font-semibold text-text-secondary hover:text-parish-primary transition-colors">
                Xác thực chứng chỉ Giáo lý
              </button>
              <span className="px-3 text-xs text-text-muted inline-flex items-center gap-1.5">
                <Bell aria-hidden="true" className="w-3.5 h-3.5" /> Hỗ trợ: liên hệ Ban Giáo Lý
              </span>
            </nav>
          </div>
          <div className="pt-3 border-t border-surface-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-text-muted">
            <p className="m-0">
              Dữ liệu thuộc về Xứ Đoàn Đức Mẹ Fatima — Giáo Xứ Gia Tôn. Không chia sẻ cho bên thứ ba, tôn trọng quyền riêng tư của các gia đình.
            </p>
            <p className="m-0 shrink-0">
              Phong Trào Thiếu Nhi Thánh Thể
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}

export default LandingPage
