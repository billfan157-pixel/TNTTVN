import React, { useState, useMemo } from 'react'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Church,
  Clock,
  MapPin,
  Download,
  ExternalLink,
} from 'lucide-react'
import {
  getLiturgicalDay,
  getLiturgicalMonthDays,
  getUpcomingSolemnities,
} from '../../utils/liturgicalEngine'
import {
  generateLiturgicalIcs,
  downloadIcsFile,
  buildGoogleCalendarUrl,
} from '../../utils/icalGenerator'
import { LITURGICAL_COLORS } from '../../constants/liturgical'
import type { LiturgicalDay, ParishEvent } from '../../types/liturgical'

export const MobileCalendarView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDay, setSelectedDay] = useState<LiturgicalDay>(getLiturgicalDay(new Date()))
  const [parishEvents] = useState<ParishEvent[]>([])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const monthDays = useMemo(() => {
    return getLiturgicalMonthDays(year, month)
  }, [year, month])

  const upcomingSolemnities = useMemo(() => {
    return getUpcomingSolemnities(new Date(), 3)
  }, [])

  const firstDayOfWeek = useMemo(() => {
    const firstDate = new Date(year, month - 1, 1)
    return firstDate.getDay()
  }, [year, month])

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month, 1))
  }

  const handleToday = () => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDay(getLiturgicalDay(today))
  }

  const selectedDayColorMeta = LITURGICAL_COLORS[selectedDay.color] || LITURGICAL_COLORS.GREEN

  const selectedDayParishEvents = useMemo(() => {
    return parishEvents.filter((e) => e.date === selectedDay.date)
  }, [parishEvents, selectedDay.date])

  const dayHeaders = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

  return (
    <div className="mobile-screen mobile-screen--stack">
      {/* Top Header & Month Switcher */}
      <div className="bg-surface-card p-3 rounded-2xl border border-surface-border shadow-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-parish-primary/10 text-parish-primary flex items-center justify-center font-bold">
            <CalendarIcon size={16} />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-parish-primary m-0">Lịch Phụng Vụ</h3>
            <span className="text-[10px] text-text-muted">HĐGMVN Standard</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const icsString = generateLiturgicalIcs(monthDays, parishEvents, {
                calendarName: `Lịch Phụng Vụ T${month}/${year} - TNTT`,
                parishName: 'Giáo Xứ Gia Tôn',
              })
              downloadIcsFile(icsString, `lich-phung-vu-T${month}-${year}.ics`)
            }}
            className="btn btn-primary text-xs font-bold p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl shadow-xs"
            title="Tải lịch tháng này (.ics)"
          >
            <Download size={13} />
          </button>

          <div className="flex items-center gap-1 bg-surface-app rounded-xl border border-surface-border p-1">
            {/* Polish 2026-08-22: wire nút "Hôm nay" (trước đây handleToday dead-code) */}
            <button
              onClick={handleToday}
              className="px-2 min-h-[44px] rounded-lg text-xs font-bold text-text-secondary hover:text-parish-primary bg-transparent border-none cursor-pointer"
              title="Về tháng hiện tại"
            >
              Hôm nay
            </button>
            <button
              onClick={handlePrevMonth}
              className="p-1 min-h-[44px] min-w-[44px] rounded-lg text-text-muted hover:text-text-main bg-transparent border-none cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-text-main px-1 min-w-[65px] text-center">
              {month}/{year}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1 min-h-[44px] min-w-[44px] rounded-lg text-text-muted hover:text-text-main bg-transparent border-none cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Month Grid */}
      <div className="bg-surface-card rounded-2xl border border-surface-border shadow-xs p-3 flex flex-col gap-2">
        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 gap-1 text-center pb-1 border-b border-surface-border text-[11px] font-extrabold text-text-muted">
          {dayHeaders.map((dh, idx) => (
            <div key={dh} className={idx === 0 ? 'text-rose-600' : ''}>
              {dh}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="h-11 rounded-lg bg-surface-app/30 opacity-30" />
          ))}

          {monthDays.map((dayItem) => {
            const isSelected = selectedDay.date === dayItem.date
            const isToday = dayItem.date === getLiturgicalDay(new Date()).date
            const colorMeta = LITURGICAL_COLORS[dayItem.color] || LITURGICAL_COLORS.GREEN
            const dayNum = parseInt(dayItem.date.split('-')[2], 10)

            return (
              <button
                key={dayItem.date}
                type="button"
                onClick={() => setSelectedDay(dayItem)}
                className={`h-11 rounded-xl border flex flex-col items-center justify-between p-1 transition-all relative ${
                  isSelected
                    ? 'border-parish-primary bg-parish-primary-light/60 ring-2 ring-parish-primary/30 font-black'
                    : 'border-surface-border bg-surface-card'
                } ${isToday ? 'ring-1 ring-parish-primary' : ''}`}
              >
                <span
                  className={`text-xs ${
                    isToday
                      ? 'bg-parish-primary text-white rounded-md w-5 h-4 flex items-center justify-center font-bold text-[11px]'
                      : dayItem.isSunday
                      ? 'text-rose-600 font-extrabold'
                      : 'text-text-main font-semibold'
                  }`}
                >
                  {dayNum}
                </span>

                <span
                  className="w-2 h-2 rounded-full border border-black/10"
                  style={{ backgroundColor: colorMeta.hex }}
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected Day Detail Card */}
      <div className="bg-surface-card rounded-2xl border border-surface-border shadow-xs p-4 flex flex-col gap-3 relative overflow-hidden">
        <div
          className="absolute top-0 right-0 w-28 h-28 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none opacity-20"
          style={{ backgroundColor: selectedDayColorMeta.hex }}
        />

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-text-muted">
            {new Date(selectedDay.date).toLocaleDateString('vi-VN', {
              weekday: 'long',
              day: 'numeric',
              month: 'numeric',
            })}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${selectedDayColorMeta.bgClass} ${selectedDayColorMeta.textClass} ${selectedDayColorMeta.borderClass}`}
          >
            {selectedDay.rankName}
          </span>
        </div>

        <div>
          <h4 className="text-base font-extrabold text-text-main m-0 leading-tight">
            {selectedDay.title}
          </h4>
          {selectedDay.subTitle && (
            <p className="text-xs text-text-muted mt-1 m-0">{selectedDay.subTitle}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 bg-surface-app p-2.5 rounded-xl border border-surface-border text-xs">
          <div>
            <span className="text-text-muted text-[10px] font-bold uppercase block">Mùa Phụng Vụ</span>
            <strong className="text-text-main">{selectedDay.seasonName}</strong>
          </div>
          <div>
            <span className="text-text-muted text-[10px] font-bold uppercase block">Áo Lễ</span>
            <strong className={`${selectedDayColorMeta.textClass} flex items-center gap-1`}>
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: selectedDayColorMeta.hex }}
              />
              {selectedDay.colorName}
            </strong>
          </div>
        </div>

        {selectedDay.readings?.gospelVerse && (
          <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl flex items-start gap-1.5 text-xs text-text-main">
            <Sparkles size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="italic m-0 leading-relaxed font-medium">"{selectedDay.readings.gospelVerse}"</p>
              {selectedDay.readings.gospel && (
                <span className="text-[10px] font-bold text-parish-primary mt-1 block">
                  — {selectedDay.readings.gospel}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Quick Google Calendar button */}
        <div className="pt-2 border-t border-surface-border">
          <button
            type="button"
            onClick={() => {
              const url = buildGoogleCalendarUrl({
                title: `${selectedDay.title} (${selectedDay.rankName} - Áo ${selectedDay.colorName})`,
                date: selectedDay.date,
                description: `${selectedDay.seasonName} • Bậc lễ: ${selectedDay.rankName}\n${selectedDay.readings?.gospelVerse ? `Lời Chúa: "${selectedDay.readings.gospelVerse}"` : ''}`,
                location: 'Giáo Xứ Gia Tôn',
              })
              window.open(url, '_blank')
            }}
            className="btn btn-secondary text-xs font-bold w-full flex items-center justify-center gap-1.5 py-2"
          >
            <ExternalLink size={12} />
            <span>Thêm Vào Google Calendar</span>
          </button>
        </div>
      </div>

      {/* Parish events for the selected day — chỉ render khi có dữ liệu (events API chưa wire) */}
      {selectedDayParishEvents.length > 0 && (
        <div className="bg-surface-card rounded-2xl border border-surface-border shadow-xs p-4 flex flex-col gap-2">
          <h5 className="text-xs font-extrabold text-text-secondary uppercase tracking-wider m-0 flex items-center gap-1.5">
            <CalendarIcon size={13} className="text-parish-primary" /> Sự Kiện Xứ Đoàn
          </h5>
          <div className="flex flex-col gap-1.5">
            {selectedDayParishEvents.map((ev) => (
              <div key={ev.id} className="p-2 rounded-xl bg-surface-app border border-surface-border text-xs">
                <span className="font-bold text-text-main">{ev.title}</span>
                {ev.time && (
                  <span className="text-text-muted ml-1.5 inline-flex items-center gap-0.5">
                    <Clock size={10} /> {ev.time}
                  </span>
                )}
                {ev.location && (
                  <div className="text-text-muted mt-0.5 inline-flex items-center gap-0.5">
                    <MapPin size={10} /> {ev.location}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Solemnities Quick List */}
      <div className="bg-surface-card rounded-2xl border border-surface-border shadow-xs p-4 flex flex-col gap-2">
        <h5 className="text-xs font-extrabold text-text-secondary uppercase tracking-wider m-0 flex items-center gap-1.5">
          <Church size={13} className="text-parish-primary" /> Lễ Trọng Sắp Tới
        </h5>

        <div className="flex flex-col gap-1.5">
          {upcomingSolemnities.map((sol) => (
            <div
              key={sol.date}
              onClick={() => {
                setSelectedDay(sol)
                setCurrentDate(new Date(sol.date))
              }}
              className="p-2 rounded-xl bg-surface-app border border-surface-border flex items-center justify-between text-xs"
            >
              <div>
                <strong className="text-text-main block">{sol.title}</strong>
                <span className="text-[10px] text-text-muted">
                  {new Date(sol.date).toLocaleDateString('vi-VN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'numeric',
                  })}
                </span>
              </div>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: (LITURGICAL_COLORS[sol.color] || LITURGICAL_COLORS.WHITE).hex }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
