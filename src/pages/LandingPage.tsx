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
import { LandingFaithMoment } from '../components/landing/LandingFaithMoment'
import { landingMedia } from '../components/landing/landingMedia'

/**
 * Reader-facing names for the stops the header rail walks through. Every label is the
 * section's own heading — except the two that are not sections but chapters of one
 * ("Khởi đầu" for the hero, "Đồng hành" for the parish chapters) — so the rail never
 * invents a promise the page does not make.
 */
const SCENE_STOP_LABELS: Record<string, string> = {
  hero: 'Khởi đầu',
  'community-gather': 'Một hành trình đức tin',
  'community-learn': 'Một hành trình đức tin',
  'community-family': 'Một hành trình đức tin',
  'product-intro': 'Không gian làm việc',
  academic: 'Không gian làm việc',
  organization: 'Không gian làm việc',
  parent: 'Không gian làm việc',
  branches: 'Năm ngành sinh hoạt TNTT',
  trust: 'Bền bỉ, an toàn và tôn trọng quyền riêng tư',
  access: 'Chọn cổng phù hợp với bạn',
  faq: 'Câu hỏi thường gặp',
}

export function LandingPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [activeStory, setActiveStory] = useState<PreviewWorkspace>('academic')
  const [headerStopLabel, setHeaderStopLabel] = useState(SCENE_STOP_LABELS.hero)
  const railRef = React.useRef<HTMLSpanElement>(null)
  // Reduced motion is NOT a reason to switch to the sequential layout: it only
  // means "same composition, no animation". Width alone decides the layout.
  const [sequentialScenes, setSequentialScenes] = useState(() => typeof window !== 'undefined'
    && window.innerWidth < 1024)
  const landingRef = React.useRef<HTMLElement>(null)

  useEffect(() => {
    const prevTitle = document.title
    // Kept identical to the static <title> in index.html so a client-side return to
    // `/` restores exactly what a first paint (and a crawler) saw.
    document.title = 'Catevia — Quản lý Giáo lý & Thiếu Nhi Thánh Thể | Xứ Đoàn Đức Mẹ Fatima'
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
    // Scroll-linked depth is a pure function of position, but the page carries a dozen
    // scenes, so the write is skipped whenever the rounded value has not actually moved.
    // On a phone that is the difference between two style writes per frame for the two
    // scenes actually on screen and two for every scene on the page.
    const lastDepth = new Map<HTMLElement, string>()
    const update = () => {
      frame = 0
      const nextSequentialMode = window.innerWidth < 1024
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

        // ── Depth ──
        // How near this scene sits to the reader's focus line, smoothed so the motion is
        // imperceptible at both ends. This is a pure function of scroll position, which is
        // exactly why it is safe where a state-driven reveal would not be: it reverses with
        // the scroll by construction, so there is nothing to re-arm and nothing that can
        // flicker on the way back up the page.
        //
        // The gate is one viewport of slack past the visible range, and smoothstep is
        // already ~0.2 by the time a scene reaches the edge of that range, so a scene
        // leaving the gate is never on screen when its value stops being written.
        if (!reducedMotion?.matches && rect.bottom > -window.innerHeight && rect.top < window.innerHeight * 2) {
          const centre = rect.top + rect.height / 2
          const reach = Math.min(1, (window.innerHeight * 0.62) / Math.max(1, Math.abs(centre - focusLine)))
          const next = (reach * reach * (3 - 2 * reach)).toFixed(3)
          if (lastDepth.get(scene) !== next) {
            lastDepth.set(scene, next)
            scene.style.setProperty('--scene-depth', next)
          }
        }
      }
      if (nearest && root.dataset.activeScene !== nearest.id) {
        root.dataset.activeScene = nearest.id
      }
      // W19/W20 — header progress rail and the name of the current stop. The rail is
      // written straight to the DOM rather than held in state: it changes on every frame,
      // and a setState per frame would re-render the whole landing page 60 times a second
      // to move one 2px bar. The label goes through state because it changes rarely, and
      // it is the part a screen reader needs.
      if (railRef.current) {
        const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
        railRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, window.scrollY / range)).toFixed(4)})`
      }
      // The bar is a full-bleed gradient sitting over both the photograph and the paper
      // sections, so the moment the page starts moving it is over content it was never
      // drawn for. A scrim only past the first few pixels keeps the hero's first impression
      // untouched and gives the sticky bar something to sit on for the other ten screens.
      const scrolled = window.scrollY > 24 ? 'true' : 'false'
      if (root.dataset.scrolled !== scrolled) root.dataset.scrolled = scrolled
      const stopLabel = SCENE_STOP_LABELS[nearest?.id ?? ''] ?? SCENE_STOP_LABELS.hero
      setHeaderStopLabel(current => (current === stopLabel ? current : stopLabel))
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

  // One-shot reveal for the four tail sections.
  //
  // Two rules keep this from ever hiding content the visitor is looking at:
  //  1. only sections that start BELOW the fold are armed — anything already on
  //     screen at first paint is marked revealed immediately and never transitions,
  //     so the page cannot open with a cascade of staggered fades;
  //  2. the hidden state lives behind [data-landing-reveal-armed], which only this
  //     effect sets. If the script never runs, or reduced motion is on, or
  //     IntersectionObserver is unavailable, the sections render plainly.
  // Each element is unobserved after revealing, so it animates exactly once.
  useEffect(() => {
    const root = landingRef.current
    if (!root || typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    if (typeof IntersectionObserver === 'undefined') return

    const pending = Array.from(root.querySelectorAll<HTMLElement>('[data-landing-reveal]')).filter(element => {
      if (element.getBoundingClientRect().top < window.innerHeight) {
        element.dataset.landingRevealed = 'true'
        return false
      }
      return true
    })
    if (!pending.length) return

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const element = entry.target as HTMLElement
        element.dataset.landingRevealed = 'true'
        observer.unobserve(element)
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 })

    root.dataset.landingRevealArmed = 'true'
    for (const element of pending) observer.observe(element)
    return () => {
      observer.disconnect()
      delete root.dataset.landingRevealArmed
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
      if (el) {
        // The mobile menu lives in the sticky header's normal flow, so closing it
        // shrinks the header (~65px → ~326px → ~65px) and pulls every section up
        // by the menu height. Scrolling in the same tick measures the target
        // against the tall header, so the smooth scroll settles ~230px too far
        // and tucks the section heading behind the sticky bar (WCAG 2.4.11).
        // Two frames guarantee React has committed and layout has been
        // recalculated before the target position is measured.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth' })
        }))
      }
    } else {
      navigate({ to: href as any, viewTransition: true })
    }
  }

  return (
    <main ref={landingRef} className="landing-page min-h-screen bg-surface-app text-text-main font-sans">
      <a href="#gioi-thieu-noi-dung" className="skip-link">Bỏ qua đến nội dung chính</a>

      {/* ── 01. Thanh điều hướng public ──
          Reuses `.app-header` rather than restyling it, so the public bar is literally
          the app's brand bar: same navy gradient, same hairline, same shadow, same
          sticky z-index, and — like it — theme-invariant. `text-white` is set
          explicitly because `.app-header` only colours its own children, and
          `text-inverse` is deliberately NOT used: it flips to near-black in dark mode
          (it means "text on a light surface"), which was only safe before because the
          old background (`parish-primary`) was a light blue in dark mode. */}
      <header className="app-header landing-header text-white">
        <div className="landing-shell landing-header__inner">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={parishLogo}
              alt="Logo Giáo Xứ Gia Tôn"
              className="w-10 h-10 rounded-full object-contain bg-white/10 p-0.5 shrink-0"
              style={{ viewTransitionName: 'parish-brand-logo' }}
            />
            <div className="min-w-0">
              <p className="landing-header__name text-sm sm:text-base font-black tracking-wider text-white uppercase truncate">
                Xứ Đoàn Đức Mẹ Fatima
              </p>
              <p className="landing-header__meta text-xs font-medium text-white/80 truncate">
                Giáo Xứ Gia Tôn — Giáo hạt Gia Kiệm · Giáo Phận Xuân Lộc
              </p>
            </div>
          </div>

          {/* Desktop navigation (Hiện đầy đủ trên desktop >= 1024px để không vỡ dòng ở tablet 768px) */}
          <nav aria-label="Điều hướng chính" className="hidden lg:flex items-center gap-1.5 xl:gap-2">
            <a
              href="#cong-dang-nhap"
              className="min-h-11 inline-flex items-center px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white/85 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cổng đăng nhập
            </a>
            <a
              href="#san-pham"
              className="min-h-11 inline-flex items-center px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white/85 hover:text-white hover:bg-white/10 transition-colors"
            >
              Không gian làm việc
            </a>
            <a
              href="#tieu-de-nganh"
              className="min-h-11 inline-flex items-center px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white/85 hover:text-white hover:bg-white/10 transition-colors"
            >
              5 Ngành TNTT
            </a>
            <a
              href="#cau-hoi-thuong-gap"
              className="min-h-11 inline-flex items-center px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white/85 hover:text-white hover:bg-white/10 transition-colors"
            >
              Hỏi đáp
            </a>
            <button
              type="button"
              onClick={() => navigate({ to: homeTo, viewTransition: true })}
              className="btn bg-surface-card hover:bg-surface-hover text-parish-primary font-bold btn-sm min-h-11 px-4 rounded-xl shadow-sm hover:shadow ml-1 transition-colors"
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
              className="border border-white/40 rounded-lg p-2 text-white hover:bg-white/10 flex items-center justify-center min-h-11 min-w-11"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* W19/W20: where am I, and how far is left.
            `data-active-scene` already existed and drove the scrolly and the reveals, but
            nothing showed it to a reader — on a phone, with no section nav in the header,
            the page was one unbroken column. The rail is a `scaleX` transform rather than
            a width so it stays on the compositor, and the label names the current stop.
            The rail itself is decorative: the label is real text, so the position is not
            communicated by a bar alone. */}
        <div className="landing-header__rail" aria-hidden="true">
          <span className="landing-header__rail-fill" ref={railRef} />
        </div>
        {/* `role="status"` rather than a bare `aria-live`: it carries an implicit
            `aria-live="polite"`, it is the idiomatic pattern for a non-interruptive status
            message, and it gives the region a queryable handle without inventing a
            class that exists only for a test. */}
        <p className="sr-only" role="status">
          <span className="landing-header__stop-label">{headerStopLabel}</span>
        </p>

        {/* Mobile & Tablet menu dropdown */}
        {isMobileMenuOpen && (
          <nav
            aria-label="Menu di động"
            className="lg:hidden landing-header-menu text-white border-t border-white/15 px-4 py-3 flex flex-col gap-1 shadow-2xl animate-in fade-in"
          >
            <button
              type="button"
              onClick={() => handleNavClick('#cong-dang-nhap')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-white/90 hover:text-white hover:bg-white/10 rounded-lg flex items-center"
            >
              Cổng đăng nhập
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('#san-pham')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-white/90 hover:text-white hover:bg-white/10 rounded-lg flex items-center"
            >
              Không gian làm việc
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('#tieu-de-nganh')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-white/90 hover:text-white hover:bg-white/10 rounded-lg flex items-center"
            >
              Năm ngành TNTT
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('#cau-hoi-thuong-gap')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-white/90 hover:text-white hover:bg-white/10 rounded-lg flex items-center"
            >
              Câu hỏi thường gặp
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('/verify')}
              className="w-full min-h-11 px-3 text-left text-sm font-semibold text-white/90 hover:text-white hover:bg-white/10 rounded-lg flex items-center"
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

      {/* Khoảnh khắc Chúa nhật: điểm dừng cảm xúc duy nhất của trang, đặt sau chặng
          "Một hành trình đức tin" và trước phần sản phẩm. Component này tồn tại sẵn từ
          lâu nhưng không nơi nào render (orphan) — hồi sinh nguyên văn, không viết lại
          chữ. Nó không mang `data-landing-scene`/`data-landing-reveal` cố ý: đây là điểm
          dừng, không phải một chặng trong trục 3 chặng, nên không được tính vào chuỗi
          scene mà 25-landing.css và landing-cinematic.spec.ts đang khoá. */}
      <LandingFaithMoment />

      {/* Ba điểm nhìn vào cùng một sản phẩm, mỗi chương có một nhịp thị giác riêng. */}
      <section
        id="san-pham"
        aria-labelledby="tieu-de-san-pham"
        data-active-story={activeStory}
        className="landing-cinematic scroll-mt-20"
      >
        <div className="landing-cinematic__inner">
          <header className="landing-product-intro" data-landing-scene="product-intro">
            <span className="landing-eyebrow"><Layers aria-hidden="true" className="w-4 h-4" /> Catevia trong từng vai trò</span>
            <h2 id="tieu-de-san-pham">Một nền tảng. <span>Ba cách đồng hành.</span></h2>
            <p>{sequentialScenes ? 'Cuộn để xem Catevia theo nhịp công việc của từng người.' : 'Chọn một không gian hoặc cuộn để xem Catevia theo nhịp công việc của từng người.'}</p>
          </header>
          <div className="scrolly-stage landing-cinematic__stage">
            {!sequentialScenes && <div className="scrolly-pinned-preview landing-cinematic__preview order-1 lg:order-2">
              {/* Stage label only. The chapter counter lives in the story copy on the left;
                  printing "01 / 03" here too put two identical counters on one screen
                  (plan 2026-09-26 §3.1). */}
              <div className="landing-cinematic__preview-heading" aria-hidden="true">
                <span>Không gian {activeStory === 'academic' ? 'Học vụ' : activeStory === 'organization' ? 'Xứ đoàn' : 'Phụ huynh'}</span>
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

      <div className="landing-shell landing-final-sequence pb-16 sm:pb-20 flex flex-col gap-10 sm:gap-16 lg:gap-20 pt-8 sm:pt-12">
        <LandingBranchJourney />
        {/* The stitch. Four acts separated by nothing but `clamp(4rem, 8vw, 8rem)` of
            paper read as four unrelated pages stacked on one scroll. These hairlines are
            that whitespace given a job: each one carries the five branch colours in the
            order the scarf above already wears them, so the thread the reader just watched
            the Xứ Đoàn tie continues past it and strings the rest of the page into one
            run. Decorative, and inside the shell so it lines up with the content edges
            rather than bleeding into the viewport gutter. */}
        <div className="landing-stitch" aria-hidden="true" data-landing-reveal />
        <LandingTrustStrip />
        <div className="landing-stitch" aria-hidden="true" data-landing-reveal />
        <LandingAccessPaths />
        <div className="landing-stitch" aria-hidden="true" data-landing-reveal />
        <LandingFAQ />

      </div>

      {/* ── 11. Chân trang ── */}
      <footer role="contentinfo" className="border-t border-surface-border bg-surface-card">
        <div className="landing-shell py-12 flex flex-col gap-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {/* Cột 1: Nhận diện Giáo Xứ & Xứ Đoàn */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <img src={appLogo} alt="Logo Catevia" className="w-10 h-10 rounded-xl object-cover shadow-sm" />
                <img src={parishLogo} alt="Logo Giáo Xứ Gia Tôn" className="w-10 h-10 rounded-full object-contain bg-surface-app p-0.5 border border-surface-border" />
                <div>
                  <p className="m-0 text-base font-extrabold text-text-main tracking-tight">Catevia</p>
                  <p className="m-0 text-xs text-text-muted">Nền tảng Quản trị Giáo lý & TNTT</p>
                </div>
              </div>
              <p className="m-0 text-xs sm:text-sm text-text-secondary leading-relaxed">
                Xứ Đoàn Đức Mẹ Fatima — Giáo Xứ Gia Tôn · TNTT Việt Nam
                <br />
                Giáo hạt Gia Kiệm · Giáo phận Xuân Lộc
              </p>
              <div className="pt-2 text-xs text-text-muted flex items-center gap-2">
                <span className="text-brand-gold select-none" aria-hidden="true">⚜️</span>
                <span>Cầu nguyện · Rước lễ · Hy sinh · Làm việc tông đồ</span>
              </div>
            </div>

            {/* Cột 2: Lối Vào & Tiện Ích */}
            <div className="flex flex-col gap-3">
              <p className="m-0 text-xs font-bold uppercase tracking-wider text-text-muted">
                Lối Vào & Tiện Ích
              </p>
              <nav aria-label="Liên kết chân trang" className="flex flex-col items-start gap-1">
                <button
                  type="button"
                  onClick={() => navigate({ to: '/login' })}
                  className="min-h-9 px-0 py-1 text-xs sm:text-sm font-semibold text-text-secondary hover:text-parish-primary transition-colors inline-flex items-center gap-1.5"
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ to: '/login/phuhuynh', viewTransition: true })}
                  className="min-h-9 px-0 py-1 text-xs sm:text-sm font-semibold text-text-secondary hover:text-parish-primary transition-colors inline-flex items-center gap-1.5"
                >
                  Cổng Phụ Huynh & Gia Đình
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ to: '/login/nhan-su', viewTransition: true })}
                  className="min-h-9 px-0 py-1 text-xs sm:text-sm font-semibold text-text-secondary hover:text-parish-primary transition-colors inline-flex items-center gap-1.5"
                >
                  Cổng GLV & Huynh Trưởng
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ to: '/verify' })}
                  className="min-h-9 px-0 py-1 text-xs sm:text-sm font-semibold text-text-secondary hover:text-parish-primary transition-colors inline-flex items-center gap-1.5"
                >
                  Xác thực chứng chỉ Giáo lý
                </button>
              </nav>
            </div>

            {/* Cột 3: Ban Điều Hành & Hỗ Trợ Mục Vụ */}
            <div className="flex flex-col gap-3">
              <p className="m-0 text-xs font-bold uppercase tracking-wider text-text-muted">
                Hỗ Trợ Mục Vụ
              </p>
              <div className="flex flex-col gap-2.5 p-4 rounded-xl bg-surface-app border border-surface-border text-xs sm:text-sm text-text-secondary leading-relaxed shadow-xs">
                <p className="m-0 font-bold text-text-main">
                  Văn phòng Giáo lý — Giáo Xứ Gia Tôn
                </p>
                <p className="m-0">
                  Thời gian tiếp đón phụ huynh: Chúa Nhật hàng tuần sau các Thánh Lễ Thiếu Nhi.
                </p>
                <div className="pt-2 border-t border-surface-border/50 flex items-center gap-2 text-xs text-text-muted">
                  <Bell aria-hidden="true" className="w-3.5 h-3.5 text-parish-primary shrink-0" />
                  <span>Hỗ trợ: liên hệ Ban Giáo Lý</span>
                </div>
              </div>
            </div>
          </div>

          {/* Dòng đáy cam kết bản quyền & bảo mật */}
          <div className="pt-6 border-t border-surface-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-text-muted">
            <p className="m-0 leading-relaxed">
              Dữ liệu thuộc về Xứ Đoàn Đức Mẹ Fatima — Giáo Xứ Gia Tôn. Quyền truy cập được phân theo vai trò và phạm vi phụ trách.
            </p>
            <p className="m-0 shrink-0 font-medium">
              Phong Trào Thiếu Nhi Thánh Thể
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}

export default LandingPage
