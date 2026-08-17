import React, { useMemo } from 'react'
import { Calendar as CalendarIcon, Sparkles, ChevronRight, Church } from 'lucide-react'
import { getLiturgicalDay } from '../../utils/liturgicalEngine'
import { LITURGICAL_COLORS } from '../../constants/liturgical'

interface MobileLiturgicalWidgetProps {
  onOpenCalendar?: () => void
}

export const MobileLiturgicalWidget: React.FC<MobileLiturgicalWidgetProps> = ({ onOpenCalendar }) => {
  const today = useMemo(() => getLiturgicalDay(new Date()), [])
  const colorMeta = LITURGICAL_COLORS[today.color] || LITURGICAL_COLORS.GREEN

  const todayFormatted = useMemo(() => {
    const d = new Date()
    return d.toLocaleDateString('vi-VN', {
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
    })
  }, [])

  return (
    <div
      onClick={onOpenCalendar}
      className="bg-surface-card rounded-2xl border border-surface-border p-3.5 shadow-card relative overflow-hidden flex flex-col gap-2 cursor-pointer active:scale-[0.99] transition-all"
    >
      {/* Background Glow */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none opacity-20"
        style={{ backgroundColor: colorMeta.hex }}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-lg bg-parish-primary/10 text-parish-primary flex items-center justify-center font-bold">
            <CalendarIcon size={13} />
          </div>
          <span className="text-xs font-bold text-text-muted capitalize">{todayFormatted}</span>
          <span className="text-[10px] font-extrabold text-text-secondary">
            • {today.seasonName}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${colorMeta.bgClass} ${colorMeta.textClass} ${colorMeta.borderClass}`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: colorMeta.hex }}
            />
            <span>{today.rankName}</span>
          </span>
          <ChevronRight size={14} className="text-text-muted" />
        </div>
      </div>

      <div className="mt-0.5">
        <h4 className="text-sm font-extrabold text-text-main m-0 leading-tight">
          {today.title}
        </h4>
        {today.subTitle && (
          <p className="text-[11px] text-text-muted mt-0.5 m-0 font-medium">{today.subTitle}</p>
        )}
      </div>

      {today.readings?.gospelVerse && (
        <div className="bg-surface-app p-2 rounded-xl border border-surface-border flex items-start gap-1.5 text-xs italic text-text-secondary font-medium">
          <Sparkles size={13} className="text-amber-500 shrink-0 mt-0.5" />
          <span className="line-clamp-2 leading-relaxed">"{today.readings.gospelVerse}"</span>
        </div>
      )}
    </div>
  )
}
