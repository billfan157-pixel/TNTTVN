import React, { useMemo, useState } from 'react'
import {
  Calendar,
  Clock,
  Sparkles,
  AlertTriangle,
  Sun,
  Tent,
  Check,
  CalendarRange,
} from 'lucide-react'
import { TextInput } from '../common/ui/FormControls'
import { Button } from '../common/ui/Button'
import { hapticFeedback } from '../../utils/haptics'
import {
  toLocalInputValue,
  parseDateInput,
  formatFriendlyDate,
  formatFriendlyTime,
  calculateEventDuration,
  addMinutesToDateTime,
  getUpcomingDay,
  getTodayPreset,
  DURATION_PRESETS,
  extractDatePart,
  extractTimePart,
  combineDateTime,
  isSameCalendarDay,
} from '../../utils/smartEventTime'

export interface SmartEventTimePickerProps {
  startsAt: string // "YYYY-MM-DDTHH:mm"
  endsAt: string // "YYYY-MM-DDTHH:mm"
  onChange: (times: { startsAt: string; endsAt: string }) => void
  eventType?: string
  disabled?: boolean
  required?: boolean
  className?: string
  startLabel?: string
  endLabel?: string
  idPrefix?: string
  defaultHasTime?: boolean
  defaultHasEndDate?: boolean
}

