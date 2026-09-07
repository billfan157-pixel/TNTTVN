import React, { useMemo, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
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
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="typography-caption text-text-muted m-0">
            {PARISH_LOGO_MEANING.diocese} · {PARISH_LOGO_MEANING.deanery} · Logo Bổn Mạng Đức Mẹ Fatima
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        {/* 1. HERO: Logo + Tuyên ngôn linh đạo */}
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-surface-border bg-surface-app p-4 text-center sm:flex-row sm:gap-5 sm:p-5 sm:text-left">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border border-surface-border bg-surface-card p-2 shadow-card sm:h-36 sm:w-36 lg:h-44 lg:w-44">
            <img
              src={parishLogo}
              alt="Logo Xứ Đoàn Đức Mẹ Fatima — con thuyền đức tin, nhà thờ Gia Tôn và Đức Mẹ Fatima"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="badge badge-primary">
                <Sparkles aria-hidden="true" className="h-3 w-3" />
                Logo &amp; Căn tính phụng vụ
              </span>
              <span className="badge badge-neutral">04 biểu tượng</span>
              <span className="badge badge-neutral">05 ngành TNTT</span>
            </div>
            <p className="typography-body text-text-main m-0 leading-relaxed">
              {PARISH_LOGO_MEANING.overview}
            </p>
            <p className="typography-caption text-text-muted m-0">
              Đọc từ trái sang phải, từ dưới lên trên: con thuyền rẽ sóng — năm sắc màu hiệp nhất — Mẹ Fatima che chở — nhà thờ cội nguồn.
            </p>
          </div>
        </div>

        {/* 2 + 3. KHÁM PHÁ: desktop 2 cột (rail trái + panel phải), mobile xếp chồng */}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[248px_minmax(0,1fr)]">
        {/* 2. THANH KHÁM PHÁ: chọn từng biểu tượng */}
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:sticky lg:top-0 lg:grid-cols-1"
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
                className={`flex min-h-11 items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${
                  isActive
                    ? 'border-parish-primary bg-surface-selected ring-1 ring-parish-primary'
                    : 'border-surface-border bg-surface-card hover:bg-surface-app'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${SYMBOL_TONES[symbol.iconName]}`}
                  aria-hidden="true"
                >
                  <Icon size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-extrabold text-text-main">
                    <span className="mr-1 text-text-muted">{`0${index + 1}`}</span>
                    {symbol.shortLabel}
                  </span>
                  <span className="block text-xs leading-relaxed text-text-muted">
                    {symbol.subtitle}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* 3. PANEL CHI TIẾT BIỂU TƯỢNG ĐANG CHỌN */}
        <section
          key={active.id}
          aria-live="polite"
          aria-label={`Ý nghĩa ${active.title}`}
          className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface-card p-4 shadow-card sm:p-5"
        >
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${SYMBOL_TONES[active.iconName]}`}
              aria-hidden="true"
            >
              <ActiveIcon size={20} />
            </div>
            <div className="min-w-0">
              <p className="typography-caption text-text-muted m-0">
                Biểu tượng {`0${activeIndex + 1}`}/0{symbols.length}
              </p>
              <h3 className="typography-card-title text-text-main m-0 mt-0.5">
                {active.title}
              </h3>
              <p className="typography-body-sm text-text-muted m-0 mt-0.5 font-semibold">
                {active.subtitle}
              </p>
            </div>
          </div>

          <p className="typography-body text-text-secondary m-0 leading-relaxed">
            {active.description}
          </p>

          {active.highlights && (
            <ul className="m-0 flex list-none flex-col gap-2 rounded-xl border border-surface-border bg-surface-app p-3">
              {active.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-text-main">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-parish-success" />
                  <span className="typography-body-sm">{item}</span>
                </li>
              ))}
            </ul>
          )}

          {active.scripture && (
            <figure className="m-0 flex gap-2.5 rounded-xl border-l-4 border-parish-secondary bg-parish-warning-bg/40 p-3">
              <Quote aria-hidden="true" className="h-4 w-4 shrink-0 text-parish-secondary" />
              <div>
                <blockquote className="typography-body m-0 italic leading-relaxed text-text-main">
                  “{active.scripture}”
                </blockquote>
                <figcaption className="typography-caption text-text-muted mt-1 flex items-center gap-1">
                  <BookOpen aria-hidden="true" className="h-3 w-3" />
                  {active.scriptureRef}
                </figcaption>
              </div>
            </figure>
          )}

          {/* Dải 5 ngành — chỉ hiện ở biểu tượng Sắc Màu */}
          {active.id === 'colors' && (
            <div className="flex flex-col gap-2 pt-1">
              <p className="typography-caption text-text-muted m-0">
                Hành trình khôn lớn trong Xứ Đoàn — từ Chiên Con đến Hiệp Sĩ
              </p>
              <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-5">
                {PARISH_LOGO_MEANING.branches.map((branch) => (
                  <li
                    key={branch.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-card"
                  >
                    <span
                      className={`block h-1.5 w-full ${BRANCH_ACCENTS[branch.id] ?? 'bg-surface-selected-border'}`}
                      aria-hidden="true"
                    />
                    <div className="flex flex-col gap-1 p-2.5">
                      <span className="text-xs font-extrabold text-text-main">
                        {branch.name}
                      </span>
                      <span className="typography-caption text-text-muted">
                        {branch.ageRange}
                      </span>
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
        </section>
        </div>

        {/* 4. GỢI Ý CHIÊM NGẮM */}
        <p className="typography-body-sm text-text-muted m-0 text-center leading-relaxed">
          Mời bạn chạm vào từng biểu tượng phía trên để chiêm ngắm logo như một hành trình đức tin: ra khơi — hiệp nhất — được Mẹ dẫn lối — trở về nhà thờ.
        </p>
      </div>
    </ModalShell>
  )
}
