import React, { useMemo, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Church,
  Crown,
  Palette,
  Quote,
  Sailboat,
  Sparkles,
} from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Button } from '../common/ui/Button'
import { PARISH_LOGO_MEANING } from '../../constants/parishLogoMeaning'
import parishLogo from '../../assets/logo-gia-ton.png'

interface ParishLogoModalProps {
  isOpen: boolean
  onClose: () => void
}

const SYMBOL_ICONS = {
  boat: Sailboat,
  colors: Palette,
  patron: Crown,
  church: Church,
} as const

const SYMBOL_TONES: Record<string, string> = {
  boat: 'bg-parish-danger-bg text-parish-danger',
  colors: 'bg-parish-primary-light text-parish-primary',
  patron: 'bg-parish-warning-bg text-parish-secondary',
  church: 'bg-parish-info-bg text-parish-info',
}

/** Accent vạch màu khăn ngành — token DS qua arbitrary var (hợp lệ theo DS §11). */
const BRANCH_ACCENTS: Record<string, string> = {
  ChienCon: 'bg-[var(--color-branch-chiencon)]',
  AuNhi: 'bg-[var(--color-branch-aunhi)]',
  ThieuNhi: 'bg-[var(--color-branch-thieunhi)]',
  NghiaSi: 'bg-[var(--color-branch-nghiasi)]',
  HiepSi: 'bg-[var(--color-branch-hiepsi)]',
}