export const SmartEventTimePicker: React.FC<SmartEventTimePickerProps> = ({
  startsAt,
  endsAt,
  onChange,
  eventType,
  disabled = false,
  required = false,
  className = '',
  startLabel = 'Bắt đầu',
  endLabel = 'Kết thúc',
  idPrefix = 'event',
  defaultHasTime = true,
  defaultHasEndDate = true,
}) => {
  // Toggle states
  const [hasTime, setHasTime] = useState<boolean>(() => {
    if (defaultHasTime === false) return false
    return true
  })

  const [hasEndDate, setHasEndDate] = useState<boolean>(() => {
    if (startsAt && endsAt && !isSameCalendarDay(startsAt, endsAt)) {
      return true
    }
    return defaultHasEndDate
  })

  const durationInfo = useMemo(() => calculateEventDuration(startsAt, endsAt), [startsAt, endsAt])

  const startDateObj = useMemo(() => parseDateInput(startsAt), [startsAt])
  const endDateObj = useMemo(() => parseDateInput(endsAt), [endsAt])

  const recommendedDurationMinutes = useMemo(() => {
    switch (eventType) {
      case 'MEETING':
        return 90
      case 'FEAST_DAY':
      case 'SACRAMENT':
        return 120
      case 'TRAINING':
        return 180
      case 'RETREAT':
        return 480
      case 'CAMP':
        return 34 * 60
      default:
        return 120
    }
  }, [eventType])

  // --- TOGGLE HANDLERS ---
  const handleToggleHasTime = () => {
    hapticFeedback.light()
    const nextHasTime = !hasTime
    setHasTime(nextHasTime)

    const startDate = extractDatePart(startsAt) || extractDatePart(getTodayPreset('08:00'))
    const endDate = extractDatePart(endsAt) || startDate

    if (!nextHasTime) {
      // Switch to All-Day mode
      const newStart = combineDateTime(startDate, '07:00')
      const newEnd = combineDateTime(hasEndDate ? endDate : startDate, '17:00')
      onChange({ startsAt: newStart, endsAt: newEnd })
    } else {
      // Switch back to Specific Time mode
      const prevStartTime = extractTimePart(startsAt, '08:00')
      const startTime = prevStartTime === '07:00' ? '08:00' : prevStartTime
      const newStart = combineDateTime(startDate, startTime)
      const newEnd = addMinutesToDateTime(newStart, recommendedDurationMinutes)
      onChange({ startsAt: newStart, endsAt: newEnd })
    }
  }

  const handleToggleHasEndDate = () => {
    hapticFeedback.light()
    const nextHasEndDate = !hasEndDate
    setHasEndDate(nextHasEndDate)

    const startDate = extractDatePart(startsAt) || extractDatePart(getTodayPreset('08:00'))

    if (!nextHasEndDate) {
      // Switch to Same-Day mode (end date forced to match start date)
      const endTime = hasTime ? extractTimePart(endsAt, '10:00') : '17:00'
      const newEnd = combineDateTime(startDate, endTime)
      onChange({ startsAt: startsAt || combineDateTime(startDate, '08:00'), endsAt: newEnd })
    } else {
      // Switch to Multi-Day mode
      if (startsAt && endsAt && isSameCalendarDay(startsAt, endsAt)) {
        const nextDay = addMinutesToDateTime(startsAt, 24 * 60)
        onChange({ startsAt, endsAt: nextDay })
      }
    }
  }

  // --- INPUT CHANGE HANDLERS ---
  const handleStartChange = (newStart: string) => {
    if (!newStart) {
      onChange({ startsAt: '', endsAt })
      return
    }

    // Format newStart if in date-only mode
    let formattedStart = newStart
    if (!hasTime && newStart.length === 10) {
      formattedStart = combineDateTime(newStart, '07:00')
    }

    const newStartDate = parseDateInput(formattedStart)
    const prevStartDate = parseDateInput(startsAt)
    const prevEndDate = parseDateInput(endsAt)

    // If same-day mode is active (hasEndDate = false), force endsAt date to follow
    if (!hasEndDate) {
      const newStartDateStr = extractDatePart(formattedStart)
      const prevEndTimeStr = hasTime ? extractTimePart(endsAt, '10:00') : '17:00'
      const syncedEnd = combineDateTime(newStartDateStr, prevEndTimeStr)
      if (syncedEnd <= formattedStart) {
        const autoEnd = addMinutesToDateTime(formattedStart, recommendedDurationMinutes)
        onChange({ startsAt: formattedStart, endsAt: autoEnd })
        return
      }
      onChange({ startsAt: formattedStart, endsAt: syncedEnd })
      return
    }

    if (!prevEndDate || !prevStartDate) {
      const autoEnd = addMinutesToDateTime(formattedStart, recommendedDurationMinutes)
      onChange({ startsAt: formattedStart, endsAt: autoEnd })
      return
    }

    const prevDurationMs = prevEndDate.getTime() - prevStartDate.getTime()
    if (prevDurationMs > 0 && newStartDate) {
      const preservedEnd = new Date(newStartDate.getTime() + prevDurationMs)
      onChange({ startsAt: formattedStart, endsAt: toLocalInputValue(preservedEnd) })
      return
    }

    if (newStartDate && newStartDate.getTime() >= prevEndDate.getTime()) {
      const autoEnd = addMinutesToDateTime(formattedStart, recommendedDurationMinutes)
      onChange({ startsAt: formattedStart, endsAt: autoEnd })
      return
    }

    onChange({ startsAt: formattedStart, endsAt })
  }

  const handleEndChange = (newEnd: string) => {
    let formattedEnd = newEnd
    if (!hasTime && newEnd.length === 10) {
      formattedEnd = combineDateTime(newEnd, '17:00')
    } else if (!hasEndDate && startsAt) {
      // Same-day: force date part of end to match start
      const startDateStr = extractDatePart(startsAt)
      let endTimeStr = extractTimePart(newEnd, '10:00')
      if (newEnd.length === 5 && newEnd.includes(':')) {
        endTimeStr = newEnd
      }
      formattedEnd = combineDateTime(startDateStr, endTimeStr)
    }
    onChange({ startsAt, endsAt: formattedEnd })
  }

  // --- PRESET ACTIONS ---
  const applyDurationPreset = (minutes: number) => {
    hapticFeedback.light()
    if (!hasTime) setHasTime(true)
    if (!startsAt) {
      const defaultStart = getTodayPreset('08:00')
      const defaultEnd = addMinutesToDateTime(defaultStart, minutes)
      onChange({ startsAt: defaultStart, endsAt: defaultEnd })
      return
    }
    const newEnd = addMinutesToDateTime(startsAt, minutes)
    onChange({ startsAt, endsAt: newEnd })
  }

  const applyAllDayPreset = () => {
    hapticFeedback.light()
    setHasTime(false)
    const baseDate = parseDateInput(startsAt) ?? new Date()
    const start = new Date(baseDate)
    start.setHours(7, 0, 0, 0)
    const end = new Date(baseDate)
    end.setHours(17, 0, 0, 0)
    onChange({
      startsAt: toLocalInputValue(start),
      endsAt: toLocalInputValue(end),
    })
  }

  const applyCampPreset = () => {
    hapticFeedback.light()
    setHasTime(true)
    setHasEndDate(true)
    let start: Date
    if (startsAt) {
      const current = parseDateInput(startsAt) ?? new Date()
      start = new Date(current)
      start.setHours(7, 0, 0, 0)
    } else {
      const nextSat = getUpcomingDay(6, '07:00')
      start = parseDateInput(nextSat) ?? new Date()
    }
    const end = new Date(start)
    end.setDate(start.getDate() + 1)
    end.setHours(17, 0, 0, 0)
    onChange({
      startsAt: toLocalInputValue(start),
      endsAt: toLocalInputValue(end),
    })
  }

  const applyDatePreset = (dateValue: string) => {
    hapticFeedback.light()
    const targetDate = parseDateInput(dateValue)
    if (!targetDate) return

    let finalStart: Date
    if (startsAt) {
      const prevStart = parseDateInput(startsAt)
      finalStart = new Date(targetDate)
      if (prevStart) {
        finalStart.setHours(prevStart.getHours(), prevStart.getMinutes(), 0, 0)
      } else {
        finalStart.setHours(8, 0, 0, 0)
      }
    } else {
      finalStart = new Date(targetDate)
      finalStart.setHours(8, 0, 0, 0)
    }

    const newStartStr = toLocalInputValue(finalStart)
    const duration = durationInfo.isValid && durationInfo.diffMinutes > 0
      ? durationInfo.diffMinutes
      : recommendedDurationMinutes

    const newEndStr = addMinutesToDateTime(newStartStr, duration)
    onChange({ startsAt: newStartStr, endsAt: newEndStr })
  }

  const startId = `${idPrefix}-starts-at`
  const endId = `${idPrefix}-ends-at`

  return (
    <div className={`space-y-3.5 rounded-xl border border-surface-border bg-surface-ground/30 p-3 sm:p-4 ${className}`}>
      {/* 1. Header & Quick Date Shortcuts */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-surface-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-text-main">
              Thời Gian Sự Kiện
            </span>
            <p className="m-0 text-xs text-text-muted">
              Tự động bù giờ &amp; hỗ trợ chọn nhanh khoa học
            </p>
          </div>
        </div>

        {/* Quick Date Buttons */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Phím tắt ngày sự kiện">
          <button
            type="button"
            disabled={disabled}
            onClick={() => applyDatePreset(getTodayPreset('08:00'))}
            className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface-card px-2 py-1 text-xs font-semibold text-text-secondary hover:border-parish-primary/40 hover:text-parish-primary transition-colors min-h-7 sm:min-h-0"
            title="Đặt ngày sự kiện là hôm nay"
          >
            Hôm nay
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => applyDatePreset(getUpcomingDay(0, '08:00'))}
            className="inline-flex items-center gap-1 rounded-md border border-parish-primary/30 bg-parish-primary-light/40 px-2 py-1 text-xs font-bold text-parish-primary hover:bg-parish-primary-light hover:border-parish-primary transition-colors min-h-7 sm:min-h-0"
            title="Đặt ngày sự kiện vào Chúa Nhật gần nhất"
          >
            <Sparkles className="h-3 w-3" />
            Chúa Nhật này
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => applyDatePreset(getUpcomingDay(6, '19:00'))}
            className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface-card px-2 py-1 text-xs font-semibold text-text-secondary hover:border-parish-primary/40 hover:text-parish-primary transition-colors min-h-7 sm:min-h-0"
            title="Đặt ngày sự kiện vào Thứ Bảy gần nhất"
          >
            Thứ Bảy này
          </button>
        </div>
      </div>

      {/* 2. Toggle Switches: Thời gian & Ngày kết thúc */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-card p-2.5 sm:p-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          {/* Toggle 1: Thời gian */}
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            onClick={handleToggleHasTime}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleToggleHasTime()
              }
            }}
          >
            <button
              type="button"
              role="switch"
              aria-checked={hasTime}
              aria-label="Bật tắt thời gian"
              disabled={disabled}
              onClick={e => {
                e.stopPropagation()
                handleToggleHasTime()
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-parish-primary/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                hasTime ? 'bg-parish-primary' : 'bg-surface-border'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  hasTime ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-text-main flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-parish-primary" />
                Thời gian
              </span>
              <span className="text-xs text-text-muted">
                {hasTime ? 'Có giờ cụ thể' : 'Cả ngày (All day)'}
              </span>
            </div>
          </div>

          {/* Toggle 2: Ngày kết thúc */}
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            onClick={handleToggleHasEndDate}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleToggleHasEndDate()
              }
            }}
          >
            <button
              type="button"
              role="switch"
              aria-checked={hasEndDate}
              aria-label="Bật tắt ngày kết thúc"
              disabled={disabled}
              onClick={e => {
                e.stopPropagation()
                handleToggleHasEndDate()
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-parish-primary/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                hasEndDate ? 'bg-parish-primary' : 'bg-surface-border'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  hasEndDate ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-text-main flex items-center gap-1">
                <CalendarRange className="h-3.5 w-3.5 text-parish-gold" />
                Ngày kết thúc
              </span>
              <span className="text-xs text-text-muted">
                {hasEndDate ? 'Nhiều ngày / Qua đêm' : 'Cùng ngày'}
              </span>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="hidden md:flex items-center">
          <span className="rounded-md bg-surface-hover px-2.5 py-1 text-xs font-semibold text-text-secondary border border-surface-border/40">
            {!hasTime && !hasEndDate && '📅 Sự kiện 1 ngày trọn vẹn'}
            {!hasTime && hasEndDate && '📅 Sự kiện cả ngày nhiều ngày'}
            {hasTime && !hasEndDate && '⏱ Sự kiện có giờ trong ngày'}
            {hasTime && hasEndDate && '🗓 Sự kiện đầy đủ ngày & giờ'}
          </span>
        </div>
      </div>

      {/* 3. Main Inputs (Responsive 1-col on mobile, 2-col on sm+) */}
      <div className={`grid gap-3 ${hasEndDate ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
        {/* StartsAt Field */}
        <div>
          <label htmlFor={startId} className="flex items-center justify-between text-xs font-bold text-text-main">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-parish-primary" />
              <span>
                {!hasEndDate && !hasTime
                  ? 'Ngày diễn ra sự kiện (Cả ngày)'
                  : !hasEndDate
                    ? 'Thời gian bắt đầu (trong ngày)'
                    : startLabel}
              </span>
              {required && <span className="text-parish-danger">*</span>}
            </span>
            {startDateObj && (
              <span className="text-xs font-semibold text-parish-primary truncate max-w-[160px]">
                {formatFriendlyDate(startDateObj).split(',')[0]}
              </span>
            )}
          </label>
          <TextInput
            id={startId}
            aria-label={startLabel}
            type={hasTime ? 'datetime-local' : 'date'}
            value={hasTime ? startsAt : extractDatePart(startsAt)}
            required={required}
            disabled={disabled}
            onChange={e => handleStartChange(e.target.value)}
            className="mt-1 w-full font-medium"
          />
          {startDateObj && (
            <p className="mb-0 mt-1 text-xs text-text-muted truncate">
              {formatFriendlyDate(startDateObj)}
              {hasTime && ` lúc ${formatFriendlyTime(startDateObj)}`}
            </p>
          )}
        </div>

        {/* EndsAt Field (Shown when hasEndDate is true OR when hasTime is true) */}
        {(hasEndDate || hasTime) && (
          <div>
            <label htmlFor={endId} className="flex items-center justify-between text-xs font-bold text-text-main">
              <span className="flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5 text-parish-gold" />
                <span>
                  {!hasEndDate
                    ? 'Giờ kết thúc (cùng ngày)'
                    : !hasTime
                      ? 'Đến ngày (Cả ngày)'
                      : endLabel}
                </span>
                {required && <span className="text-parish-danger">*</span>}
              </span>
              {!hasEndDate && (
                <span className="text-xs font-semibold text-parish-gold">
                  Khóa cùng ngày
                </span>
              )}
              {hasEndDate && endDateObj && (
                <span className="text-xs font-semibold text-text-muted truncate max-w-[160px]">
                  {formatFriendlyDate(endDateObj).split(',')[0]}
                </span>
              )}
            </label>
            <TextInput
              id={endId}
              aria-label={endLabel}
              type={hasTime ? 'datetime-local' : 'date'}
              value={hasTime ? endsAt : extractDatePart(endsAt)}
              required={required}
              disabled={disabled}
              invalid={!durationInfo.isValid && Boolean(startsAt && endsAt)}
              onChange={e => handleEndChange(e.target.value)}
              className="mt-1 w-full font-medium"
            />
            {endDateObj && (
              <p className="mb-0 mt-1 text-xs text-text-muted truncate">
                {formatFriendlyDate(endDateObj)}
                {hasTime && ` lúc ${formatFriendlyTime(endDateObj)}`}
              </p>
            )}
          </div>
        )}

        {/* Fallback hidden input when both toggles are off to preserve form and test selectors */}
        {!hasEndDate && !hasTime && (
          <input
            type="hidden"
            id={endId}
            aria-label={endLabel}
            value={endsAt}
          />
        )}
      </div>

      {/* 4. Duration Quick Presets Row (Shown when hasTime is true) */}
      {hasTime && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-parish-primary" />
              Thời lượng kết thúc nhanh:
            </span>
            {startsAt && (
              <span className="text-xs text-text-muted">
                Tính từ giờ bắt đầu
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn thời lượng nhanh">
            {DURATION_PRESETS.map(preset => {
              const isSelected = durationInfo.isValid && durationInfo.diffMinutes === preset.minutes
              return (
                <button
                  key={preset.minutes}
                  type="button"
                  disabled={disabled}
                  onClick={() => applyDurationPreset(preset.minutes)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors touch-manipulation min-h-9 sm:min-h-7 ${
                    isSelected
                      ? 'bg-parish-primary text-white shadow-xs ring-2 ring-parish-primary/20 font-bold'
                      : 'bg-surface-card border border-surface-border text-text-secondary hover:border-parish-primary/40 hover:text-parish-primary'
                  }`}
                  title={preset.tag}
                >
                  {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                  <span>{preset.label}</span>
                </button>
              )
            })}

            <button
              type="button"
              disabled={disabled}
              onClick={applyAllDayPreset}
              className="inline-flex items-center gap-1 rounded-lg border border-surface-border bg-surface-card px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:border-parish-primary/40 hover:text-parish-primary transition-colors min-h-9 sm:min-h-7"
              title="Đặt từ 07:00 đến 17:00 cùng ngày"
            >
              <Sun className="h-3 w-3 text-parish-warning" />
              <span>Cả ngày (07:00–17:00)</span>
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={applyCampPreset}
              className="inline-flex items-center gap-1 rounded-lg border border-surface-border bg-surface-card px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:border-parish-primary/40 hover:text-parish-primary transition-colors min-h-9 sm:min-h-7"
              title="Đặt 2 ngày 1 đêm (Trại / Sa mạc huấn luyện)"
            >
              <Tent className="h-3 w-3 text-parish-success" />
              <span>2 ngày 1 đêm</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Smart Timeline & Duration Feedback Badge */}
      {startsAt && endsAt && (
        <div className="pt-1">
          {durationInfo.isValid ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-parish-primary/20 bg-parish-primary-light/20 p-2.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-parish-primary text-white shrink-0 font-black text-xs">
                  ✓
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-parish-primary">
                    {!hasTime
                      ? `Cả ngày (${durationInfo.isSameDay ? '1 ngày' : durationInfo.durationText})`
                      : `Thời lượng: ${durationInfo.durationText}`}
                  </span>
                  <p className="m-0 text-xs text-text-muted truncate">
                    {durationInfo.summaryText}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                {durationInfo.isOvernight && (
                  <span className="inline-flex items-center rounded-md bg-parish-info-bg px-2 py-0.5 text-xs font-bold text-parish-info border border-parish-info/20">
                    Qua đêm
                  </span>
                )}
                {durationInfo.isMultiDay && (
                  <span className="inline-flex items-center rounded-md bg-parish-warning-bg px-2 py-0.5 text-xs font-bold text-parish-warning border border-parish-warning/20">
                    Nhiều ngày
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-parish-danger/30 bg-parish-danger-bg/40 p-2.5 text-xs text-parish-danger">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-parish-danger" />
                <span className="font-bold">
                  {durationInfo.warning || 'Giờ kết thúc phải sau giờ bắt đầu.'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => applyDurationPreset(120)}
                  className="!min-h-7 !py-0.5 !px-2 text-xs"
                >
                  Đặt lại +2 giờ
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={applyAllDayPreset}
                  className="!min-h-7 !py-0.5 !px-2 text-xs"
                >
                  Cả ngày
                </Button>
              </div>
            </div>
          )}

          {durationInfo.isValid && durationInfo.warning && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-parish-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{durationInfo.warning}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
