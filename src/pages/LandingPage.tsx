import React, { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Bell,
  GraduationCap,
  HeartHandshake,
  Layers,
  Menu,
  X,
} from 'lucide-react'
import appLogo from '../assets/app-logo-192.png'
import parishLogo from '../assets/logo-gia-ton.png'
import { useAuthStore } from '../stores/authStore'
import { type PreviewWorkspace, LandingHeroPreview } from '../components/landing/LandingHeroPreview'
import { LandingFAQ } from '../components/landing/LandingFAQ'
import { LandingParishGlassCard } from '../components/landing/LandingParishGlassCard'
import { LandingWorkspaceStories } from '../components/landing/LandingWorkspaceStories'
import { LandingBranchJourney } from '../components/landing/LandingBranchJourney'
import { LandingTrustStrip } from '../components/landing/LandingTrustStrip'
import { LandingAccessPaths } from '../components/landing/LandingAccessPaths'
import { LandingFaithMoment } from '../components/landing/LandingFaithMoment'

export function LandingPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [activeStory, setActiveStory] = useState<PreviewWorkspace>('academic')
  const manualOverrideRef = React.useRef(false)
  const overrideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Catevia — Quản lý Giáo lý & Thiếu Nhi Thánh Thể'
    return () => {
      document.title = prevTitle
    }
  }, [])

  const handlePreviewTabChange = (tab: PreviewWorkspace) => {
    setActiveStory(tab)
    manualOverrideRef.current = true
    if (overrideTimerRef.current) clearTimeout(overrideTimerRef.current)
    overrideTimerRef.current = setTimeout(() => {
      manualOverrideRef.current = false
    }, 1800)
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return

    const storyElements = document.querySelectorAll<HTMLElement>('[data-story-tab]')
    if (!storyElements.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (manualOverrideRef.current) return
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const tab = entry.target.getAttribute('data-story-tab') as PreviewWorkspace
            if (tab) {
              setActiveStory(tab)
            }
          }
        }
      },
      {
        rootMargin: '-30% 0px -30% 0px',
        threshold: 0.15,
      }
    )

    storyElements.forEach(el => observer.observe(el))

    return () => {
      observer.disconnect()
      if (overrideTimerRef.current) clearTimeout(overrideTimerRef.current)
    }
  }, [])

  const homeTo = user ? (user.role === 'phuhuynh' ? '/parent' : '/dashboard') : '/login'

  const handleNavClick = (href: string) => {
    setIsMobileMenuOpen(false)
    if (href.startsWith('#')) {
      const el = document.querySelector(href)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate({ to: href as any, viewTransition: true })
    }
  }

  return (
    <main className="min-h-screen bg-surface-app text-text-main font-sans">
      <a href="#gioi-thieu-noi-dung" className="skip-link">Bỏ qua đến nội dung chính</a>

      {/* ── 01. Thanh điều hướng public ── */}
      <header className="sticky top-0 z-40 bg-parish-primary text-text-inverse border-b border-white/15 backdrop-blur-md shadow-sm">
        <div className="w-full max-w-7xl 2xl:max-w-[1720px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-16 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={parishLogo}
              alt="Logo Giáo Xứ Gia Tôn"
              className="w-10 h-10 rounded-full object-contain bg-white/10 p-0.5 shrink-0"
              style={{ viewTransitionName: 'parish-brand-logo' }}
            />
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
              href="#san-pham"
              className="min-h-11 inline-flex items-center px-3 text-sm font-semibold text-text-inverse/85 hover:text-text-inverse transition-colors"
            >
              Catevia
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
              onClick={() => navigate({ to: homeTo, viewTransition: true })}
              className="btn bg-surface-card hover:bg-surface-hover text-parish-primary font-bold btn-sm min-h-11 rounded-lg shadow-sm"
            >
              {user ? 'Vào hệ thống' : 'Đăng nhập'}
            </button>
          </nav>

          {/* Mobile hamburger button */}
          <div className="flex items-center gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => navigate({ to: homeTo, viewTransition: true })}
              className="btn bg-surface-card hover:bg-surface-hover text-parish-primary font-bold btn-sm min-h-11 text-xs px-3.5 rounded-lg"
            >
              {user ? 'Vào hệ thống' : 'Đăng nhập'}
            </button>
            <button
              type="button"
              aria-expanded={isMobileMenuOpen}
              aria-label={isMobileMenuOpen ? 'Đóng menu' : 'Mở menu điều hướng'}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="border border-white/40 rounded-lg p-2 text-text-inverse hover:bg-white/10 flex items-center justify-center min-h-11 min-w-11"
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
              onClick={() => handleNavClick('#san-pham')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-text-inverse/90 hover:text-text-inverse hover:bg-white/10 rounded-lg flex items-center"
            >
              Khám phá Catevia
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

      {/* ── 02. Unified Catevia x Parish Hero ── */}
      <section aria-label="Hình ảnh tập thể Xứ Đoàn Đức Mẹ Fatima" className="w-full">
        <LandingParishGlassCard onLogin={() => navigate({ to: homeTo, viewTransition: true })} isLoggedIn={!!user} />
      </section>

      {/* ── 03. Thân bài narrative phân cấp ── */}
      <div id="gioi-thieu-noi-dung" className="w-full max-w-7xl 2xl:max-w-[1720px] mx-auto px-3.5 sm:px-8 lg:px-12 2xl:px-16 pb-16 sm:pb-20 flex flex-col gap-10 sm:gap-16 lg:gap-24 pt-8 sm:pt-16">
        
        {/* ── 03. Product Stage & Workspace Scrollytelling (Scene 2) ── */}
        <section id="san-pham" aria-labelledby="tieu-de-san-pham" className="flex flex-col gap-10 lg:gap-14 scroll-mt-24">
          <div className="landing-narrative text-center flex flex-col items-center gap-3">
            <span className="landing-eyebrow">
              <Layers className="w-4 h-4" aria-hidden="true" />
              <span>Giao Diện Thực Tế</span>
            </span>
            <h2 id="tieu-de-san-pham" className="landing-section-title m-0 text-balance">
              Một nền tảng. Ba không gian làm việc.
            </h2>
            <p className="landing-lead m-0 text-balance">
              Đồng bộ trải nghiệm giữa giáo lý viên, ban điều hành xứ đoàn và các bậc phụ huynh trên một hệ sinh thái duy nhất.
            </p>
          </div>

          {/* Scrollytelling Stage: Desktop 2-column with sticky preview, Mobile sequential */}
          <div className="scrolly-stage">
            {/* Sticky preview mockup on desktop (right), top on mobile */}
            <div className="scrolly-pinned-preview order-1 lg:order-2">
              <LandingHeroPreview
                externalActiveTab={activeStory}
                onTabChange={handlePreviewTabChange}
              />
            </div>

            {/* Narrative chapters on desktop (left), bottom on mobile */}
            <div className="order-2 lg:order-1">
              <LandingWorkspaceStories activeStory={activeStory} />
            </div>
          </div>
        </section>

        {/* ── 04. Five-Branch TNTT Journey (Scene 3) ── */}
        <LandingBranchJourney />

        {/* ── 05. Parish / Faith Moment (Sanctuary Handoff) ── */}
        <div className="faith-handoff-gradient -mx-3.5 sm:-mx-8 lg:-mx-12 2xl:-mx-16 px-3.5 sm:px-8 lg:px-12 2xl:px-16 py-4 sm:py-6">
          <LandingFaithMoment />
        </div>

        {/* ── 06. Trust & Reliability Pillars ── */}
        <LandingTrustStrip />

        {/* ── 07. Two Access Paths + Compact Onboarding ── */}
        <LandingAccessPaths />

        {/* ── 08. Frequently Asked Questions (FAQ) ── */}
        <LandingFAQ />

        {/* ── 10. Final CTA ── */}
        <section aria-labelledby="tieu-de-cta" className="card p-5 sm:p-10 lg:p-12 text-center flex flex-col items-center gap-4 sm:gap-5 max-w-3xl mx-auto w-full border border-surface-border">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden shadow-card">
            <img src={appLogo} alt="" aria-hidden="true" className="w-full h-full object-cover" />
          </div>
          <h2 id="tieu-de-cta" className="m-0 text-xl sm:text-3xl font-black tracking-tight text-text-main">
            Sẵn sàng đồng hành cùng Xứ Đoàn?
          </h2>
          <p className="m-0 max-w-xl text-xs sm:text-base text-text-secondary leading-relaxed">
            Đăng nhập để điểm danh, xem điểm, nhận thông báo và cùng nhau xây dựng đời sống đức tin cho các em thiếu nhi.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-2.5 sm:gap-3 w-full max-w-xs sm:max-w-none pt-2">
            <button type="button" onClick={() => navigate({ to: '/login/phuhuynh', viewTransition: true })} className="btn btn-primary btn-lg min-h-11 w-full sm:w-auto flex items-center justify-center gap-2">
              <HeartHandshake aria-hidden="true" className="w-4 h-4" />
              Cổng Phụ Huynh
            </button>
            <button type="button" onClick={() => navigate({ to: '/login/nhan-su', viewTransition: true })} className="btn btn-secondary btn-lg min-h-11 w-full sm:w-auto flex items-center justify-center gap-2">
              <GraduationCap aria-hidden="true" className="w-4 h-4" />
              Cổng GLV &amp; Huynh Trưởng
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: '/verify' })}
            className="min-h-11 inline-flex items-center text-xs font-semibold text-parish-primary hover:underline pt-1"
          >
            Xác thực chứng chỉ Giáo lý
          </button>
        </section>
      </div>

      {/* ── 11. Chân trang ── */}
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
