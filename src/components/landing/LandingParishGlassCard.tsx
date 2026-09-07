import React from 'react'
import { Award, Calendar, Church, LayoutGrid, Sparkles, Users } from 'lucide-react'
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
    <figure className="m-0 relative h-[calc(100vh-4rem)] h-[calc(100dvh-4rem)] min-h-[520px] sm:h-auto sm:min-h-[640px] lg:min-h-[720px] 2xl:min-h-[800px] w-full overflow-hidden border-b border-surface-border shadow-card flex flex-col justify-between p-3.5 sm:p-8 lg:p-12 2xl:p-16 pb-[max(0.875rem,env(safe-area-inset-bottom,0px))] group">
      {/* ẢNH TẬP THỂ XỨ ĐOÀN LÀM NỀN TOÀN CẢNH (Full-bleed Hero Background) */}
      <img
        src="/images/xu-doan-tap-the.jpg"
        alt="Tập thể huynh trưởng và thiếu nhi Xứ Đoàn Đức Mẹ Fatima, Giáo Xứ Gia Tôn chụp ảnh lưu niệm trước thánh đường"
        width={1600}
        height={1143}
        decoding="async"
        fetchPriority="high"
        className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.02]"
      />

      {/* LỚP PHỦ ÁNH SÁNG & ĐỘ SÂU (Cinematic Ambient Dark Overlay chuẩn phong cách xứ đoàn) */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black/85 pointer-events-none"
        aria-hidden="true"
      />

      {/* 1. KHỐI TRÊN: Huy hiệu Phong Trào TNTTVN */}
      <div className="relative z-10 flex justify-center pt-2">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-xs font-extrabold text-white tracking-wide shadow-xs">
          <Sparkles aria-hidden="true" className="w-3.5 h-3.5 text-parish-secondary-light" />
          <span>Phong Trào Thiếu Nhi Thánh Thể Việt Nam</span>
        </span>
      </div>

      {/* 2. KHỐI TRUNG TÂM: Tiêu đề Serif lớn, Câu Châm Ngôn & Cặp Nút Pill (Chuẩn layout trang xứ đoàn mẫu) */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto py-2 sm:py-6 gap-3 sm:gap-5 max-w-xl mx-auto w-full">
        {/* Danh xưng Xứ Đoàn dạng Serif cổ điển, uy nghi */}
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-3xl sm:text-4xl lg:text-5xl font-serif font-black uppercase text-white tracking-wider leading-tight drop-shadow-lg">
            <span className="block sm:inline">XỨ ĐOÀN </span>
            <span>ĐỨC MẸ FATIMA</span>
          </p>
          <p className="m-0 text-xs sm:text-sm font-semibold text-white/90 flex items-center justify-center gap-1.5 drop-shadow-sm">
            <Church aria-hidden="true" className="w-4 h-4 shrink-0 text-parish-secondary-light" />
            <span>Giáo Xứ Gia Tôn — Hạt Gia Kiệm · Giáo Phận Xuân Lộc</span>
          </p>
        </div>

        {/* Lời trích dẫn Bổn mạng Đức Mẹ Fatima */}
        <blockquote className="m-0 text-xs sm:text-sm text-white/95 italic leading-relaxed max-w-sm sm:max-w-md mx-auto px-2 drop-shadow-sm">
          &ldquo;Các con hãy siêng năng cầu nguyện và làm việc lành hy sinh mỗi ngày để cầu cho hòa bình thế giới và các linh hồn.&rdquo;
          <footer className="not-italic text-white/80 mt-1 font-semibold text-xs">
            ( Đức Mẹ Fatima )
          </footer>
        </blockquote>

        {/* Cặp nút hành động dạng Pill xếp dọc chuẩn Mobile mẫu */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-[280px] sm:max-w-md mx-auto pt-2">
          {/* Nút 1: Pill Xanh (Quản lý đoàn sinh / Bắt đầu đăng nhập) */}
          <button
            type="button"
            onClick={onLogin}
            className="btn btn-primary rounded-full py-3.5 px-6 min-h-12 w-full sm:w-auto sm:min-w-[210px] flex items-center justify-center gap-2.5 shadow-xl text-sm sm:text-base font-bold transition-transform active:scale-95"
          >
            <Users aria-hidden="true" className="w-5 h-5 shrink-0" />
            <span>{isLoggedIn ? 'Vào hệ thống' : 'Bắt đầu đăng nhập'}</span>
          </button>

          {/* Nút 2: Pill Viền Trắng (Khám phá) */}
          <a
            href="#gioi-thieu-tieu-de"
            className="border-2 border-white/90 hover:bg-white/15 active:scale-95 text-white font-bold rounded-full py-3 px-6 min-h-12 w-full sm:w-auto sm:min-w-[180px] flex items-center justify-center gap-2.5 shadow-sm transition-colors duration-150 no-underline text-sm sm:text-base"
          >
            <LayoutGrid aria-hidden="true" className="w-5 h-5 shrink-0" />
            <span>Khám phá</span>
          </a>
        </div>
      </div>

      {/* 3. KHỐI CHÂN ẢNH: Thẻ Kính Nổi Nhận Diện Mục Vụ (WCAG AAA) */}
      <figcaption className="relative z-10 w-full max-w-2xl lg:max-w-3xl 2xl:max-w-4xl mx-auto">
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
                <strong>4 Tôn Chỉ TNTT</strong>: Cầu nguyện · Rước lễ · Hy sinh · Tông đồ
              </span>
            </div>
          </div>
        </div>
      </figcaption>
    </figure>
  )
}
