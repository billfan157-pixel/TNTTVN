import React, { useState, useMemo, useEffect } from 'react'
import { ModalShell } from '../common/ModalShell'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Church,
  Plus,
  Clock,
  MapPin,
  Download,
  ExternalLink,
  Pencil,
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
import type { LiturgicalDay } from '../../types/liturgical'
import type { ParishEvent } from '../../stores/parishEventStore'
import { PageHeader } from '../common/PageHeader'
import { useParishEventStore } from '../../stores/parishEventStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { Trash2 } from 'lucide-react'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { canManageParishEvents } from '../../utils/parishPortal'

export const DesktopCalendarView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDay, setSelectedDay] = useState<LiturgicalDay>(getLiturgicalDay(new Date()))
  const { events: parishEvents, fetchEvents, createEvent, updateEvent, deleteEvent } = useParishEventStore()
  const role = useAuthStore(state => state.user?.role)
  const canManageEvents = canManageParishEvents(role)
  const [showAddEventModal, setShowAddEventModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<ParishEvent | null>(null)
  const [newEventDate, setNewEventDate] = useState(() => getLiturgicalDay(new Date()).date)
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventCategory, setNewEventCategory] = useState<ParishEvent['category']>('FEAST_DAY')
  const [newEventTime, setNewEventTime] = useState('')
  const [newEventLocation, setNewEventLocation] = useState('')
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportScope, setExportScope] = useState<'year' | 'month' | 'solemnity_only'>('year')
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1 // 1 - 12

  const monthDays = useMemo(() => {
    return getLiturgicalMonthDays(year, month)
  }, [year, month])

  const upcomingSolemnities = useMemo(() => {
    return getUpcomingSolemnities(new Date(), 4)
  }, [])

  // Padding start of month
  const firstDayOfWeek = useMemo(() => {
    const firstDate = new Date(year, month - 1, 1)
    return firstDate.getDay() // 0 = CN, 1 = T2, ...
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

  const handleExportIcs = () => {
    let daysToExport: LiturgicalDay[] = []
    if (exportScope === 'month') {
      daysToExport = monthDays
    } else if (exportScope === 'solemnity_only') {
      const allYearDays: LiturgicalDay[] = []
      for (let m = 1; m <= 12; m++) {
        allYearDays.push(...getLiturgicalMonthDays(year, m))
      }
      daysToExport = allYearDays.filter((d) => d.rank === 'SOLEMNITY' || d.isHolyDayOfObligation)
    } else {
      for (let m = 1; m <= 12; m++) {
        daysToExport.push(...getLiturgicalMonthDays(year, m))
      }
    }

    const icsString = generateLiturgicalIcs(daysToExport, parishEvents as any, {
      calendarName: `Lịch Phụng Vụ ${year} - TNTT`,
      parishName: 'Giáo Xứ Gia Tôn',
    })

    const filename = `lich-phung-vu-${exportScope === 'month' ? `thang-${month}-${year}` : year}.ics`
    downloadIcsFile(icsString, filename)
    setShowExportModal(false)
  }

  const handleOpenGoogleCalendarForSelected = () => {
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

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEventTitle.trim() || !newEventDate) return

    const categoryNames: Record<ParishEvent['category'], string> = {
      FEAST_DAY: 'Lễ Bổn Mạng',
      CAMP: 'Trại Hè / Sa Mạc',
      TRAINING: 'Huấn Luyện',
      SACRAMENT: 'Bí Tích',
      RETREAT: 'Tĩnh Tâm',
      MEETING: 'Họp Xứ Đoàn',
      OTHER: 'Sự Kiện Khác',
    }

    const payload = {
      date: newEventDate,
      title: newEventTitle.trim(),
      category: newEventCategory,
      categoryName: categoryNames[newEventCategory],
      time: newEventTime.trim() || undefined,
      location: newEventLocation.trim() || undefined,
    }

    try {
      if (editingEvent) {
        await updateEvent(editingEvent.id, payload)
        useToastStore.getState().addToast('Đã cập nhật sự kiện', 'success')
      } else {
        await createEvent(payload as any)
        useToastStore.getState().addToast('Đã thêm sự kiện xứ đoàn', 'success')
      }
    } catch (err: any) {
      useToastStore.getState().addToast(err?.message || 'Không thể lưu sự kiện', 'error')
      return
    }

    // Chuyển đến ngày của sự kiện vừa lưu để người dùng thấy kết quả
    if (newEventDate !== selectedDay.date) {
      setSelectedDay(getLiturgicalDay(new Date(`${newEventDate}T00:00:00`)))
      setCurrentDate(new Date(`${newEventDate}T00:00:00`))
    }

    setNewEventDate(selectedDay.date)
    setNewEventTitle('')
    setNewEventTime('')
    setNewEventLocation('')
    setEditingEvent(null)
    setShowAddEventModal(false)
  }

  const handleDeleteEvent = async (ev: ParishEvent) => {
    const confirmed = await askConfirm({
      title: 'Xóa sự kiện',
      message: `Xóa sự kiện “${ev.title}” ngày ${ev.date}? Thao tác này không thể hoàn tác.`,
      confirmText: 'Xóa sự kiện',
      variant: 'danger',
    })
    if (!confirmed) return
    try {
      await deleteEvent(ev.id)
      useToastStore.getState().addToast('Đã xóa sự kiện', 'success')
    } catch (error) {
      useToastStore.getState().addToast(error instanceof Error ? error.message : 'Không thể xóa sự kiện', 'error')
    }
  }

  const handleOpenAddEventModal = () => {
    setEditingEvent(null)
    setNewEventDate(selectedDay.date)
    setNewEventTitle('')
    setNewEventTime('')
    setNewEventLocation('')
    setShowAddEventModal(true)
  }

  const handleOpenEditEventModal = (ev: ParishEvent) => {
    setEditingEvent(ev)
    setNewEventDate(ev.date)
    setNewEventTitle(ev.title)
    setNewEventCategory(ev.category)
    setNewEventTime(ev.time || '')
    setNewEventLocation(ev.location || '')
    setShowAddEventModal(true)
  }

  const handleCloseEventModal = () => {
    setEditingEvent(null)
    setNewEventDate(selectedDay.date)
    setNewEventTitle('')
    setNewEventTime('')
    setNewEventLocation('')
    setShowAddEventModal(false)
  }

  const dayHeaders = ['Chúa Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

  return (
    <div className="product-view flex flex-col gap-6">
      {confirmDialog}
      {/* Header Bar */}
      <PageHeader
        icon={<CalendarIcon size={24} />}
        title="Lịch Phụng Vụ & Sự Kiện Xứ Đoàn"
        description="Lịch Công Giáo chuẩn Hội Đồng Giám Mục Việt Nam (HĐGMVN) & Sách Lễ Rôma"
        actions={
          <>
            <button
              onClick={() => setShowExportModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-parish-primary text-white hover:bg-parish-primary-hover shadow-xs flex items-center gap-1.5 transition-all"
            >
              <Download size={15} />
              <span>Đồng Bộ / Xuất Lịch (.ics)</span>
            </button>

            <button
              onClick={handleToday}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-surface-app text-text-secondary hover:bg-surface-hover border border-surface-border transition-all"
            >
              Hôm Nay
            </button>
            <div className="flex items-center bg-surface-app rounded-xl border border-surface-border p-1 gap-1">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-card transition-colors bg-transparent border-none cursor-pointer"
                title="Tháng trước"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-extrabold text-text-main px-2 sm:px-3 min-w-0 sm:min-w-[140px] text-center truncate">
                Tháng {month} / {year}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-card transition-colors bg-transparent border-none cursor-pointer"
                title="Tháng sau"
                aria-label="Xem tháng sau"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </>
        }
      />

      {/* Main Grid + Detail Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Calendar Grid (8 cols) */}
        <div className="lg:col-span-8 app-panel p-5 flex flex-col gap-3">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-2 text-center pb-2 border-b border-surface-border">
            {dayHeaders.map((dh, idx) => (
              <div
                key={dh}
                className={`text-xs font-extrabold uppercase tracking-wider py-1 ${
                  idx === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-text-muted'
                }`}
              >
                {dh}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-2 auto-rows-fr">
            {/* Empty padding for first day */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="min-h-[85px] rounded-xl bg-surface-app/30 border border-transparent opacity-30"
              />
            ))}

            {/* Actual Days */}
            {monthDays.map((dayItem) => {
              const isSelected = selectedDay.date === dayItem.date
              const isToday = dayItem.date === getLiturgicalDay(new Date()).date
              const colorMeta = LITURGICAL_COLORS[dayItem.color] || LITURGICAL_COLORS.GREEN
              const dayNum = parseInt(dayItem.date.split('-')[2], 10)
              const hasEvents = parishEvents.some((e) => e.date === dayItem.date)

              return (
                <button
                  key={dayItem.date}
                  type="button"
                  onClick={() => setSelectedDay(dayItem)}
                  className={`min-h-[88px] p-2 rounded-xl border text-left flex flex-col justify-between transition-all relative overflow-hidden group cursor-pointer ${
                    isSelected
                      ? 'border-parish-primary bg-parish-primary-light/50 ring-2 ring-parish-primary/30 shadow-sm'
                      : 'border-surface-border bg-surface-card hover:bg-surface-hover hover:border-parish-primary/30'
                  } ${isToday ? 'ring-1 ring-parish-primary' : ''}`}
                >
                  {/* Top Bar inside cell: Day Number + Color Dot */}
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs font-black rounded-lg w-6 h-6 flex items-center justify-center ${
                        isToday
                          ? 'bg-parish-primary text-white'
                          : dayItem.isSunday
                          ? 'text-rose-600 dark:text-rose-400 font-extrabold'
                          : 'text-text-main'
                      }`}
                    >
                      {dayNum}
                    </span>

                    <div className="flex items-center gap-1">
                      {hasEvents && (
                        <span className="w-2 h-2 rounded-full bg-amber-500" title="Có sự kiện xứ đoàn" />
                      )}
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-xs"
                        style={{ backgroundColor: colorMeta.hex }}
                        title={`Áo lễ: ${dayItem.colorName}`}
                      />
                    </div>
                  </div>

                  {/* Cell Content: Title preview */}
                  <div className="mt-1 flex-1 flex flex-col justify-end">
                    <span
                      className={`text-[11px] font-bold line-clamp-2 leading-tight ${
                        dayItem.rank === 'SOLEMNITY'
                          ? 'text-parish-primary font-black'
                          : 'text-text-secondary group-hover:text-text-main'
                      }`}
                    >
                      {dayItem.title}
                    </span>

                    {dayItem.isHolyDayOfObligation && (
                      <span className="text-[9px] font-black uppercase text-rose-600 mt-0.5 block">
                        Lễ Buộc
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Calendar Legend */}
          <div className="mt-4 pt-3 border-t border-surface-border flex items-center justify-between flex-wrap gap-3 text-xs text-text-muted">
            <span className="font-bold text-text-secondary">Màu Áo Lễ:</span>
            <div className="flex items-center gap-3 flex-wrap">
              {Object.entries(LITURGICAL_COLORS).map(([key, c]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: c.hex }} />
                  <span className="font-medium">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Day Detail Sidebar (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Day Detail Card */}
          <div className="app-panel p-5 relative overflow-hidden flex flex-col gap-4">
            <div
              className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none opacity-20"
              style={{ backgroundColor: selectedDayColorMeta.hex }}
            />

            {/* Header info */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-text-muted">
                  {new Date(selectedDay.date).toLocaleDateString('vi-VN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border ${selectedDayColorMeta.bgClass} ${selectedDayColorMeta.textClass} ${selectedDayColorMeta.borderClass}`}
                >
                  {selectedDay.rankName}
                </span>
              </div>

              <h3 className="text-lg font-black text-text-main m-0 leading-snug">
                {selectedDay.title}
              </h3>
              {selectedDay.subTitle && (
                <p className="text-xs text-text-muted mt-1 m-0 font-medium">{selectedDay.subTitle}</p>
              )}
            </div>

            {/* Liturgical Specs */}
            <div className="grid grid-cols-2 gap-2 bg-surface-app p-3 rounded-xl border border-surface-border text-xs">
              <div>
                <span className="text-text-muted block text-[10px] uppercase font-bold">Mùa Phụng Vụ</span>
                <strong className="text-text-main mt-0.5 block">{selectedDay.seasonName}</strong>
              </div>
              <div>
                <span className="text-text-muted block text-[10px] uppercase font-bold">Màu Áo Lễ</span>
                <strong className={`${selectedDayColorMeta.textClass} mt-0.5 block flex items-center gap-1`}>
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: selectedDayColorMeta.hex }}
                  />
                  {selectedDay.colorName}
                </strong>
              </div>
              <div>
                <span className="text-text-muted block text-[10px] uppercase font-bold">Chu Kỳ Lời Chúa</span>
                <strong className="text-text-main mt-0.5 block">Năm {selectedDay.sundayCycle || 'A'}</strong>
              </div>
              <div>
                <span className="text-text-muted block text-[10px] uppercase font-bold">Quy Chế</span>
                <strong className="text-text-main mt-0.5 block">
                  {selectedDay.isHolyDayOfObligation ? 'Lễ Buộc Tham Dự' : 'Lễ Thường'}
                </strong>
              </div>
            </div>

            {/* Gospel Quote if available */}
            {selectedDay.readings?.gospelVerse && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 mb-1">
                  <Sparkles size={14} />
                  <span>Lời Chúa Hôm Nay</span>
                </div>
                <p className="text-xs italic text-text-main m-0 leading-relaxed font-medium">
                  "{selectedDay.readings.gospelVerse}"
                </p>
                {selectedDay.readings.gospel && (
                  <span className="text-[11px] font-bold text-parish-primary mt-1.5 block">
                    — Phúc Âm: {selectedDay.readings.gospel}
                  </span>
                )}
              </div>
            )}

            {/* Parish Events for this day */}
            <div className="pt-2 border-t border-surface-border flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-text-secondary uppercase tracking-wider">
                  Sự Kiện Xứ Đoàn ({selectedDayParishEvents.length})
                </span>
                {canManageEvents && (
                  <button
                    onClick={handleOpenAddEventModal}
                    className="px-2 py-1 rounded-lg text-xs font-bold bg-parish-primary text-white hover:bg-parish-primary-hover flex items-center gap-1 transition-colors"
                  >
                    <Plus size={12} /> Thêm
                  </button>
                )}
              </div>

              {selectedDayParishEvents.length === 0 ? (
                <p className="text-xs text-text-muted m-0 italic py-2">
                  Không có sự kiện đặc biệt của xứ đoàn trong ngày này.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {selectedDayParishEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-2.5 rounded-xl bg-surface-app border border-surface-border flex flex-col gap-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-text-main">{ev.title}</strong>
                        <span className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                            {ev.categoryName}
                          </span>
                          {canManageEvents && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditEventModal(ev)}
                              className="p-1 rounded-md text-text-muted hover:text-parish-primary hover:bg-surface-card transition-colors border border-transparent hover:border-surface-border cursor-pointer"
                              title="Chỉnh sửa sự kiện"
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                          {canManageEvents && (
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(ev)}
                              className="p-1 rounded-md text-text-muted hover:text-rose-600 hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-200 cursor-pointer"
                              title="Xóa sự kiện"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </span>
                      </div>
                      {(ev.time || ev.location) && (
                        <div className="flex items-center gap-3 text-text-muted text-[11px]">
                          {ev.time && (
                            <span className="flex items-center gap-1">
                              <Clock size={11} /> {ev.time}
                            </span>
                          )}
                          {ev.location && (
                            <span className="flex items-center gap-1">
                              <MapPin size={11} /> {ev.location}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Google Calendar Button for Selected Day */}
            <div className="pt-2 border-t border-surface-border">
              <button
                type="button"
                onClick={handleOpenGoogleCalendarForSelected}
                className="btn btn-secondary text-xs font-bold w-full flex items-center justify-center gap-1.5 py-2"
                title="Thêm ngày lễ này vào Google Calendar"
              >
                <ExternalLink size={13} />
                <span>Thêm Vào Google Calendar</span>
              </button>
            </div>
          </div>

          {/* Upcoming Solemnities Card */}
          <div className="app-panel p-5 flex flex-col gap-3">
            <h4 className="text-xs font-extrabold text-text-secondary uppercase tracking-wider m-0 flex items-center gap-1.5">
              <Church size={14} className="text-parish-primary" /> Các Lễ Trọng Sắp Tới
            </h4>

            <div className="flex flex-col gap-2">
              {upcomingSolemnities.map((sol) => {
                const col = LITURGICAL_COLORS[sol.color] || LITURGICAL_COLORS.WHITE
                return (
                  <div
                    key={sol.date}
                    onClick={() => {
                      setSelectedDay(sol)
                      setCurrentDate(new Date(sol.date))
                    }}
                    className="p-2.5 rounded-xl bg-surface-app hover:bg-surface-hover border border-surface-border cursor-pointer transition-all flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-xs font-bold text-text-main">{sol.title}</div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        {new Date(sol.date).toLocaleDateString('vi-VN', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'numeric',
                        })}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${col.bgClass} ${col.textClass} ${col.borderClass}`}
                    >
                      {sol.colorName}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Export / Sync Calendar Modal */}
      {showExportModal && (
        <ModalShell
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Đồng Bộ Lịch Phụng Vụ & Xứ Đoàn"
          subtitle="Xuất file chuẩn iCalendar (.ics) tương thích Apple, Google & Outlook"
          icon={<Download size={18} />}
          maxWidth="512px"
        >
          <div className="flex flex-col gap-4">
            {/* Scope Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-text-secondary">Chọn phạm vi xuất:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setExportScope('year')}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    exportScope === 'year'
                      ? 'border-parish-primary bg-parish-primary-light/50 ring-1 ring-parish-primary'
                      : 'border-surface-border bg-surface-app hover:bg-surface-hover'
                  }`}
                >
                  <strong className="text-xs font-black text-text-main">Cả Năm {year}</strong>
                  <span className="text-[10px] text-text-muted">365 ngày + Sự kiện</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExportScope('month')}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    exportScope === 'month'
                      ? 'border-parish-primary bg-parish-primary-light/50 ring-1 ring-parish-primary'
                      : 'border-surface-border bg-surface-app hover:bg-surface-hover'
                  }`}
                >
                  <strong className="text-xs font-black text-text-main">Tháng {month}/{year}</strong>
                  <span className="text-[10px] text-text-muted">Tháng hiện tại</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExportScope('solemnity_only')}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    exportScope === 'solemnity_only'
                      ? 'border-parish-primary bg-parish-primary-light/50 ring-1 ring-parish-primary'
                      : 'border-surface-border bg-surface-app hover:bg-surface-hover'
                  }`}
                >
                  <strong className="text-xs font-black text-text-main">Lễ Trọng & Buộc</strong>
                  <span className="text-[10px] text-text-muted">Các ngày lễ lớn</span>
                </button>
              </div>
            </div>

            {/* Instruction Guide */}
            <div className="bg-surface-app p-3.5 rounded-xl border border-surface-border text-xs flex flex-col gap-1.5 text-text-secondary leading-relaxed">
              <div className="font-bold text-text-main flex items-center gap-1">
                💡 Hướng dẫn đồng bộ:
              </div>
              <div>
                • <strong>Apple Calendar (iPhone, iPad, Mac)</strong>: Tải file <code className="text-parish-primary font-bold">.ics</code> về và mở trực tiếp → Chọn "Thêm tất cả sự kiện".
              </div>
              <div>
                • <strong>Google Calendar</strong>: Vào <code className="text-parish-primary font-bold">calendar.google.com</code> → Cài đặt → "Nhập & Xuất" → Chọn file <code className="text-parish-primary font-bold">.ics</code> vừa tải.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-surface-border">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="btn btn-secondary text-xs font-bold"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleExportIcs}
                className="btn btn-primary text-xs font-bold flex items-center gap-1.5"
              >
                <Download size={14} />
                <span>Tải File Lịch (.ics)</span>
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Add Parish Event Modal */}
      {showAddEventModal && (
        <ModalShell
          isOpen={showAddEventModal}
          onClose={handleCloseEventModal}
          title={
            editingEvent
              ? `Chỉnh Sửa Sự Kiện Xứ Đoàn (${newEventDate})`
              : `Thêm Sự Kiện Xứ Đoàn (${newEventDate})`
          }
          maxWidth="448px"
        >
          <form onSubmit={handleAddEvent} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">Ngày Sự Kiện</label>
                <input
                  type="date"
                  required
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="form-input w-full text-xs font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">Tên Sự Kiện</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Lễ Bổn Mạng Xứ Đoàn, Sa Mạc Huấn Luyện..."
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="form-input w-full text-xs font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">Loại Sự Kiện</label>
                <select
                  value={newEventCategory}
                  onChange={(e) => setNewEventCategory(e.target.value as ParishEvent['category'])}
                  className="form-select w-full text-xs font-medium"
                >
                  <option value="FEAST_DAY">Lễ Bổn Mạng / Thánh Lễ</option>
                  <option value="CAMP">Hội Trại / Dã Ngoại</option>
                  <option value="TRAINING">Sa Mạc / Huấn Luyện</option>
                  <option value="SACRAMENT">Bí Tích (Rước Lễ / Thêm Sức)</option>
                  <option value="RETREAT">Tĩnh Tâm / Chầu Lượt</option>
                  <option value="MEETING">Họp Huynh Trưởng / GLV</option>
                  <option value="OTHER">Sự Kiện Khác</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">Thời Gian</label>
                  <input
                    type="time"
                    value={newEventTime}
                    onChange={(e) => setNewEventTime(e.target.value)}
                    className="form-input w-full text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">Địa Điểm</label>
                  <input
                    type="text"
                    placeholder="Nhà Thờ, Hội Trường..."
                    value={newEventLocation}
                    onChange={(e) => setNewEventLocation(e.target.value)}
                    className="form-input w-full text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-surface-border">
                <button
                  type="button"
                  onClick={handleCloseEventModal}
                  className="btn btn-secondary text-xs font-bold"
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary text-xs font-bold">
                  {editingEvent ? 'Cập Nhật Sự Kiện' : 'Lưu Sự Kiện'}
                </button>
              </div>
            </form>
        </ModalShell>
      )}
    </div>
  )
}
