import React from 'react'
import parishLogo from '../../assets/logo-gia-ton.png'

/**
 * The one emotional pause of the page: the bổn mạng's own words.
 *
 * Deliberately carries NO identity chrome — the parish name, address, 4 Tôn Chỉ and
 * niên khóa all already live in the sticky header (permanently visible) and the hero
 * identity rail one screen above; repeating them here was the exact duplication the
 * 2026-09-26 plan flagged (§15.5) and Phase 2 removed everywhere else. What remains is
 * the quote and its attribution — both unchanged, nothing pastoral is reworded.
 */
export function LandingFaithMoment() {
  return (
    // `data-landing-reveal="slow"` joins the one-shot reveal chain with the slowest
    // entrance on the page (see 25-landing.css "Chapter choreography"): the emotional
    // pause is the one place allowed to arrive deliberately. The arming effect only
    // hides sections that start below the fold, and never arms under reduced motion.
    <section
      aria-labelledby="tieu-de-faith-moment"
      className="landing-faith-section landing-shell"
      data-landing-reveal="slow"
    >
      <div className="landing-faith-card flex flex-col items-center text-center gap-5 sm:gap-7">
        {/* Ánh hào quang thánh đường (Cathedral Dome & Sacred Halo) */}
        <div aria-hidden="true" className="landing-faith-card__glow" />

        {/* Huy hiệu Giáo Xứ với vòng hào quang */}
        <div className="relative z-10">
          <div
            aria-hidden="true"
            className="absolute -inset-2 rounded-full bg-gradient-to-b from-brand-gold/30 to-transparent blur-md opacity-70"
          />
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full p-1.5 bg-gradient-to-b from-white/20 to-white/5 border border-brand-gold/45 shadow-lg flex items-center justify-center backdrop-blur-sm">
            <img
              src={parishLogo}
              alt="Logo Giáo Xứ Gia Tôn"
              className="w-full h-full rounded-full object-contain filter drop-shadow-sm"
            />
          </div>
        </div>

        {/* The chip is the section's h2: without it the only heading on the page with
            no level would be this section, and screen-reader heading navigation would
            skip the emotional pause entirely. */}
        <h2
          id="tieu-de-faith-moment"
          className="relative z-10 m-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.08] border border-brand-gold/30 text-xs font-bold uppercase tracking-[0.16em] text-brand-gold shadow-xs"
        >
          <span aria-hidden="true">⚜️</span>
          <span>Tâm tình Đức tin · Lời Bổn mạng</span>
          <span aria-hidden="true">⚜️</span>
        </h2>

        {/* Đường chỉ vàng ngăn cách thanh nhã */}
        <div className="relative z-10 w-20 sm:w-28 h-px bg-gradient-to-r from-transparent via-brand-gold/50 to-transparent my-0.5" aria-hidden="true" />

        {/* Lời trích dẫn Bổn Mạng */}
        <blockquote className="relative z-10 m-0 max-w-2xl mx-auto font-serif italic text-lg sm:text-xl lg:text-2xl text-text-inverse/95 leading-relaxed drop-shadow-sm [text-wrap:balance]">
          {/* U+00A0 inside "hy sinh": at this size the balance wrap landed the break
              between the two syllables of the fixed compound. Same class of fix as the
              hero H1's non-breaking space. */}
          &ldquo;Các con hãy siêng năng cầu nguyện và làm việc lành hy&nbsp;sinh mỗi ngày để cầu cho hòa bình thế giới và các linh hồn.&rdquo;
          <footer className="not-italic gold-shimmer-text mt-3 font-sans font-bold text-xs sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2">
            <span className="w-5 sm:w-8 h-px bg-brand-gold/40" aria-hidden="true" />
            <span>Đức Mẹ Fatima (13/5) · Bổn mạng Xứ Đoàn</span>
            <span className="w-5 sm:w-8 h-px bg-brand-gold/40" aria-hidden="true" />
          </footer>
        </blockquote>
      </div>
    </section>
  )
}