export const ParishLogoModal: React.FC<ParishLogoModalProps> = ({ isOpen, onClose }) => {
  const [activeId, setActiveId] = useState<string>(PARISH_LOGO_MEANING.symbols[0].id)

  const symbols = PARISH_LOGO_MEANING.symbols
  const activeIndex = Math.max(
    0,
    symbols.findIndex((symbol) => symbol.id === activeId),
  )
  const active = useMemo(() => symbols[activeIndex], [symbols, activeIndex])
  const ActiveIcon = SYMBOL_ICONS[active.iconName]

  const handlePrev = () => {
    if (activeIndex > 0) {
      setActiveId(symbols[activeIndex - 1].id)
    }
  }

  const handleNext = () => {
    if (activeIndex < symbols.length - 1) {
      setActiveId(symbols[activeIndex + 1].id)
    }
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Ý Nghĩa Logo Xứ Đoàn"
      subtitle={`${PARISH_LOGO_MEANING.parishName} — ${PARISH_LOGO_MEANING.unitName}`}
      maxWidth="1024px"
      icon={
        <img
          src={parishLogo}
          alt="Logo Giáo Xứ Gia Tôn"
          className="w-6 h-6 object-contain"
        />
      }
      footer={
        <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between bg-surface-card border-t border-surface-border px-4 py-3 sm:px-6 sm:py-3.5 shadow-sm">
          <div className="flex items-center gap-1.5 justify-center sm:justify-start">
            <span className="h-1.5 w-1.5 rounded-full bg-parish-secondary shrink-0 hidden sm:inline-block" />
            <p className="text-xs text-text-muted m-0 font-medium text-center sm:text-left leading-normal">
              {PARISH_LOGO_MEANING.diocese} · {PARISH_LOGO_MEANING.deanery} · Logo Bổn Mạng Đức Mẹ Fatima
            </p>
          </div>
          <div className="flex justify-end w-full sm:w-auto">
            <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto font-bold min-h-[40px]">
              Đóng
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 sm:gap-4 py-1 pb-3">
        {/* 1. HERO: Huy hiệu hoàng gia tinh gọn & Tuyên ngôn linh đạo */}
        <div className="relative overflow-hidden rounded-2xl border border-surface-border bg-gradient-to-br from-surface-app via-surface-card to-surface-app p-3.5 sm:p-5 shadow-sm">
          {/* Vầng sáng tâm linh tinh tế góc thẻ */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-parish-primary/5 blur-2xl" />

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5 text-center sm:text-left">
            {/* Logo Framed Medallion */}
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-parish-secondary/30 bg-surface-card p-2 shadow-card ring-2 ring-parish-primary/10 sm:h-32 sm:w-32 lg:h-36 lg:w-36">
              <img
                src={parishLogo}
                alt="Logo Xứ Đoàn Đức Mẹ Fatima — con thuyền đức tin, nhà thờ Gia Tôn và Đức Mẹ Fatima"
                className="h-full w-full object-contain"
              />
              <div
                className="absolute -bottom-1 -right-1 hidden sm:flex h-6 w-6 items-center justify-center rounded-full bg-parish-secondary text-text-inverse shadow-sm text-xs font-bold"
                title="Căn tính Kitô giáo"
                aria-hidden="true"
              >
                ✝
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start sm:gap-2">
                <span className="badge badge-primary">
                  <Sparkles aria-hidden="true" className="h-3 w-3" />
                  Logo &amp; Căn tính phụng vụ
                </span>
                <span className="badge badge-neutral">04 biểu tượng</span>
                <span className="badge badge-neutral">05 ngành TNTT</span>
              </div>
              <p className="text-xs sm:typography-body text-text-main m-0 leading-relaxed">
                {PARISH_LOGO_MEANING.overview}
              </p>
              <p className="text-xs text-text-muted m-0 leading-relaxed font-normal">
                Đọc từ trái sang phải, từ dưới lên trên: con thuyền rẽ sóng — năm sắc màu hiệp nhất — Đức Mẹ Fatima che chở — nhà thờ cội nguồn.
              </p>
            </div>
          </div>
        </div>

        {/* 2 + 3. KHÁM PHÁ: Desktop 2 cột (rail trái + panel phải), Mobile phân đoạn 4 cột tinh gọn */}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* 2. THANH ĐIỀU HƯỚNG 4 CHẶNG: Mobile hiển thị 4 cột gọn gàng không bị cắt chữ, Desktop hiển thị dạng thanh rail */}
          <div
            className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-surface-app border border-surface-border sm:bg-transparent sm:border-0 sm:p-0 sm:grid-cols-4 lg:sticky lg:top-0 lg:grid-cols-1 lg:gap-2"
            role="group"
            aria-label="Chọn biểu tượng để khám phá ý nghĩa"
          >
            {symbols.map((symbol, index) => {
              const Icon = SYMBOL_ICONS[symbol.iconName]
              const isActive = symbol.id === active.id
              return (
                <button
                  key={symbol.id}
                  type="button"
                  onClick={() => setActiveId(symbol.id)}
                  aria-pressed={isActive}
                  aria-label={`Xem ý nghĩa ${symbol.title}`}
                  className={`group relative flex min-h-[58px] sm:min-h-11 flex-col sm:flex-row items-center gap-1 sm:gap-2.5 rounded-xl border p-1.5 sm:p-2.5 text-center sm:text-left transition-colors duration-200 ${
                    isActive
                      ? 'border-parish-primary bg-surface-selected ring-1 ring-parish-primary shadow-sm'
                      : 'border-surface-border bg-surface-card hover:bg-surface-app text-text-muted hover:text-text-main'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 ${SYMBOL_TONES[symbol.iconName]}`}
                    aria-hidden="true"
                  >
                    <Icon size={16} className="sm:w-[17px] sm:h-[17px]" />
                  </span>
                  <span className="min-w-0 w-full flex-1">
                    <span className="block text-xs font-extrabold text-text-main text-center sm:text-left leading-tight sm:leading-normal">
                      <span className="hidden sm:inline mr-1 text-text-muted">{`0${index + 1}`}</span>
                      {index === 0 && (
                        <>
                          <span className="sm:hidden block">Thuyền<br />Đức Tin</span>
                          <span className="hidden sm:inline">{symbol.shortLabel}</span>
                        </>
                      )}
                      {index === 1 && (
                        <>
                          <span className="sm:hidden block">Năm<br />Sắc Màu</span>
                          <span className="hidden sm:inline">{symbol.shortLabel}</span>
                        </>
                      )}
                      {index === 2 && (
                        <>
                          <span className="sm:hidden block">Đức Mẹ<br />Fatima</span>
                          <span className="hidden sm:inline">{symbol.shortLabel}</span>
                        </>
                      )}
                      {index === 3 && (
                        <>
                          <span className="sm:hidden block">Nhà Thờ<br />Gia Tôn</span>
                          <span className="hidden sm:inline">{symbol.shortLabel}</span>
                        </>
                      )}
                    </span>
                    <span className="hidden sm:block text-xs leading-relaxed text-text-muted">
                      {symbol.subtitle}
                    </span>
                  </span>
                  {/* Mobile active indicator bar */}
                  {isActive && (
                    <span
                      className="block sm:hidden h-1 w-4 rounded-full bg-parish-primary mt-0.5"
                      aria-hidden="true"
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* 3. PANEL CHI TIẾT BIỂU TƯỢNG ĐANG CHỌN */}
          <section
            aria-live="polite"
            aria-label={`Ý nghĩa ${active.title}`}
            className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface-card p-3.5 shadow-card sm:p-5"
          >
            {/* Khối nội dung động của biểu tượng đang chọn */}
            <div key={active.id} className="flex flex-col gap-3">
              {/* Header thẻ chi tiết */}
              <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${SYMBOL_TONES[active.iconName]}`}
                aria-hidden="true"
              >
                <ActiveIcon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="typography-caption text-text-muted font-bold tracking-wider m-0">
                    CHẶNG 0{activeIndex + 1} / 0{symbols.length}
                  </span>
                  <span className="hidden sm:inline-block h-1 w-1 rounded-full bg-text-muted/40" />
                  <span className="hidden sm:inline-block typography-caption text-parish-secondary font-semibold">
                    {active.shortLabel}
                  </span>
                </div>
                <h3 className="typography-card-title text-text-main m-0 mt-0.5">
                  {active.title}
                </h3>
                <p className="typography-body-sm text-text-muted m-0 mt-0.5 font-medium">
                  {active.subtitle}
                </p>
              </div>
            </div>

            {/* Diễn giải linh đạo */}
            <p className="typography-body text-text-secondary m-0 leading-relaxed font-normal">
              {active.description}
            </p>

            {/* Điểm cốt lõi */}
            {active.highlights && (
              <div className="rounded-xl border border-surface-border bg-surface-app/80 p-3 sm:p-3.5">
                <div className="typography-caption text-text-muted mb-2 font-bold tracking-wider">
                  Ý NGHĨA CỐT LÕI
                </div>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {active.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-text-main">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-parish-success" />
                      <span className="typography-body-sm text-text-secondary">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Lời Chúa soi sáng */}
            {active.scripture && (
              <figure className="m-0 flex gap-3 rounded-xl border-l-4 border-parish-secondary bg-parish-warning-bg/40 p-3 sm:p-3.5 shadow-sm">
                <Quote aria-hidden="true" className="h-5 w-5 shrink-0 text-parish-secondary mt-0.5" />
                <div className="min-w-0">
                  <blockquote className="typography-body m-0 italic leading-relaxed text-text-main">
                    “{active.scripture}”
                  </blockquote>
                  <figcaption className="typography-caption text-text-muted mt-1.5 flex items-center gap-1">
                    <BookOpen aria-hidden="true" className="h-3.5 w-3.5 text-parish-secondary" />
                    <span className="font-semibold text-text-main">{active.scriptureRef}</span>
                    <span className="hidden sm:inline">· Lời Chúa soi sáng</span>
                  </figcaption>
                </div>
              </figure>
            )}

            {/* Dải 5 ngành — chỉ hiện ở biểu tượng Sắc Màu: Mobile Carousel vuốt ngang mượt mà, Desktop 5 cột */}
            {active.id === 'colors' && (
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between">
                  <p className="typography-caption text-text-muted m-0 font-bold tracking-wider">
                    5 NGÀNH HIỆP NHẤT — TẤM VÁN CON THUYỀN ĐỨC TIN
                  </p>
                  <span className="text-xs text-text-muted sm:hidden">Vuốt ngang 👉</span>
                </div>

                <ol className="m-0 flex overflow-x-auto gap-2.5 pb-2 -mx-1 px-1 snap-x snap-mandatory sm:grid sm:grid-cols-3 lg:grid-cols-5 sm:overflow-visible sm:pb-0 sm:px-0 sm:mx-0 list-none p-0">
                  {PARISH_LOGO_MEANING.branches.map((branch) => (
                    <li
                      key={branch.id}
                      className="flex w-[210px] shrink-0 snap-center sm:w-auto flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-sm hover:border-parish-primary/40 transition-colors"
                    >
                      <span
                        className={`block h-1.5 w-full ${BRANCH_ACCENTS[branch.id] ?? 'bg-surface-selected-border'}`}
                        aria-hidden="true"
                      />
                      <div className="flex flex-col gap-1.5 p-3">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-extrabold text-text-main">
                            {branch.name}
                          </span>
                          <span className="typography-caption text-text-muted">
                            {branch.ageRange}
                          </span>
                        </div>
                        <span className="badge badge-neutral self-start">
                          “{branch.motto}”
                        </span>
                        <span className="typography-body-sm text-text-secondary leading-relaxed">
                          {branch.meaning}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            </div>

            {/* Cụm điều hướng một chạm tiện lợi trên Mobile (Thumb-friendly Journey Stepper) */}
            <div className="flex sm:hidden items-center justify-between gap-2 pt-2.5 border-t border-surface-border mt-1">
              <button
                type="button"
                onClick={handlePrev}
                disabled={activeIndex === 0}
                aria-label="Biểu tượng trước"
                className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  activeIndex === 0
                    ? 'border-surface-border text-text-disabled cursor-not-allowed opacity-50'
                    : 'border-surface-border bg-surface-card text-text-main hover:bg-surface-app active:bg-surface-selected'
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Chặng trước</span>
              </button>

              <div className="flex items-center gap-1.5" aria-label={`Đang ở chặng ${activeIndex + 1} trên ${symbols.length}`}>
                {symbols.map((s, idx) => (
                  <span
                    key={s.id}
                    className={`h-1.5 rounded-full transition-colors duration-200 ${
                      idx === activeIndex
                        ? 'w-5 bg-parish-primary'
                        : 'w-1.5 bg-surface-border'
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handleNext}
                disabled={activeIndex === symbols.length - 1}
                aria-label="Biểu tượng tiếp theo"
                className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  activeIndex === symbols.length - 1
                    ? 'border-surface-border text-text-disabled cursor-not-allowed opacity-50'
                    : 'border-surface-border bg-surface-card text-text-main hover:bg-surface-app active:bg-surface-selected'
                }`}
              >
                <span>Chặng sau</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>

        {/* 4. GỢI Ý CHIÊM NGẮM: Thẻ hành hương tâm linh trang trọng */}
        <div className="rounded-xl border border-surface-border bg-surface-app/70 p-3 sm:p-3.5 text-center mb-2">
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-parish-secondary mb-1">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            <span>HÀNH TRÌNH CHIÊM NGẮM ĐỨC TIN</span>
          </div>
          <p className="text-xs text-text-muted m-0 leading-relaxed italic">
            Mời bạn chạm vào từng biểu tượng phía trên để chiêm ngắm logo như một hành trình đức tin: ra khơi — hiệp nhất — được Mẹ dẫn lối — trở về nhà thờ.
          </p>
        </div>
      </div>
    </ModalShell>
  )
}

