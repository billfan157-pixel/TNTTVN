import React from 'react'
import { Calendar, Church } from 'lucide-react'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { normalizeAcademicYear } from '../../utils/academicYear'
import parishLogo from '../../assets/logo-gia-ton.png'

export function LandingFaithMoment() {
  const currentYear = useAcademicYearStore(s => s.currentYear)
  const activeYear = normalizeAcademicYear(currentYear) || '2025-2026'
  const displayYear = activeYear.replace('-', '–')

  return (
    <section aria-labelledby="tieu-de-faith-moment" className="w-full">
      <div className="rounded-3xl bg-parish-primary text-text-inverse p-8 sm:p-12 lg:p-16 flex flex-col items-center text-center gap-8 relative overflow-hidden shadow-card">
        {/* Họa tiết trang nghiêm nền */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-radial from-white/10 via-transparent to-transparent pointer-events-none"
        />

        {/* Logo và Danh xưng Giáo Xứ */}
        <div className="relative z-10 flex flex-col items-center gap-3">
          <img
            src={parishLogo}
            alt="Logo Giáo Xứ Gia Tôn"
            className="w-16 h-16 rounded-full object-contain bg-white/10 p-1 border border-white/20 shadow-md"
          />
          <div>
            <h2 id="tieu-de-faith-moment" className="m-0 text-xl sm:text-2xl font-serif font-black uppercase tracking-wider text-text-inverse drop-shadow-sm">
              Xứ Đoàn Đức Mẹ Fatima
            </h2>
            <p className="m-0 mt-1 text-xs sm:text-sm font-medium text-text-inverse/80 flex items-center justify-center gap-1.5">
              <Church className="w-4 h-4 text-parish-secondary-light" aria-hidden="true" />
              <span>Giáo Xứ Gia Tôn — Giáo hạt Gia Kiệm · Giáo Phận Xuân Lộc</span>
            </p>
          </div>
        </div>

        {/* Lời trích dẫn Bổn Mạng */}
        <blockquote className="relative z-10 m-0 max-w-2xl mx-auto font-serif italic text-base sm:text-lg lg:text-xl text-text-inverse/95 leading-relaxed drop-shadow-sm">
          &ldquo;Các con hãy siêng năng cầu nguyện và làm việc lành hy sinh mỗi ngày để cầu cho hòa bình thế giới và các linh hồn.&rdquo;
          <footer className="not-italic text-text-inverse/80 mt-2 font-sans font-semibold text-xs tracking-wider">
            — Đức Mẹ Fatima (13/5) —
          </footer>
        </blockquote>

        {/* 4 Tôn chỉ TNTT & Niên khóa */}
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs text-text-inverse/90">
            <span aria-hidden="true">⚜️</span>
            <span><strong>4 Tôn Chỉ TNTT:</strong> Cầu nguyện · Rước lễ · Hy sinh · Tông đồ</span>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs text-text-inverse/90">
            <Calendar className="w-3.5 h-3.5 text-parish-secondary-light" aria-hidden="true" />
            <span>Niên khóa Giáo lý {displayYear}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
