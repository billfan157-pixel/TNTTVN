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
  CalendarDays,
  Share2,
  Check,
  Info,
  CalendarCheck,
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
import { ModalShell } from '../common/ModalShell'
import { EmptyState } from '../common/StateFeedback'
import { SegmentedControl, FilterChips, type SelectionItem } from '../common/ui/SelectionControls'
import { hapticFeedback } from '../../utils/haptics'

type CalendarMobileViewMode = 'grid' | 'agenda' | 'solemnities'
type AgendaFilterType = 'all' | 'solemnities' | 'events'

export const MobileCalendarView: React.FC = () => {
  const navigate = useNavigate()
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDay, setSelectedDay] = useState<LiturgicalDay>(getLiturgicalDay(new Date()))
  const [viewMode, setViewMode] = useState<CalendarMobileViewMode>('grid')
  const [agendaFilter, setAgendaFilter] = useState<AgendaFilterType>('all')
  const [showExportModal, setShowExportModal] = useState<boolean>(false)
  const [exportScope, setExportScope] = useState<'month' | 'year' | 'solemnity_only'>('month')
  const [copiedShare, setCopiedShare] = useState<boolean>(false)

  const { events: parishEvents, fetchEvents } = useParishEventStore()
  const role = useAuthStore((state) => state.user?.role)

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const monthDays = useMemo(() => {
    return getLiturgicalMonthDays(year, month)
  }, [year, month])

  const upcomingSolemnities = useMemo(() => {
    return getUpcomingSolemnities(new Date(), 6)
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
    hapticFeedback.light()
    setCurrentDate(new Date(year, month - 2, 1))
  }

  const handleNextMonth = () => {
    hapticFeedback.light()
    setCurrentDate(new Date(year, month, 1))
  }

  const handleToday = () => {
    hapticFeedback.light()
    const today = new Date()
    setCurrentDate(today)
    setSelectedDay(getLiturgicalDay(today))
  }

  const handleSelectDay = (dayItem: LiturgicalDay) => {
    hapticFeedback.light()
    setSelectedDay(dayItem)
  }

  const handleExportIcs = () => {
    hapticFeedback.medium()
    let daysToExport: LiturgicalDay[] = []
    let filename = `lich-phung-vu-thang-${month}-${year}.ics`

    if (exportScope === 'month') {
      daysToExport = monthDays
      filename = `lich-phung-vu-thang-${month}-${year}.ics`
    } else if (exportScope === 'solemnity_only') {
      const allYearDays: LiturgicalDay[] = []
      for (let m = 1; m <= 12; m++) {
        allYearDays.push(...getLiturgicalMonthDays(year, m))
      }
      daysToExport = allYearDays.filter((d) => d.rank === 'SOLEMNITY' || d.isHolyDayOfObligation)
      filename = `lich-phung-vu-le-trong-${year}.ics`
    } else {
      const allYearDays: LiturgicalDay[] = []
      for (let m = 1; m <= 12; m++) {
        allYearDays.push(...getLiturgicalMonthDays(year, m))
      }
      daysToExport = allYearDays
      filename = `lich-phung-vu-${year}.ics`
    }

    const icsString = generateLiturgicalIcs(daysToExport, parishEvents as any, {
      calendarName: `Lịch Phụng Vụ ${exportScope === 'month' ? `T${month}/${year}` : year} - TNTT`,
      parishName: 'Giáo Xứ Gia Tôn',
    })

    downloadIcsFile(icsString, filename)
    setShowExportModal(false)
  }

  const handleShareDay = async () => {
    hapticFeedback.light()
    const readingSnippet = selectedDay.readings?.gospelVerse ? `\nLời Chúa: "${selectedDay.readings.gospelVerse}"` : ''
    const shareText = `${selectedDay.title} (${selectedDay.rankName} - Áo ${selectedDay.colorName})\n${selectedDay.seasonName} • Năm ${selectedDay.sundayCycle || 'A'}${readingSnippet}\nGiáo xứ Gia Tôn - TNTTVN`

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: selectedDay.title,
          text: shareText,
        })
        return
      } catch {
        // Fallback to clipboard if user cancels or share fails
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareText)
      setCopiedShare(true)
      setTimeout(() => setCopiedShare(false), 2500)
    }
  }

  const handleOpenGoogleCalendarForSelected = () => {
    hapticFeedback.light()
    const url = buildGoogleCalendarUrl({
      title: `${selectedDay.title} (${selectedDay.rankName} - Áo ${selectedDay.colorName})`,
      date: selectedDay.date,
      description: `${selectedDay.seasonName} • Bậc lễ: ${selectedDay.rankName}\n${selectedDay.readings?.gospelVerse ? `Lời Chúa: "${selectedDay.readings.gospelVerse}"` : ''}`,
      location: 'Giáo Xứ Gia Tôn',
    })
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const selectedDayColorMeta = LITURGICAL_COLORS[selectedDay.color] || LITURGICAL_COLORS.GREEN

  const selectedDayParishEvents = useMemo(() => {
    return parishEvents.filter((e) => e.date === selectedDay.date)
  }, [parishEvents, selectedDay.date])

  const filteredAgendaDays = useMemo(() => {
    return monthDays.filter((dayItem) => {
      if (agendaFilter === 'solemnities') {
        return dayItem.rank === 'SOLEMNITY' || dayItem.isHolyDayOfObligation
      }
      if (agendaFilter === 'events') {
        return parishEvents.some((e) => e.date === dayItem.date)
      }
      return true
    })
  }, [monthDays, agendaFilter, parishEvents])

  const dayHeaders = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

  const viewModeItems: ReadonlyArray<SelectionItem<CalendarMobileViewMode>> = [
    { value: 'grid', label: 'Lịch Tháng', icon: <CalendarIcon size={14} className="shrink-0" /> },
    { value: 'agenda', label: 'Lịch Trình', icon: <CalendarDays size={14} className="shrink-0" /> },
    { value: 'solemnities', label: 'Lễ Trọng', icon: <Church size={14} className="shrink-0" /> },
  ]

  const agendaFilterItems: ReadonlyArray<SelectionItem<AgendaFilterType>> = [
    { value: 'all', label: 'Tất cả' },
    { value: 'solemnities', label: 'Lễ Trọng & Buộc' },
    { value: 'events', label: 'Sự kiện xứ đoàn' },
  ]

  return (
    <div className="mobile-screen mobile-screen--stack product-view">
      {/* Subpage Header with Title & Quick Action */}
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
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToday}
              data-compact-touch
              className={`subpage-header__btn px-2.5 min-h-[44px] ${
                isCurrentMonth
                  ? 'subpage-header__btn--secondary text-text-muted opacity-80'
                  : 'subpage-header__btn--primary font-bold'
              }`}
              title="Về ngày hôm nay"
              aria-label="Về ngày hôm nay"
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => {
                hapticFeedback.light()
                setShowExportModal(true)
              }}
              data-compact-touch
              className="subpage-header__btn subpage-header__btn--secondary subpage-header__btn--icon-only min-h-[44px] min-w-[44px]"
              aria-label="Đồng bộ và xuất lịch"
              title="Đồng bộ & xuất file lịch (.ics)"
            >
              <Download size={16} />
            </button>
          </div>
        }
      />

      {/* Month Switcher Toolbar */}
      <div className="app-panel p-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handlePrevMonth}
          aria-label="Về tháng trước"
          data-compact-touch
          className="btn btn-secondary min-h-[44px] min-w-[44px] p-2 flex items-center justify-center shrink-0"
          title="Tháng trước"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="text-center min-w-0 flex-1">
          <span className="typography-card-title block truncate">
            Tháng {month} năm {year}
          </span>
          <span className="typography-caption text-parish-primary block truncate">
            {selectedDay.seasonName} • Năm {selectedDay.sundayCycle || 'A'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          aria-label="Sang tháng sau"
          data-compact-touch
          className="btn btn-secondary min-h-[44px] min-w-[44px] p-2 flex items-center justify-center shrink-0"
          title="Tháng sau"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* View Mode Segmented Control */}
      <div className="px-0.5">
        <SegmentedControl
          id="calendar-mobile-view-tabs"
          ariaLabel="Chế độ xem lịch phụng vụ"
          items={viewModeItems}
          value={viewMode}
          onValueChange={(val) => {
            hapticFeedback.light()
            setViewMode(val)
          }}
        />
      </div>

      {/* VIEW 1: MONTH GRID VIEW */}
      {viewMode === 'grid' && (
        <>
          {/* Calendar Month Grid Panel */}
          <div className="app-panel p-3 flex flex-col gap-2">
            {/* Day of Week Headers */}
            <div className="grid grid-cols-7 gap-1 text-center pb-1 border-b border-surface-border typography-caption font-extrabold text-text-muted">
              {dayHeaders.map((dh, idx) => (
                <div key={dh} className={idx === 0 ? 'text-rose-600 dark:text-rose-400 font-black' : ''}>
                  {dh}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[44px] h-11 rounded-xl bg-surface-app/30 opacity-30" />
              ))}

              {monthDays.map((dayItem) => {
                const isSelected = selectedDay.date === dayItem.date
                const isToday = dayItem.date === getLiturgicalDay(new Date()).date
                const colorMeta = LITURGICAL_COLORS[dayItem.color] || LITURGICAL_COLORS.GREEN
                const dayNum = parseInt(dayItem.date.split('-')[2], 10)
                const hasParishEvent = parishEvents.some((e) => e.date === dayItem.date)
                const isSolemnity = dayItem.rank === 'SOLEMNITY'

                return (
                  <button
                    key={dayItem.date}
                    type="button"
                    onClick={() => handleSelectDay(dayItem)}
                    aria-label={`Ngày ${dayNum}${dayItem.title ? `, ${dayItem.title}` : ''}${isToday ? ' (Hôm nay)' : ''}${hasParishEvent ? ' (Có sự kiện xứ đoàn)' : ''}`}
                    aria-pressed={isSelected}
                    data-compact-touch
                    className={`min-h-[44px] h-11 rounded-xl border flex flex-col items-center justify-between p-1 transition-colors relative touch-manipulation active:scale-[0.97] ${
                      isSelected
                        ? 'border-parish-primary bg-parish-primary-light/60 ring-2 ring-parish-primary/40 font-black shadow-xs'
                        : 'border-surface-border bg-surface-card hover:bg-surface-hover'
                    } ${isToday ? 'ring-1 ring-parish-primary' : ''}`}
                  >
                    <span
                      className={`text-xs ${
                        isToday
                          ? 'bg-parish-primary text-white rounded-md w-5 h-4 flex items-center justify-center font-bold'
                          : dayItem.isSunday
                          ? 'text-rose-600 dark:text-rose-400 font-extrabold'
                          : isSolemnity
                          ? 'text-parish-primary font-black'
                          : 'text-text-main font-semibold'
                      }`}
                    >
                      {dayNum}
                    </span>

                    {/* Indicator dots: Color dot + Parish Event Dot */}
                    <div className="flex items-center gap-1">
                      {hasParishEvent && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-amber-600/30"
                          title="Có sự kiện xứ đoàn"
                        />
                      )}
                      <span
                        className="w-2 h-2 rounded-full border border-black/10"
                        style={{ backgroundColor: colorMeta.hex }}
                        title={`Áo lễ: ${dayItem.colorName}`}
                      />
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Liturgical Colors Legend */}
            <div className="pt-2 mt-1 border-t border-surface-border flex items-center justify-between flex-wrap gap-2 text-xs text-text-muted">
              <span className="font-bold text-text-secondary text-[11px]">Màu áo:</span>
              <div className="flex items-center gap-2.5 flex-wrap">
                {Object.entries(LITURGICAL_COLORS).map(([key, c]) => (
                  <div key={key} className="flex items-center gap-1 text-[11px]">
                    <span className="w-2 h-2 rounded-full border border-black/10" style={{ backgroundColor: c.hex }} />
                    <span>{c.name}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>Sự kiện</span>
                </div>
              </div>
            </div>
          </div>

          {/* Selected Day Detail Card */}
          <div className="entity-card app-panel p-4 flex flex-col gap-3 relative overflow-hidden">
            {/* Color spine indicating liturgical vestment color */}
            <div
              aria-hidden="true"
              className="absolute left-0 top-0 bottom-0 w-1.5 pointer-events-none"
              style={{ backgroundColor: selectedDayColorMeta.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}
            />

            <div className="pl-3.5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="typography-label text-text-muted capitalize">
                  {new Date(selectedDay.date).toLocaleDateString('vi-VN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selectedDay.isHolyDayOfObligation && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold leading-none bg-parish-danger-bg text-parish-danger border border-parish-danger/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-parish-danger shrink-0" />
                      <span>Lễ Buộc</span>
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold leading-none border ${selectedDayColorMeta.bgClass} ${selectedDayColorMeta.textClass} ${selectedDayColorMeta.borderClass}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: selectedDayColorMeta.hex }} />
                    <span>{selectedDay.rankName}</span>
                  </span>
                </div>
              </div>

              <div>
                <h4 className="typography-section-title text-text-main m-0 leading-tight">
                  {selectedDay.title}
                </h4>
                {selectedDay.subTitle && (
                  <p className="typography-body-sm text-text-muted mt-1 m-0">{selectedDay.subTitle}</p>
                )}
              </div>

              {/* Liturgical Specification Matrix */}
              <div className="grid grid-cols-2 gap-2 bg-surface-app p-2.5 rounded-xl border border-surface-border text-xs">
                <div>
                  <span className="typography-caption block text-text-muted font-bold">Mùa Phụng Vụ</span>
                  <strong className="text-text-main block mt-0.5">{selectedDay.seasonName}</strong>
                </div>
                <div>
                  <span className="typography-caption block text-text-muted font-bold">Màu Áo Lễ</span>
                  <strong className={`${selectedDayColorMeta.textClass} flex items-center gap-1 mt-0.5`}>
                    <span
                      className="w-2 h-2 rounded-full inline-block border border-black/10"
                      style={{ backgroundColor: selectedDayColorMeta.hex }}
                    />
                    {selectedDay.colorName}
                  </strong>
                </div>
                <div>
                  <span className="typography-caption block text-text-muted font-bold">Chu Kỳ Lời Chúa</span>
                  <strong className="text-text-main block mt-0.5">
                    Năm {selectedDay.sundayCycle || 'A'} {selectedDay.weekdayCycle ? `• Năm ${selectedDay.weekdayCycle}` : ''}
                  </strong>
                </div>
                <div>
                  <span className="typography-caption block text-text-muted font-bold">Quy Chế</span>
                  <strong className="text-text-main block mt-0.5">
                    {selectedDay.isHolyDayOfObligation ? 'Lễ Buộc Tham Dự' : 'Lễ Thường'}
                  </strong>
                </div>
              </div>

              {/* Gospel Reading Quote */}
              {selectedDay.readings?.gospelVerse && (
                <div className="bg-parish-warning-bg border border-parish-warning/30 p-3 rounded-xl flex items-start gap-2 text-xs text-text-main">
                  <Sparkles size={15} className="text-parish-warning shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="typography-caption text-parish-warning font-bold block mb-1">
                      Lời Chúa Hôm Nay
                    </span>
                    <p className="italic m-0 leading-relaxed font-medium">"{selectedDay.readings.gospelVerse}"</p>
                    {selectedDay.readings.gospel && (
                      <span className="typography-caption text-parish-primary mt-1.5 block font-bold">
                        — Phúc Âm: {selectedDay.readings.gospel}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Scripture Readings Checklist */}
              {selectedDay.readings && (selectedDay.readings.firstReading || selectedDay.readings.psalm || selectedDay.readings.secondReading) && (
                <div className="bg-surface-app p-2.5 rounded-xl border border-surface-border text-xs flex flex-col gap-1 text-text-muted">
                  <span className="typography-caption font-bold text-text-secondary">Các bài đọc trong Thánh Lễ:</span>
                  {selectedDay.readings.firstReading && (
                    <div>• <strong>Bài đọc 1:</strong> {selectedDay.readings.firstReading}</div>
                  )}
                  {selectedDay.readings.psalm && (
                    <div>• <strong>Đáp ca:</strong> {selectedDay.readings.psalm}</div>
                  )}
                  {selectedDay.readings.secondReading && (
                    <div>• <strong>Bài đọc 2:</strong> {selectedDay.readings.secondReading}</div>
                  )}
                </div>
              )}

              {/* Action Buttons: Google Calendar + Share */}
              <div className="pt-2 border-t border-surface-border flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenGoogleCalendarForSelected}
                  className="btn btn-secondary text-xs font-bold flex-1 min-h-[44px] flex items-center justify-center gap-1.5"
                  title="Thêm vào Google Calendar"
                >
                  <ExternalLink size={14} />
                  <span>Google Calendar</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareDay}
                  className="btn btn-secondary text-xs font-bold shrink-0 min-h-[44px] min-w-[44px] p-2 flex items-center justify-center gap-1"
                  title="Chia sẻ thông tin phụng vụ"
                  aria-label="Chia sẻ thông tin phụng vụ"
                >
                  {copiedShare ? <Check size={16} className="text-parish-success" /> : <Share2 size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Parish events for the selected day */}
          <div className="app-panel p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h5 className="typography-card-title text-text-secondary m-0 flex items-center gap-1.5">
                <CalendarIcon size={14} className="text-parish-primary" /> Sự Kiện Xứ Đoàn ({selectedDayParishEvents.length})
              </h5>
            </div>

            {selectedDayParishEvents.length === 0 ? (
              <EmptyState
                icon={CalendarIcon}
                title="Chưa có sự kiện xứ đoàn"
                description={`Không có lịch sinh hoạt hay sự kiện đặc biệt trong ngày ${selectedDay.title}.`}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {selectedDayParishEvents.map((ev) => (
                  <div key={ev.id} className="p-3 rounded-xl bg-surface-app border border-surface-border text-xs flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-text-main flex-1 truncate">{ev.title}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <span className="px-2 py-0.5 rounded-full typography-caption font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          {ev.categoryName || ev.category}
                        </span>
                        {role !== 'phuhuynh' && (
                          <button
                            type="button"
                            onClick={() => navigate({ to: '/operations', search: { calendarEvent: ev.id } })}
                            className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface-card text-text-muted hover:text-parish-primary border border-transparent hover:border-surface-border"
                            aria-label="Tổ chức công việc cho sự kiện"
                            title="Tổ chức & điều phối công việc cho sự kiện này"
                          >
                            <ClipboardList size={15} />
                          </button>
                        )}
                      </span>
                    </div>

                    {(ev.time || ev.location) && (
                      <div className="flex items-center gap-3 text-text-muted text-xs">
                        {ev.time && <span className="inline-flex items-center gap-1"><Clock size={12} /> {ev.time}</span>}
                        {ev.location && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {ev.location}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* VIEW 2: AGENDA TIMELINE VIEW */}
      {viewMode === 'agenda' && (
        <div className="flex flex-col gap-3">
          {/* Agenda Filter Chips */}
          <div className="app-panel p-3 flex flex-col gap-2">
            <span className="typography-caption font-bold text-text-secondary">Bộ lọc lịch trình:</span>
            <FilterChips
              ariaLabel="Lọc lịch trình tháng"
              items={agendaFilterItems}
              value={agendaFilter}
              onValueChange={(val) => {
                hapticFeedback.light()
                setAgendaFilter(val)
              }}
              appearance="pills"
            />
          </div>

          {/* Agenda Days Feed */}
          {filteredAgendaDays.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Không có ngày phụng vụ thỏa bộ lọc"
              description="Hãy thử đổi bộ lọc sang 'Tất cả' để xem toàn bộ danh sách ngày trong tháng."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {filteredAgendaDays.map((dayItem) => {
                const colorMeta = LITURGICAL_COLORS[dayItem.color] || LITURGICAL_COLORS.GREEN
                const isSelected = selectedDay.date === dayItem.date
                const isToday = dayItem.date === getLiturgicalDay(new Date()).date
                const dayEvents = parishEvents.filter((e) => e.date === dayItem.date)
                const dayNum = parseInt(dayItem.date.split('-')[2], 10)
                const weekday = new Date(dayItem.date).toLocaleDateString('vi-VN', { weekday: 'short' })

                return (
                  <button
                    key={dayItem.date}
                    type="button"
                    onClick={() => handleSelectDay(dayItem)}
                    className={`entity-card app-panel--interactive w-full text-left p-3 rounded-xl border flex items-start gap-3 min-h-[44px] relative overflow-hidden transition-colors ${
                      isSelected
                        ? 'border-parish-primary bg-parish-primary-light/40 ring-1 ring-parish-primary'
                        : 'border-surface-border bg-surface-card hover:bg-surface-hover'
                    }`}
                  >
                    {/* Liturgical color spine */}
                    <div
                      aria-hidden="true"
                      className="absolute left-0 top-0 bottom-0 w-1.5"
                      style={{ backgroundColor: colorMeta.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}
                    />

                    {/* Date Tile */}
                    <div className={`shrink-0 w-11 rounded-lg border text-center py-1 ${colorMeta.bgClass} ${colorMeta.borderClass}`}>
                      <div className={`text-base font-black leading-none ${colorMeta.textClass}`}>{dayNum}</div>
                      <div className={`typography-caption uppercase mt-0.5 ${colorMeta.textClass}`}>{weekday}</div>
                    </div>

                    {/* Content Details */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="typography-caption text-text-muted">{dayItem.seasonName}</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isToday && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold leading-none bg-parish-primary text-white">
                              Hôm nay
                            </span>
                          )}
                          {dayItem.isHolyDayOfObligation && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold leading-none bg-parish-danger-bg text-parish-danger border border-parish-danger/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-parish-danger shrink-0" />
                              <span>Lễ Buộc</span>
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold leading-none border ${colorMeta.bgClass} ${colorMeta.textClass} ${colorMeta.borderClass}`}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colorMeta.hex }} />
                            <span>{dayItem.rankName}</span>
                          </span>
                        </div>
                      </div>

                      <h4 className="text-sm font-extrabold text-text-main m-0 leading-snug">
                        {dayItem.title}
                      </h4>

                      {dayItem.readings?.gospelVerse && (
                        <p className="typography-body-sm text-text-muted italic m-0 line-clamp-1">
                          "{dayItem.readings.gospelVerse}"
                        </p>
                      )}

                      {dayEvents.length > 0 && (
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {dayEvents.map((ev) => (
                            <span
                              key={ev.id}
                              className="px-2 py-0.5 rounded-md typography-caption font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 flex items-center gap-1"
                            >
                              <CalendarIcon size={10} />
                              <span className="truncate max-w-[180px]">{ev.title}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: SOLEMNITIES LIST VIEW */}
      {viewMode === 'solemnities' && (
        <div className="app-panel p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 pb-2 border-b border-surface-border">
            <Church size={18} className="text-parish-primary" />
            <div>
              <h4 className="typography-card-title text-text-main m-0">Lễ Trọng & Lễ Buộc Sắp Tới</h4>
              <span className="typography-body-sm text-text-muted">Các ngày lễ quan trọng trong năm phụng vụ</span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {upcomingSolemnities.map((sol) => {
              const solColor = LITURGICAL_COLORS[sol.color] || LITURGICAL_COLORS.WHITE
              const solDate = new Date(sol.date)

              return (
                <div
                  key={sol.date}
                  className="p-3.5 rounded-xl bg-surface-app border border-surface-border flex items-center justify-between gap-3 relative overflow-hidden"
                >
                  <div
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 w-1.5"
                    style={{ backgroundColor: solColor.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}
                  />

                  <div className="pl-3.5 flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="typography-caption text-text-muted font-bold">
                        {solDate.toLocaleDateString('vi-VN', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      {sol.isHolyDayOfObligation && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold leading-none bg-parish-danger-bg text-parish-danger border border-parish-danger/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-parish-danger shrink-0" />
                          <span>Lễ Buộc</span>
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold leading-none border ${solColor.bgClass} ${solColor.textClass} ${solColor.borderClass}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: solColor.hex }} />
                        <span>{sol.rankName}</span>
                      </span>
                    </div>
                    <h4 className="text-sm font-extrabold text-text-main m-0 leading-snug">{sol.title}</h4>
                    {sol.readings?.gospelVerse && (
                      <p className="typography-body-sm text-text-muted italic mt-0.5 m-0 line-clamp-1">
                        "{sol.readings.gospelVerse}"
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      hapticFeedback.light()
                      setSelectedDay(sol)
                      setCurrentDate(new Date(sol.date))
                      setViewMode('grid')
                    }}
                    className="btn btn-secondary text-xs font-bold shrink-0 min-h-[44px] px-3.5 flex items-center justify-center gap-1.5 self-center"
                    title="Xem ngày này trên lịch tháng"
                  >
                    <CalendarCheck size={15} />
                    <span>Xem</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Export & Sync Calendar ModalShell */}
      <ModalShell
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Đồng Bộ & Xuất Lịch (.ics)"
        subtitle="Xuất lịch phụng vụ và sự kiện xứ đoàn TNTT"
        icon={<Download size={18} className="text-parish-primary" />}
        mobileDisplay="bottom-sheet"
      >
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="typography-label text-text-secondary">Chọn phạm vi xuất lịch:</span>

            <label className="p-3 rounded-xl border border-surface-border bg-surface-app flex items-center justify-between cursor-pointer min-h-[44px]">
              <div>
                <strong className="text-sm text-text-main block">Tháng {month} / {year}</strong>
                <span className="typography-body-sm text-text-muted">Toàn bộ ngày phụng vụ và sự kiện trong tháng hiện tại</span>
              </div>
              <input
                type="radio"
                name="exportScope"
                value="month"
                checked={exportScope === 'month'}
                onChange={() => setExportScope('month')}
                className="w-5 h-5 text-parish-primary"
              />
            </label>

            <label className="p-3 rounded-xl border border-surface-border bg-surface-app flex items-center justify-between cursor-pointer min-h-[44px]">
              <div>
                <strong className="text-sm text-text-main block">Toàn Bộ Năm {year}</strong>
                <span className="typography-body-sm text-text-muted">Tất cả 12 tháng phụng vụ của năm {year}</span>
              </div>
              <input
                type="radio"
                name="exportScope"
                value="year"
                checked={exportScope === 'year'}
                onChange={() => setExportScope('year')}
                className="w-5 h-5 text-parish-primary"
              />
            </label>

            <label className="p-3 rounded-xl border border-surface-border bg-surface-app flex items-center justify-between cursor-pointer min-h-[44px]">
              <div>
                <strong className="text-sm text-text-main block">Chỉ Lễ Trọng & Lễ Buộc</strong>
                <span className="typography-body-sm text-text-muted">Các ngày lễ trọng thể và lễ buộc trong năm {year}</span>
              </div>
              <input
                type="radio"
                name="exportScope"
                value="solemnity_only"
                checked={exportScope === 'solemnity_only'}
                onChange={() => setExportScope('solemnity_only')}
                className="w-5 h-5 text-parish-primary"
              />
            </label>
          </div>

          <div className="bg-surface-hover p-3 rounded-xl border border-surface-border flex items-start gap-2 text-xs text-text-muted">
            <Info size={16} className="text-parish-primary shrink-0 mt-0.5" />
            <span>
              File <code>.ics</code> tương thích chuẩn quốc tế RFC 5545, hỗ trợ thêm ngay vào Apple Calendar (iPhone/iPad/Mac), Google Calendar và Outlook.
            </span>
          </div>

          <button
            type="button"
            onClick={handleExportIcs}
            className="btn btn-primary w-full min-h-[44px] flex items-center justify-center gap-2 font-bold text-sm"
          >
            <Download size={16} />
            <span>Tải File Lịch (.ics)</span>
          </button>
        </div>
      </ModalShell>
    </div>
  )
}
