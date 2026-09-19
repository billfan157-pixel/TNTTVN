import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
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
  ClipboardList,
} from 'lucide-react'
import { useParishEventStore } from '../../stores/parishEventStore'
import { useAuthStore } from '../../stores/authStore'
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
import type { LiturgicalDay } from '../../types/liturgical'
import { SubpageHeader } from '../common/SubpageHeader'

export const MobileCalendarView: React.FC = () => {
  const navigate = useNavigate()
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDay, setSelectedDay] = useState<LiturgicalDay>(getLiturgicalDay(new Date()))
  const { events: parishEvents, fetchEvents } = useParishEventStore()
  const role = useAuthStore(state => state.user?.role)

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

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

  const isCurrentMonth = useMemo(() => {
    const now = new Date()
    return now.getFullYear() === year && now.getMonth() + 1 === month
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

  const handleDownloadIcs = () => {
    const icsString = generateLiturgicalIcs(monthDays, parishEvents as any, {
      calendarName: `Lịch Phụng Vụ T${month}/${year} - TNTT`,
      parishName: 'Giáo Xứ Gia Tôn',
    })
    downloadIcsFile(icsString, `lich-phung-vu-T${month}-${year}.ics`)
  }

  const selectedDayColorMeta = LITURGICAL_COLORS[selectedDay.color] || LITURGICAL_COLORS.GREEN

  const selectedDayParishEvents = useMemo(() => {
    return parishEvents.filter((e) => e.date === selectedDay.date)
  }, [parishEvents, selectedDay.date])

  const dayHeaders = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

  return (
    <div className="mobile-screen mobile-screen--stack product-view">
      {/* Top Header & Month Switcher — Standard SubpageHeader single-row layout */}
      <SubpageHeader
        className="mobile-calendar-header"
        icon={<CalendarIcon size={16} aria-hidden="true" />}
        title={`Tháng ${month}, ${year}`}
        meta={
          <span className="truncate">
            {selectedDay.seasonName ? `${selectedDay.seasonName} · HĐGMVN` : 'Lịch Phụng Vụ HĐGMVN'}
          </span>
        }
        actions={
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Về tháng trước"
              data-compact-touch
              className="subpage-header__btn subpage-header__btn--secondary subpage-header__btn--icon-only"
              title="Tháng trước"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleToday}
              data-compact-touch
              className={`subpage-header__btn px-2 ${
                isCurrentMonth
                  ? 'subpage-header__btn--secondary text-text-muted opacity-70'
                  : 'subpage-header__btn--primary font-bold'
              }`}
              title="Về tháng hiện tại"
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Sang tháng tiếp theo"
              data-compact-touch
              className="subpage-header__btn subpage-header__btn--secondary subpage-header__btn--icon-only"
              title="Tháng sau"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={handleDownloadIcs}
              data-compact-touch
              className="subpage-header__btn subpage-header__btn--secondary subpage-header__btn--icon-only"
              aria-label="Tải lịch tháng này (.ics)"
              title="Tải lịch tháng này (.ics)"
            >
              <Download size={14} />
            </button>
          </div>
        }
      />

      {/* Calendar Month Grid */}
      <div className="app-panel p-3 flex flex-col gap-2">
        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 gap-1 text-center pb-1 border-b border-surface-border text-[11px] font-extrabold text-text-muted">
          {dayHeaders.map((dh, idx) => (
            <div key={dh} className={idx === 0 ? 'text-rose-600 dark:text-rose-400' : ''}>
              {dh}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="h-10 rounded-lg bg-surface-app/30 opacity-30" />
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
                aria-label={`Ngày ${dayNum}${dayItem.title ? `, ${dayItem.title}` : ''}${isToday ? ' (Hôm nay)' : ''}`}
                aria-pressed={isSelected}
                data-compact-touch
                className={`min-h-[44px] h-11 rounded-xl border flex flex-col items-center justify-between p-1 transition-all relative touch-manipulation active:scale-[0.97] ${
                  isSelected
                    ? 'border-parish-primary bg-parish-primary-light/60 ring-2 ring-parish-primary/30 font-black'
                    : 'border-surface-border bg-surface-card hover:bg-surface-hover'
                } ${isToday ? 'ring-1 ring-parish-primary' : ''}`}
              >
                <span
                  className={`text-xs ${
                    isToday
                      ? 'bg-parish-primary text-white rounded-md w-5 h-4 flex items-center justify-center font-bold text-[11px]'
                      : dayItem.isSunday
                      ? 'text-rose-600 dark:text-rose-400 font-extrabold'
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
      <div className="app-panel p-4 flex flex-col gap-3 relative overflow-hidden">
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
              window.open(url, '_blank', 'noopener,noreferrer')
            }}
            className="btn btn-secondary text-xs font-bold w-full flex items-center justify-center gap-1.5 py-2"
          >
            <ExternalLink size={12} />
            <span>Thêm Vào Google Calendar</span>
          </button>
        </div>
      </div>

      {/* Parish events for the selected day — server persistence + mobile bottom-sheet */}
      <div className="app-panel p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-extrabold text-text-secondary uppercase tracking-wider m-0 flex items-center gap-1.5">
            <CalendarIcon size={13} className="text-parish-primary" /> Sự Kiện Xứ Đoàn ({selectedDayParishEvents.length})
          </h5>
        </div>
        {selectedDayParishEvents.length === 0 ? (
          <div className="py-3 px-3 text-center rounded-xl bg-surface-app border border-surface-border text-xs text-text-muted">
            Chưa có sự kiện Xứ đoàn trong ngày này.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {selectedDayParishEvents.map((ev) => (
              <div key={ev.id} className="p-2.5 rounded-xl bg-surface-app border border-surface-border text-xs flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-text-main flex-1 truncate">{ev.title}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">{ev.categoryName || ev.category}</span>
                    {role !== 'phuhuynh' && (
                      <button
                        onClick={() => navigate({ to: '/operations' })}
                        className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-surface-card text-text-muted hover:text-parish-primary"
                        aria-label="Tổ chức công việc"
                        title="Tổ chức & điều phối công việc cho sự kiện này"
                      >
                        <ClipboardList size={14} />
                      </button>
                    )}
                  </span>
                </div>
                {(ev.time || ev.location) && (
                  <div className="flex items-center gap-3 text-text-muted text-[11px]">
                    {ev.time && <span className="inline-flex items-center gap-1"><Clock size={10} /> {ev.time}</span>}
                    {ev.location && <span className="inline-flex items-center gap-1"><MapPin size={10} /> {ev.location}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Solemnities Quick List */}
      <div className="app-panel p-4 flex flex-col gap-2">
        <h5 className="text-xs font-extrabold text-text-secondary uppercase tracking-wider m-0 flex items-center gap-1.5">
          <Church size={13} className="text-parish-primary" /> Lễ Trọng Sắp Tới
        </h5>

        <div className="flex flex-col gap-1.5">
          {upcomingSolemnities.map((sol) => (
            <button
              key={sol.date}
              type="button"
              onClick={() => {
                setSelectedDay(sol)
                setCurrentDate(new Date(sol.date))
              }}
              className="w-full text-left p-2.5 rounded-xl bg-surface-app border border-surface-border flex items-center justify-between text-xs hover:bg-surface-hover transition-colors min-h-[44px]"
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
                className="w-2.5 h-2.5 rounded-full shrink-0 ml-2"
                style={{ backgroundColor: (LITURGICAL_COLORS[sol.color] || LITURGICAL_COLORS.WHITE).hex }}
              />
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
