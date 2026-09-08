import React, { useMemo } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { getLiturgicalDay } from '../../utils/liturgicalEngine'
import { LITURGICAL_COLORS } from '../../constants/liturgical'

interface MobileLiturgicalWidgetProps {
  onOpenCalendar?: () => void
}

/**
 * Card Lịch Phụng Vụ hôm nay — Trang Tổng Quan mobile.
 * Redesign 2026-08-22: date tile kiểu app lịch + color spine theo màu áo lễ
 * (nhận diện tức thì, trắng vẫn thấy nhờ inset ring), phân cấp rõ
 * ngày → tên lễ → mùa/bậc; toàn bộ màu nền/chữ qua token class có dark variant.
 */
export const MobileLiturgicalWidget: React.FC<MobileLiturgicalWidgetProps> = ({ onOpenCalendar }) => {
  const now = useMemo(() => new Date(), [])
  const today = useMemo(() => getLiturgicalDay(now), [now])
  const colorMeta = LITURGICAL_COLORS[today.color] || LITURGICAL_COLORS.GREEN

  const dayNumber = now.getDate()
  const monthShort = now.toLocaleDateString('vi-VN', { month: 'short' }).replace('Tháng', 'T')
  const weekdayLong = now.toLocaleDateString('vi-VN', { weekday: 'long' })

  return (
    <button
      type="button"
      onClick={onOpenCalendar}
      className="entity-card app-panel--interactive w-full text-left relative overflow-hidden flex items-stretch cursor-pointer font-sans"
      aria-label={`Mở lịch phụng vụ: ${today.title}`}
    >
      {/* Color spine — màu áo lễ của ngày */}
      <div
        aria-hidden="true"
        className="w-1.5 shrink-0"
        style={{ backgroundColor: colorMeta.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}
      />

      <div className="flex-1 min-w-0 p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          {/* Date tile kiểu icon app lịch */}
          <div className={`shrink-0 w-11 rounded-xl border text-center py-1 ${colorMeta.bgClass} ${colorMeta.borderClass}`}>
            <div className={`text-lg font-black leading-none ${colorMeta.textClass}`}>{dayNumber}</div>
            <div className={`text-[10px] font-extrabold uppercase leading-none mt-0.5 ${colorMeta.textClass}`}>{monthShort}</div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-text-muted capitalize leading-none">{weekdayLong}</div>
            <h4 className="text-sm font-extrabold text-text-main m-0 leading-snug mt-1 line-clamp-2">
              {today.title}
            </h4>
          </div>

          <ChevronRight size={16} className="text-text-muted shrink-0 self-center" />
        </div>

        {/* Meta row: bậc lễ + mùa (+ lễ buộc) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border flex items-center gap-1 ${colorMeta.bgClass} ${colorMeta.textClass} ${colorMeta.borderClass}`}>
            <span className="w-1.5 h-1.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: colorMeta.hex }} />
            <span>{today.rankName}</span>
          </span>
          <span className="text-[10px] font-bold text-text-secondary">{today.seasonName}</span>
          {today.isHolyDayOfObligation && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide badge-danger">Lễ buộc</span>
          )}
        </div>

        {today.readings?.gospelVerse && (
          <div className="bg-surface-app px-2.5 py-1.5 rounded-lg border border-surface-border flex items-start gap-1.5 text-xs italic text-text-secondary font-medium">
            <Sparkles size={12} className="text-parish-warning shrink-0 mt-0.5" />
            <span className="line-clamp-2 leading-relaxed min-w-0">"{today.readings.gospelVerse}"</span>
          </div>
        )}
      </div>
    </button>
  )
}
