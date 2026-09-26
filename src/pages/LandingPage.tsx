import React, { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Bell,
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
import { LandingStatsStrip } from '../components/landing/LandingStatsStrip'
import { LandingCommunityScene } from '../components/landing/LandingCommunityScene'
import { landingMedia } from '../components/landing/landingMedia'

export function LandingPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [activeStory, setActiveStory] = useState<PreviewWorkspace>('academic')
  const [sequentialScenes, setSequentialScenes] = useState(() => typeof window !== 'undefined'
    && (window.innerWidth < 1024 || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true))
  const landingRef = React.useRef<HTMLElement>(null)

  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Catevia — Quản lý Giáo lý & Thiếu Nhi Thánh Thể'
    return () => {
      document.title = prevTitle
    }
  }, [])

  useEffect(() => {
    const root = landingRef.current
    if (!root || typeof window === 'undefined') return
    const scenes = Array.from(root.querySelectorAll<HTMLElement>('[data-landing-scene]'))
    const productStage = root.querySelector<HTMLElement>('#san-pham')
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let sequentialMode: boolean | undefined
    let frame = 0
    const update = () => {
      frame = 0
      const nextSequentialMode = window.innerWidth < 1024 || reducedMotion?.matches === true
      if (nextSequentialMode !== sequentialMode) {
        sequentialMode = nextSequentialMode
        setSequentialScenes(nextSequentialMode)
      }
      const focusLine = window.innerHeight * 0.47
      let nearest: { id: string; distance: number } | null = null
      let nearestStory: { id: PreviewWorkspace; distance: number } | null = null
      for (const scene of scenes) {
        const rect = scene.getBoundingClientRect()
        const id = scene.dataset.landingScene
        if (!id) continue
        const distance = rect.top <= focusLine && rect.bottom >= focusLine
          ? 0
          : Math.min(Math.abs(rect.top - focusLine), Math.abs(rect.bottom - focusLine))
        if (!nearest || distance < nearest.distance) nearest = { id, distance }
        if ((id === 'academic' || id === 'organization' || id === 'parent') && (!nearestStory || distance < nearestStory.distance)) {
          nearestStory = { id, distance }
        }

        const animatedCopy = id.startsWith('community-') || id === 'academic' || id === 'organization' || id === 'parent'
        if (animatedCopy && !reducedMotion?.matches && rect.bottom > 0 && rect.top < window.innerHeight) {
          const enter = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight * 0.72)))
          scene.style.setProperty('--scene-shift', `${Math.round((1 - enter) * 28)}px`)
          scene.style.setProperty('--scene-opacity', String(0.92 + enter * 0.08))
        }
      }
      if (nearest && root.dataset.activeScene !== nearest.id) {
        root.dataset.activeScene = nearest.id
      }
      const productRect = productStage?.getBoundingClientRect()
      const productVisible = productRect && productRect.bottom > 0 && productRect.top < window.innerHeight
      if (productVisible && nearestStory && root.dataset.activeWorkspace !== nearestStory.id) {
        root.dataset.activeWorkspace = nearestStory.id
        setActiveStory(nearestStory.id)
      }
      const hero = scenes[0]
      if (hero && !reducedMotion?.matches) {
        const heroRect = hero.getBoundingClientRect()
        if (heroRect.bottom > 0 && heroRect.top < window.innerHeight) {
          const exit = Math.max(0, Math.min(1, -heroRect.top / Math.max(1, heroRect.height)))
          hero.style.setProperty('--hero-photo-scale', String(1 + exit * 0.055))
          hero.style.setProperty('--hero-copy-opacity', '1')
          hero.style.setProperty('--hero-copy-shift', `${Math.round(-exit * 34)}px`)
          hero.style.setProperty('--hero-scrim-opacity', String(0.72 + exit * 0.25))
        }
      }
      root.dataset.motionReady = reducedMotion?.matches ? 'false' : 'true'
    }
    const queueUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', queueUpdate, { passive: true })
    window.addEventListener('resize', queueUpdate)
    reducedMotion?.addEventListener('change', queueUpdate)
    return () => {
      window.removeEventListener('scroll', queueUpdate)
      window.removeEventListener('resize', queueUpdate)
      reducedMotion?.removeEventListener('change', queueUpdate)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  const handlePreviewTabChange = (tab: PreviewWorkspace) => {
    setActiveStory(tab)
    document.getElementById(`story-${tab}`)?.scrollIntoView?.({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth',
      block: 'center',
    })
  }

  const homeTo = user ? (user.role === 'phuhuynh' ? '/parent' : '/dashboard') : '/login'

  const handleNavClick = (href: string) => {
    setIsMobileMenuOpen(false)
    if (href.startsWith('#')) {
      const el = document.querySelector(href)
      if (el) el.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth' })
    } else {
      navigate({ to: href as any, viewTransition: true })
    }
  }

  return (
    <main ref={landingRef} className="landing-page min-h-screen bg-surface-app text-text-main font-sans">
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

          {/* Desktop navigation (Hiện đầy đủ trên desktop >= 1024px để không vỡ dòng ở tablet 768px) */}
          <nav aria-label="Điều hướng chính" className="hidden lg:flex items-center gap-1.5 xl:gap-2">
            <a
              href="#cong-dang-nhap"
              className="min-h-11 inline-flex items-center px-3 text-sm font-semibold text-text-inverse/85 hover:text-text-inverse transition-colors"
            >
              Cổng đăng nhập
            </a>
            <a
              href="#san-pham"
              className="min-h-11 inline-flex items-center px-3 text-sm font-semibold text-text-inverse/85 hover:text-text-inverse transition-colors"
            >
              Không gian làm việc
            </a>
            <a
              href="#tieu-de-nganh"
              className="min-h-11 inline-flex items-center px-3 text-sm font-semibold text-text-inverse/85 hover:text-text-inverse transition-colors"
            >
              5 Ngành TNTT
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
              className="btn bg-surface-card hover:bg-surface-hover text-parish-primary font-bold btn-sm min-h-11 rounded-lg shadow-sm ml-1"
            >
              {user ? 'Vào hệ thống' : 'Đăng nhập'}
            </button>
          </nav>

          {/* Mobile & Tablet hamburger button (< 1024px) */}
          <div className="flex items-center gap-2 lg:hidden">
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

        {/* Mobile & Tablet menu dropdown */}
        {isMobileMenuOpen && (
          <nav
            aria-label="Menu di động"
            className="lg:hidden bg-parish-primary text-text-inverse border-t border-white/15 px-4 py-3 flex flex-col gap-1 shadow-2xl animate-in fade-in"
          >
            <button
              type="button"
              onClick={() => handleNavClick('#cong-dang-nhap')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-text-inverse/90 hover:text-text-inverse hover:bg-white/10 rounded-lg flex items-center"
            >
              Cổng đăng nhập
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('#san-pham')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-text-inverse/90 hover:text-text-inverse hover:bg-white/10 rounded-lg flex items-center"
            >
              Không gian làm việc
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
        <LandingParishGlassCard onLogin={() => navigate({ to: homeTo, viewTransition: true })} isLoggedIn={!!user} videoSrc={landingMedia.heroVideo} />
      </section>

      <LandingCommunityScene sequential={sequentialScenes} lessonImage={landingMedia.lessonImage} familyImage={landingMedia.familyImage} />

      {/* Ba điểm nhìn vào cùng một sản phẩm, mỗi chương có một nhịp thị giác riêng. */}
      <section
        id="san-pham"
        aria-labelledby="tieu-de-san-pham"
        data-active-story={activeStory}
        className="landing-cinematic scroll-mt-16"
      >
        <div className="landing-product-background landing-product-background--organization" aria-hidden="true" />
        <div className="landing-product-background landing-product-background--parent" aria-hidden="true" />
        <div className="landing-cinematic__inner">
          <header className="landing-product-intro" data-landing-scene="product-intro">
            <span className="landing-eyebrow"><Layers aria-hidden="true" className="w-4 h-4" /> Catevia trong từng vai trò</span>
            <h2 id="tieu-de-san-pham">Một nền tảng. <span>Ba cách đồng hành.</span></h2>
            <p>{sequentialScenes ? 'Cuộn để xem Catevia theo nhịp công việc của từng người.' : 'Chọn một không gian hoặc cuộn để xem Catevia theo nhịp công việc của từng người.'}</p>
          </header>
          <div className="scrolly-stage landing-cinematic__stage">
            {!sequentialScenes && <div className="scrolly-pinned-preview landing-cinematic__preview order-1 lg:order-2">
              <div className="landing-cinematic__preview-heading" aria-hidden="true">
                <span>Không gian {activeStory === 'academic' ? 'Học vụ' : activeStory === 'organization' ? 'Xứ đoàn' : 'Phụ huynh'}</span>
                <span>{activeStory === 'academic' ? '01' : activeStory === 'organization' ? '02' : '03'} / 03</span>
              </div>
              <LandingHeroPreview externalActiveTab={activeStory} onTabChange={handlePreviewTabChange} />
              <div className="landing-cinematic__progress" aria-hidden="true">
                <span className={activeStory === 'academic' ? 'is-current' : ''} />
                <span className={activeStory === 'organization' ? 'is-current' : ''} />
                <span className={activeStory === 'parent' ? 'is-current' : ''} />
              </div>
            </div>}
            <div className="landing-story-rail order-2 lg:order-1">
              <LandingWorkspaceStories activeStory={activeStory} sequential={sequentialScenes} />
            </div>
          </div>
        </div>
      </section>

      {/* 04. Nền sáng trở lại để người dùng chọn đường vào sản phẩm. */}
      <div className="landing-afterglow">
        <div className="landing-afterglow__inner">
          <LandingStatsStrip />
        </div>
      </div>

      <div className="landing-final-sequence w-full max-w-7xl 2xl:max-w-[1720px] mx-auto px-3.5 sm:px-8 lg:px-12 2xl:px-16 pb-16 sm:pb-20 flex flex-col gap-10 sm:gap-16 lg:gap-20 pt-8 sm:pt-12">
        <LandingBranchJourney />
        <LandingTrustStrip />
        <LandingAccessPaths />
        <LandingFAQ />

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
              Dữ liệu thuộc về Xứ Đoàn Đức Mẹ Fatima — Giáo Xứ Gia Tôn. Quyền truy cập được phân theo vai trò và phạm vi phụ trách.
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
