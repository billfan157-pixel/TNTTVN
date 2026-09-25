import React from 'react'
import { ArrowRight, Award, Calendar, Church, Compass, Sparkles, Users } from 'lucide-react'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { normalizeAcademicYear } from '../../utils/academicYear'

interface LandingParishGlassCardProps {
  onLogin?: () => void
  isLoggedIn?: boolean
}

export function LandingParishGlassCard({ onLogin, isLoggedIn = false }: LandingParishGlassCardProps) {
  const currentYear = useAcademicYearStore(s => s.currentYear)
  const activeYear = normalizeAcademicYear(currentYear) || '2025-2026'
  const displayYear = activeYear.replace('-', '–')

  return (
    <figure className="scene-hero-stage m-0 relative w-full min-h-[580px] sm:min-h-[640px] lg:min-h-[720px] 2xl:min-h-[800px] overflow-hidden border-b border-surface-border shadow-card flex flex-col justify-between p-4 sm:p-8 lg:p-12 2xl:p-16 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
      {/* ẢNH TẬP THỂ XỨ ĐOÀN LÀM NỀN TOÀN CẢNH (Full-bleed Hero Background — không zoom khi hover) */}
      <img
        src="/images/xu-doan-tap-the.jpg"
        alt="Tập thể huynh trưởng và thiếu nhi Xứ Đoàn Đức Mẹ Fatima, Giáo Xứ Gia Tôn chụp ảnh lưu niệm trước thánh đường"
        width={1600}
        height={1143}
        decoding="async"
        fetchPriority="high"
        className="scene-hero-bg absolute inset-0 w-full h-full object-cover object-center"
      />

      {/* LỚP PHỦ ÁNH SÁNG & ĐỘ SÂU (Cinematic Ambient Dark Overlay chuẩn phong cách tĩnh lặng) */}
      <div
        className="scene-hero-bg absolute inset-0 bg-gradient-to-b from-black/85 via-black/60 to-black/90 pointer-events-none"
        aria-hidden="true"
      />

      {/* 1. KHỐI TRÊN: Eyebrow Phong Trào TNTTVN */}
      <div className="relative z-10 flex justify-center pt-2">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-xs font-extrabold text-white tracking-wide shadow-xs">
          <Sparkles aria-hidden="true" className="w-3.5 h-3.5 text-parish-secondary-light" />
          <span>Phong Trào Thiếu Nhi Thánh Thể Việt Nam</span>
        </span>
      </div>

      {/* 2. KHỐI TRUNG TÂM: Unified Catevia × Parish Proposition */}
      <div className="scene-hero-content relative z-10 flex flex-col items-center justify-center text-center my-auto py-6 sm:py-10 gap-4 sm:gap-6 max-w-3xl mx-auto w-full">
        {/* Định danh Xứ đoàn & Catevia */}
        <div className="flex flex-col items-center gap-2">
          <p className="m-0 text-xs sm:text-sm font-bold uppercase tracking-widest text-parish-secondary-light flex items-center justify-center gap-1.5 drop-shadow-sm">
            <Church aria-hidden="true" className="w-4 h-4 shrink-0 text-parish-secondary-light" />
            <span>Xứ Đoàn Đức Mẹ Fatima · Giáo Xứ Gia Tôn</span>
          </p>

          <h1 className="m-0 text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15] drop-shadow-lg">
            Nền tảng quản lý Giáo lý &amp; Thiếu Nhi Thánh Thể
          </h1>

          <p className="m-0 mt-1 text-sm sm:text-base lg:text-lg font-medium text-white/90 max-w-2xl leading-relaxed drop-shadow-sm">
            Giáo lý, chuyên cần, điểm số và đời sống Xứ đoàn — trong một nền tảng dành riêng cho Xứ Đoàn Đức Mẹ Fatima.
          </p>
        </div>

        {/* Cặp nút hành động tối giản (2 CTAs kiềm chế) */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-xs sm:max-w-md mx-auto pt-2">
          <button
            type="button"
            onClick={onLogin}
            className="btn btn-primary rounded-full py-3.5 px-7 min-h-12 w-full sm:w-auto sm:min-w-[210px] flex items-center justify-center gap-2.5 shadow-xl text-sm sm:text-base font-bold transition-transform active:scale-95"
          >
            <Users aria-hidden="true" className="w-5 h-5 shrink-0" />
            <span>{isLoggedIn ? 'Vào hệ thống' : 'Bắt đầu đăng nhập'}</span>
            <ArrowRight aria-hidden="true" className="w-4 h-4 shrink-0" />
          </button>

          <a
            href="#san-pham"
            className="border-2 border-white/85 hover:bg-white/15 active:scale-95 text-white font-bold rounded-full py-3 px-6 min-h-12 w-full sm:w-auto sm:min-w-[180px] flex items-center justify-center gap-2.5 shadow-sm transition-colors duration-150 no-underline text-sm sm:text-base"
          >
            <Compass aria-hidden="true" className="w-5 h-5 shrink-0" />
            <span>Khám phá nền tảng</span>
          </a>
        </div>
      </div>

      {/* 3. KHỐI CHÂN ẢNH: Thẻ Kính Nổi Nhận Diện Mục Vụ (Parish Identity Rail) */}
      <figcaption className="relative z-10 w-full max-w-3xl lg:max-w-4xl mx-auto">
        <div className="backdrop-blur-md bg-black/45 border border-white/20 ring-1 ring-white/10 rounded-2xl p-3 sm:p-4 text-white text-xs shadow-2xl flex flex-col gap-2 sm:gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-2">
            <span className="font-extrabold text-white tracking-wide flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-parish-secondary-light" aria-hidden="true" />
              <span>Xứ Đoàn Đức Mẹ Fatima</span>
            </span>
            <span className="inline-flex items-center gap-1 text-white/85 font-medium">
              <Calendar aria-hidden="true" className="w-3.5 h-3.5 text-white/70" />
              <span>Niên khóa {displayYear}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/10 backdrop-blur-xs border border-white/10">
              <Award aria-hidden="true" className="w-4 h-4 text-parish-secondary-light shrink-0" />
              <span className="truncate">
                <strong>Bổn mạng Xứ Đoàn</strong>: Đức Mẹ Fatima (13/5)
              </span>
            </div>

            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/10 backdrop-blur-xs border border-white/10">
              <span aria-hidden="true" className="text-sm shrink-0">⚜️</span>
              <span className="truncate">
                <strong>4 Tôn Chỉ TNTT</strong>: Cầu nguyện · Rước lễ · Hy sinh · Làm tông đồ
              </span>
            </div>
          </div>
        </div>
      </figcaption>

      {/* Chuyển tiếp ánh sáng đáy sang canvas thân bài (Bottom Ambient Veil) */}
      <div className="scene-hero-bottom-veil" aria-hidden="true" />
    </figure>
  )
}
