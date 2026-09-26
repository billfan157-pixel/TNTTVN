import React from 'react'
import { ArrowRight, Award, Calendar, ChevronDown, Church, Compass, Users } from 'lucide-react'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { normalizeAcademicYear } from '../../utils/academicYear'
import { LandingHeroMedia } from './LandingHeroMedia'

interface LandingParishGlassCardProps {
  onLogin?: () => void
  isLoggedIn?: boolean
  videoSrc?: string
}

export function LandingParishGlassCard({ onLogin, isLoggedIn = false, videoSrc }: LandingParishGlassCardProps) {
  const currentYear = useAcademicYearStore(s => s.currentYear)
  const activeYear = normalizeAcademicYear(currentYear) || '2025-2026'
  const displayYear = activeYear.replace('-', '–')

  return (
    <figure data-landing-scene="hero" className="scene-hero-stage landing-hero-stage m-0 relative w-full overflow-hidden flex flex-col justify-between p-3.5 sm:p-8 lg:p-12 2xl:p-16 pb-5 sm:pb-8 lg:pb-10">
      <LandingHeroMedia videoSrc={videoSrc} />
      <div className="landing-hero-scrim absolute inset-0 pointer-events-none" aria-hidden="true" />

      {/* 1. KHỐI TRÊN: Eyebrow Phong Trào TNTTVN */}
      <div className="relative z-10 flex justify-center pt-2 hero-enter-1">
        <span className="landing-hero-kicker inline-flex items-center gap-2 text-xs font-extrabold text-white tracking-wide">
          <span className="landing-hero-kicker__line" aria-hidden="true" />
          Phong Trào Thiếu Nhi Thánh Thể Việt Nam
        </span>
      </div>

      {/* 2. KHỐI TRUNG TÂM: Unified Catevia × Parish Proposition */}
      <div className="scene-hero-content landing-hero-content relative z-10 flex flex-col items-center justify-center text-center my-auto py-4 sm:py-10 gap-3.5 sm:gap-6 max-w-4xl mx-auto w-full">
        {/* Định danh Xứ đoàn & Catevia với lớp Scrim tạo tương phản tuyệt đối */}
        <div className="relative flex flex-col items-center gap-1.5 sm:gap-2 hero-enter-2">
          <p className="m-0 text-xs sm:text-sm font-serif font-bold uppercase tracking-widest text-parish-secondary-light flex items-center justify-center gap-1.5 drop-shadow-md">
            <Church aria-hidden="true" className="w-4 h-4 shrink-0 text-parish-secondary-light" />
            <span>Xứ Đoàn Đức Mẹ Fatima · Giáo Xứ Gia Tôn</span>
          </p>

          <h1 id="gioi-thieu-tieu-de" className="landing-hero-title m-0 text-4xl sm:text-5xl lg:text-6xl 2xl:text-7xl font-black text-white tracking-tight leading-[1.15] sm:leading-[1.12] text-balance">
            <span className="block sm:inline">Nền tảng quản lý Giáo lý </span>
            <span className="text-parish-secondary-light">
              &amp; Thiếu Nhi Thánh Thể
            </span>
          </h1>

          <p className="landing-hero-lead m-0 mt-1 text-sm sm:text-base lg:text-lg font-medium text-white/95 max-w-2xl leading-relaxed text-balance">
            Giáo lý, chuyên cần, điểm số và đời sống Xứ Đoàn — trong một nền tảng dành riêng cho Xứ Đoàn Đức Mẹ Fatima.
          </p>
        </div>

        {/* Cặp nút hành động tối giản (2 CTAs kiềm chế, tỷ lệ cân đối với tiêu đề) */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 w-full max-w-64 sm:max-w-md mx-auto pt-1 sm:pt-2 hero-enter-3">
          <button
            type="button"
            onClick={onLogin}
            className="btn btn-primary rounded-full py-2.5 sm:py-3.5 px-5 sm:px-7 min-h-11 sm:min-h-12 w-full sm:w-auto sm:min-w-[200px] flex items-center justify-center gap-2 shadow-lg text-sm sm:text-base font-bold transition-transform active:scale-95"
          >
            <Users aria-hidden="true" className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span>{isLoggedIn ? 'Vào hệ thống' : 'Bắt đầu đăng nhập'}</span>
            <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          </button>

          <a
            href="#san-pham"
            className="border border-white/30 bg-white/10 hover:bg-white/20 backdrop-blur-xs active:scale-95 text-white font-semibold rounded-full py-2.5 sm:py-3 px-5 sm:px-6 min-h-11 sm:min-h-12 w-full sm:w-auto sm:min-w-[170px] flex items-center justify-center gap-2 shadow-xs transition-colors duration-150 no-underline text-sm sm:text-base"
          >
            <Compass aria-hidden="true" className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-white/90" />
            <span>Khám phá nền tảng</span>
          </a>
        </div>
      </div>

      {/* 3. KHỐI CHÂN ẢNH: Thẻ Kính Nổi Nhận Diện Mục Vụ (Parish Identity Rail) */}
      <figcaption className="relative z-20 w-full max-w-3xl lg:max-w-4xl mx-auto hero-enter-4">
        <div className="landing-hero-identity text-white text-xs flex flex-col gap-2 sm:gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-2">
            <span className="font-serif font-extrabold text-white tracking-wide flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-parish-secondary-light" aria-hidden="true" />
              <span>Xứ Đoàn Đức Mẹ Fatima</span>
            </span>
            <span className="inline-flex items-center gap-1 text-white/85 font-medium">
              <Calendar aria-hidden="true" className="w-3.5 h-3.5 text-white/70" />
              <span>Niên khóa {displayYear}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
            <div className="md:col-span-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/10 backdrop-blur-xs border border-white/10 min-w-0">
              <Award aria-hidden="true" className="w-4 h-4 text-parish-secondary-light shrink-0" />
              <span className="leading-snug text-white/95">
                <strong className="text-white font-bold">Bổn mạng Xứ Đoàn</strong>: Đức Mẹ Fatima (13/5)
              </span>
            </div>

            <div className="md:col-span-3 flex items-start sm:items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/10 backdrop-blur-xs border border-white/10 min-w-0">
              <span aria-hidden="true" className="text-sm shrink-0 select-none">⚜️</span>
              <span className="leading-snug text-white/95">
                <strong className="text-white font-bold">4 Tôn Chỉ TNTT</strong>: Cầu nguyện · Rước lễ · Hy sinh · Làm việc tông đồ
              </span>
            </div>
          </div>
        </div>
      </figcaption>

      {/* 4. CHỈ HƯỚNG CUỘN (Scroll Down Indicator) */}
      <div className="relative z-20 flex justify-center pt-2 sm:pt-3 hero-enter-5">
        <a
          href="#hanh-trinh"
          aria-label="Khám phá hành trình Xứ Đoàn cùng Catevia"
          className="group inline-flex flex-col items-center justify-center gap-1 min-h-11 px-3 text-white/70 hover:text-white transition-colors duration-200 no-underline"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-white/80 group-hover:text-white transition-colors">
            Khám phá
          </span>
          <ChevronDown aria-hidden="true" className="w-4 h-4 text-white/80 group-hover:text-white motion-safe:animate-bounce" />
        </a>
      </div>

      {/* Chuyển tiếp ánh sáng đáy sang canvas thân bài (Bottom Ambient Veil) */}
      <div className="scene-hero-bottom-veil" aria-hidden="true" />
    </figure>
  )
}
