import React, { useState, useMemo, useEffect } from 'react'
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
  Plus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { useParishEventStore } from '../../stores/parishEventStore'
import { useToastStore } from '../../stores/toastStore'
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

export const MobileCalendarView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDay, setSelectedDay] = useState<LiturgicalDay>(getLiturgicalDay(new Date()))
  const { events: parishEvents, fetchEvents, createEvent, updateEvent, deleteEvent } = useParishEventStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<ParishEvent | null>(null)
  const [formDate, setFormDate] = useState(() => getLiturgicalDay(new Date()).date)
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState<ParishEvent['category']>('FEAST_DAY')
  const [formTime, setFormTime] = useState('')
  const [formLocation, setFormLocation] = useState('')

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

  const handleOpenAdd = () => {
    setEditingEvent(null)
    setFormDate(selectedDay.date)
    setFormTitle('')
    setFormTime('')
    setFormLocation('')
    setFormCategory('FEAST_DAY')
    setShowAddModal(true)
  }

  const handleOpenEdit = (ev: ParishEvent) => {
    setEditingEvent(ev)
    setFormDate(ev.date)
    setFormTitle(ev.title)
    setFormCategory(ev.category)
    setFormTime(ev.time || '')
    setFormLocation(ev.location || '')
    setShowAddModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim() || !formDate) return
    const payload = { date: formDate, title: formTitle.trim(), category: formCategory, time: formTime.trim() || undefined, location: formLocation.trim() || undefined }
    try {
      if (editingEvent) {
        await updateEvent(editingEvent.id, payload)
        useToastStore.getState().addToast('Đã cập nhật sự kiện', 'success')
      } else {
        await createEvent(payload as any)
        useToastStore.getState().addToast('Đã thêm sự kiện', 'success')
      }
      if (formDate !== selectedDay.date) {
        setSelectedDay(getLiturgicalDay(new Date(`${formDate}T00:00:00`)))
        setCurrentDate(new Date(`${formDate}T00:00:00`))
      }
      setShowAddModal(false)
      setEditingEvent(null)
    } catch (err: any) {
      useToastStore.getState().addToast(err?.message || 'Không thể lưu', 'error')
    }
  }

  const handleDelete = async (ev: ParishEvent) => {
    if (!confirm(`Xóa "${ev.title}"?`)) return
    await deleteEvent(ev.id)
    useToastStore.getState().addToast('Đã xóa', 'success')
  }

  const dayHeaders = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

  return (
    <div className="mobile-screen mobile-screen--stack product-view">
      {/* Top Header & Month Switcher */}
      <div className="mobile-page-header mobile-page-header--compact">
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
              const icsString = generateLiturgicalIcs(monthDays, parishEvents as any, {
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
      <div className="app-panel p-3 flex flex-col gap-2">
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
              window.open(url, '_blank')
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
          <button onClick={handleOpenAdd} className="px-2.5 py-1 rounded-full bg-parish-primary text-white text-xs font-bold flex items-center gap-1 min-h-[32px]">
            <Plus size={12} /> Thêm
          </button>
        </div>
        {selectedDayParishEvents.length === 0 ? (
          <p className="text-xs text-text-muted italic py-2">Chưa có sự kiện — bấm Thêm để tạo.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {selectedDayParishEvents.map((ev) => (
              <div key={ev.id} className="p-2.5 rounded-xl bg-surface-app border border-surface-border text-xs flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-text-main flex-1 truncate">{ev.title}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">{ev.categoryName || ev.category}</span>
                    <button onClick={() => handleOpenEdit(ev)} className="p-1 rounded-md hover:bg-surface-card" aria-label="Sửa"><Pencil size={12} /></button>
                    <button onClick={() => handleDelete(ev)} className="p-1 rounded-md hover:bg-rose-50 text-text-muted hover:text-rose-600" aria-label="Xóa"><Trash2 size={12} /></button>
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

      {/* Bottom-sheet thêm/sửa sự kiện — mobile Calm */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0" onClick={() => setShowAddModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()} className="relative w-full max-w-lg bg-surface-card rounded-t-3xl shadow-xl max-h-[92dvh] overflow-y-auto flex flex-col">
            <div className="sticky top-0 bg-surface-card border-b border-surface-border px-4 pt-3 pb-3 flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-parish-primary m-0 text-sm">{editingEvent ? 'Sửa Sự Kiện' : 'Thêm Sự Kiện'} — {formDate}</h4>
                <p className="text-xs text-text-muted m-0">Lưu server + offline, đồng bộ lịch</p>
              </div>
              <button type="button" onClick={() => setShowAddModal(false)} className="w-9 h-9 rounded-xl bg-surface-hover flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <label className="text-xs font-bold text-text-secondary">Ngày <span className="text-red-500">*</span>
                <input type="date" required value={formDate} onChange={e => setFormDate(e.target.value)} className="form-input w-full mt-1 min-h-[44px]" />
              </label>
              <label className="text-xs font-bold text-text-secondary">Tiêu đề <span className="text-red-500">*</span>
                <input type="text" required value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="VD: Lễ Bổn Mạng" className="form-input w-full mt-1 min-h-[44px]" />
              </label>
              <label className="text-xs font-bold text-text-secondary">Loại
                <select value={formCategory} onChange={e => setFormCategory(e.target.value as any)} className="form-select w-full mt-1 min-h-[44px]">
                  <option value="FEAST_DAY">Lễ Bổn Mạng / Thánh Lễ</option>
                  <option value="CAMP">Hội Trại / Dã Ngoại</option>
                  <option value="TRAINING">Sa Mạc / Huấn Luyện</option>
                  <option value="SACRAMENT">Bí Tích</option>
                  <option value="RETREAT">Tĩnh Tâm</option>
                  <option value="MEETING">Họp Xứ Đoàn</option>
                  <option value="OTHER">Khác</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-text-secondary">Giờ
                  <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} className="form-input w-full mt-1 min-h-[44px]" />
                </label>
                <label className="text-xs font-bold text-text-secondary">Địa điểm
                  <input type="text" value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="Nhà thờ..." className="form-input w-full mt-1 min-h-[44px]" />
                </label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-surface-card border-t border-surface-border p-3 flex gap-2 pb-[max(12px,env(safe-area-inset-bottom))]">
              <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary flex-1 min-h-[44px]">Hủy</button>
              <button type="submit" className="btn btn-primary flex-1 min-h-[44px]">{editingEvent ? 'Cập nhật' : 'Lưu'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
