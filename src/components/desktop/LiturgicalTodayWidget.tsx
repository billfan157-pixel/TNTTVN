import React, { useMemo } from 'react'
import { Sparkles, ChevronRight, Church } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { getLiturgicalDay } from '../../utils/liturgicalEngine'
import { LITURGICAL_COLORS } from '../../constants/liturgical'

/**
 * Card Lịch Phụng Vụ hôm nay — Trang Tổng Quan desktop.
 * Redesign 2026-08-22: đồng bộ ngôn ngữ thiết kế với MobileLiturgicalWidget —
 * color spine theo màu áo lễ + date tile kiểu app lịch; giữ nguyên contract
 * (title / season-cycle / CTA "Xem Lịch Phụng Vụ").
 */
export const LiturgicalTodayWidget: React.FC = () => {
  const navigate = useNavigate()
  const now = useMemo(() => new Date(), [])
  const today = useMemo(() => getLiturgicalDay(now), [now])
  const colorMeta = LITURGICAL_COLORS[today.color] || LITURGICAL_COLORS.GREEN

  const dayNumber = now.getDate()
  const monthShort = now.toLocaleDateString('vi-VN', { month: 'short' }).replace('Tháng', 'T')
  const weekdayLong = now.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="bg-surface-card rounded-2xl border border-surface-border shadow-card relative overflow-hidden group hover:border-parish-primary/40 transition-all flex items-stretch">
      {/* Color spine — màu áo lễ của ngày */}
      <div
        aria-hidden="true"
        className="w-1.5 shrink-0"
        style={{ backgroundColor: colorMeta.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}
      />

      <div className="flex-1 min-w-0 p-5">
        {/* Header: date tile + identity + badges */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`shrink-0 w-14 rounded-2xl border text-center py-1.5 ${colorMeta.bgClass} ${colorMeta.borderClass}`}>
              <div className={`text-2xl font-black leading-none ${colorMeta.textClass}`}>{dayNumber}</div>
              <div className={`text-[10px] font-extrabold uppercase leading-none mt-1 ${colorMeta.textClass}`}>{monthShort}</div>
            </div>

            <div className="min-w-0">
              <span className="text-[11px] font-bold text-text-muted capitalize block leading-none">{weekdayLong}</span>
              <span className="text-xs font-extrabold text-text-secondary block mt-1">
                {today.seasonName} • Năm {today.sundayCycle || 'A'}
              </span>
              <h3 className="typography-section-title text-text-main m-0 leading-snug mt-1.5 group-hover:text-parish-primary transition-colors">
                {today.title}
              </h3>
              {today.subTitle && (
                <p className="text-xs text-text-muted mt-0.5 m-0 font-medium">{today.subTitle}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 ${colorMeta.bgClass} ${colorMeta.textClass} ${colorMeta.borderClass}`}>
              <span
                className="w-2 h-2 rounded-full ring-1 ring-black/10"
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

        {/* Gospel verse */}
        {today.readings?.gospelVerse && (
          <div className="bg-surface-app p-3 rounded-xl border border-surface-border flex items-start gap-2">
            <Sparkles size={15} className="text-parish-warning shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs italic text-text-secondary m-0 leading-relaxed font-medium line-clamp-2">
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

        {/* Footer */}
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
    </div>
  )
}
