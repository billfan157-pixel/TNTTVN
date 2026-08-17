import React, { useMemo } from 'react'
import { Calendar as CalendarIcon, Sparkles, BookOpen, ChevronRight, Church } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { getLiturgicalDay } from '../../utils/liturgicalEngine'
import { LITURGICAL_COLORS } from '../../constants/liturgical'

export const LiturgicalTodayWidget: React.FC = () => {
  const navigate = useNavigate()
  const today = useMemo(() => getLiturgicalDay(new Date()), [])
  const colorMeta = LITURGICAL_COLORS[today.color] || LITURGICAL_COLORS.GREEN

  const todayFormatted = useMemo(() => {
    const d = new Date()
    return d.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }, [])

  return (
    <div className="bg-surface-card rounded-2xl border border-surface-border p-5 shadow-card relative overflow-hidden flex flex-col justify-between group hover:border-parish-primary/40 transition-all">
      {/* Background Accent Gradient */}
      <div
        className="absolute top-0 right-0 w-36 h-36 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none opacity-20"
        style={{ backgroundColor: colorMeta.hex }}
      />

      <div>
        {/* Top bar: Date & Badge */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-parish-primary/10 text-parish-primary flex items-center justify-center font-bold">
              <CalendarIcon size={16} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-text-muted capitalize block">
                {todayFormatted}
              </span>
              <span className="text-xs font-extrabold text-text-secondary">
                {today.seasonName} • Năm {today.sundayCycle || 'A'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Color dot & Rank badge */}
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 ${colorMeta.bgClass} ${colorMeta.textClass} ${colorMeta.borderClass}`}
            >
              <span
                className="w-2 h-2 rounded-full border border-black/10"
                style={{ backgroundColor: colorMeta.hex }}
              />
              <span>{today.rankName}</span>
            </span>

            {today.isHolyDayOfObligation && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider badge-danger">
                Lễ Buộc
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <div className="mt-1 mb-2">
          <h3 className="typography-section-title text-text-main m-0 leading-snug group-hover:text-parish-primary transition-colors flex items-center gap-1.5">
            {today.title}
          </h3>
          {today.subTitle && (
            <p className="text-xs text-text-muted mt-1 m-0 font-medium">{today.subTitle}</p>
          )}
        </div>

        {/* Gospel Verse Quote */}
        {today.readings?.gospelVerse && (
          <div className="bg-surface-app p-3 rounded-xl border border-surface-border mt-3 mb-2 flex items-start gap-2">
            <Sparkles size={15} className="text-parish-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-xs italic text-text-secondary m-0 leading-relaxed font-medium">
                "{today.readings.gospelVerse}"
              </p>
              {today.readings.gospel && (
                <span className="text-[11px] font-bold text-parish-primary mt-1 block">
                  — Phúc Âm: {today.readings.gospel}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="mt-3 pt-3 border-t border-surface-border flex items-center justify-between text-xs">
        <span className="text-text-muted font-medium flex items-center gap-1">
          <Church size={13} /> Áo lễ: <strong className={colorMeta.textClass}>{today.colorName}</strong>
        </span>

        <button
          onClick={() => navigate({ to: '/calendar' })}
          className="btn btn-ghost btn-sm text-parish-primary hover:text-parish-primary-hover font-bold flex items-center gap-1 bg-transparent border-none cursor-pointer p-0"
        >
          <span>Xem Lịch Phụng Vụ</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
