import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SmartEventTimePicker } from '../../components/operations/SmartEventTimePicker'
import {
  calculateEventDuration,
  formatFriendlyDate,
  toLocalInputValue,
  addMinutesToDateTime,
} from '../../utils/smartEventTime'

describe('SmartEventTimePicker - Duration & Date Calculations', () => {
  it('formats Date to local input string YYYY-MM-DDTHH:mm accurately', () => {
    const d = new Date(2026, 8, 13, 8, 30) // Sep 13, 2026 08:30
    expect(toLocalInputValue(d)).toBe('2026-09-13T08:30')
  })

  it('formats friendly date and converts Chủ Nhật to Chúa Nhật', () => {
    const sunday = new Date('2026-09-13T08:00')
    const formatted = formatFriendlyDate(sunday)
    expect(formatted).toContain('Chúa Nhật')
    expect(formatted).toContain('13/09/2026')
  })

  it('calculates duration for same day events correctly', () => {
    const info = calculateEventDuration('2026-09-13T08:00', '2026-09-13T10:00')
    expect(info.isValid).toBe(true)
    expect(info.diffMinutes).toBe(120)
    expect(info.durationText).toBe('2 giờ')
    expect(info.isSameDay).toBe(true)
    expect(info.isOvernight).toBe(false)
    expect(info.summaryText).toContain('Chúa Nhật')
    expect(info.summaryText).toContain('08:00 → 10:00')
  })

  it('calculates duration with minutes (e.g. 1 hour 30 mins)', () => {
    const info = calculateEventDuration('2026-09-13T08:00', '2026-09-13T09:30')
    expect(info.isValid).toBe(true)
    expect(info.diffMinutes).toBe(90)
    expect(info.durationText).toBe('1 giờ 30 phút')
  })

  it('detects overnight camp/desert events (2 ngày 1 đêm)', () => {
    const info = calculateEventDuration('2026-09-12T07:00', '2026-09-13T17:00')
    expect(info.isValid).toBe(true)
    expect(info.isOvernight).toBe(true)
    expect(info.durationText).toContain('2 ngày 1 đêm')
  })

  it('returns invalid state and warning when endsAt is before startsAt', () => {
    const info = calculateEventDuration('2026-09-13T10:00', '2026-09-13T08:00')
    expect(info.isValid).toBe(false)
    expect(info.warning).toBe('Giờ kết thúc phải sau giờ bắt đầu.')
  })

  it('returns invalid state when endsAt equals startsAt', () => {
    const info = calculateEventDuration('2026-09-13T08:00', '2026-09-13T08:00')
    expect(info.isValid).toBe(false)
    expect(info.warning).toBe('Giờ kết thúc phải sau giờ bắt đầu.')
  })

  it('adds minutes accurately across date boundaries', () => {
    const result = addMinutesToDateTime('2026-09-12T23:00', 120)
    expect(result).toBe('2026-09-13T01:00')
  })
})

describe('SmartEventTimePicker - Component Interactions', () => {
  it('renders start and end labels and inputs matching accessibility standards', () => {
    render(
      <SmartEventTimePicker
        startsAt="2026-09-13T08:00"
        endsAt="2026-09-13T10:00"
        onChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Bắt đầu')).toBeInTheDocument()
    expect(screen.getByLabelText('Kết thúc')).toBeInTheDocument()
    expect(screen.getByText(/Thời lượng: 2 giờ/)).toBeInTheDocument()
  })

  it('automatically sets endsAt when startsAt is selected and endsAt is initially empty', () => {
    const handleChange = vi.fn()
    render(
      <SmartEventTimePicker
        startsAt=""
        endsAt=""
        onChange={handleChange}
        eventType="MEETING"
      />
    )

    fireEvent.change(screen.getByLabelText('Bắt đầu'), { target: { value: '2026-09-13T08:00' } })
    expect(handleChange).toHaveBeenCalledWith({
      startsAt: '2026-09-13T08:00',
      endsAt: '2026-09-13T09:30', // MEETING recommends 90 mins (1.5h)
    })
  })

  it('preserves existing duration when startsAt is shifted forward', () => {
    const handleChange = vi.fn()
    render(
      <SmartEventTimePicker
        startsAt="2026-09-13T08:00"
        endsAt="2026-09-13T10:00" // 2 hours
        onChange={handleChange}
      />
    )

    fireEvent.change(screen.getByLabelText('Bắt đầu'), { target: { value: '2026-09-13T09:00' } })
    expect(handleChange).toHaveBeenCalledWith({
      startsAt: '2026-09-13T09:00',
      endsAt: '2026-09-13T11:00', // preserved 2 hours!
    })
  })

  it('auto-pushes endsAt forward and preserves duration when startsAt is moved past endsAt', () => {
    const handleChange = vi.fn()
    render(
      <SmartEventTimePicker
        startsAt="2026-09-13T08:00"
        endsAt="2026-09-13T09:00"
        onChange={handleChange}
        eventType="FEAST_DAY"
      />
    )

    // Move start past end from 08:00 to 10:00 -> preserves 1h duration to 11:00
    fireEvent.change(screen.getByLabelText('Bắt đầu'), { target: { value: '2026-09-13T10:00' } })
    expect(handleChange).toHaveBeenCalledWith({
      startsAt: '2026-09-13T10:00',
      endsAt: '2026-09-13T11:00',
    })
  })

  it('auto-sets recommended duration when previously in invalid state (endsAt <= startsAt)', () => {
    const handleChange = vi.fn()
    render(
      <SmartEventTimePicker
        startsAt="2026-09-13T10:00"
        endsAt="2026-09-13T09:00" // invalid
        onChange={handleChange}
        eventType="FEAST_DAY"
      />
    )

    fireEvent.change(screen.getByLabelText('Bắt đầu'), { target: { value: '2026-09-13T11:00' } })
    expect(handleChange).toHaveBeenCalledWith({
      startsAt: '2026-09-13T11:00',
      endsAt: '2026-09-13T13:00', // FEAST_DAY recommended +2h
    })
  })

  it('applies quick duration presets (+1 giờ, +2 giờ, Cả ngày) correctly', () => {
    const handleChange = vi.fn()
    render(
      <SmartEventTimePicker
        startsAt="2026-09-13T08:00"
        endsAt="2026-09-13T09:00"
        onChange={handleChange}
      />
    )

    // Click +2 giờ
    fireEvent.click(screen.getByRole('button', { name: /\+2 giờ/ }))
    expect(handleChange).toHaveBeenCalledWith({
      startsAt: '2026-09-13T08:00',
      endsAt: '2026-09-13T10:00',
    })

    // Click Cả ngày
    fireEvent.click(screen.getByRole('button', { name: /Cả ngày/ }))
    expect(handleChange).toHaveBeenCalledWith({
      startsAt: '2026-09-13T07:00',
      endsAt: '2026-09-13T17:00',
    })
  })

  it('displays error alert and quick-fix button when endsAt <= startsAt', () => {
    const handleChange = vi.fn()
    render(
      <SmartEventTimePicker
        startsAt="2026-09-13T10:00"
        endsAt="2026-09-13T08:00"
        onChange={handleChange}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Giờ kết thúc phải sau giờ bắt đầu.')
    const fixButton = screen.getByRole('button', { name: 'Đặt lại +2 giờ' })
    expect(fixButton).toBeInTheDocument()

    fireEvent.click(fixButton)
    expect(handleChange).toHaveBeenCalledWith({
      startsAt: '2026-09-13T10:00',
      endsAt: '2026-09-13T12:00',
    })
  })

  it('applies quick date presets (Hôm nay, Chúa Nhật này, Thứ Bảy này)', () => {
    const handleChange = vi.fn()
    render(
      <SmartEventTimePicker
        startsAt=""
        endsAt=""
        onChange={handleChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Chúa Nhật này' }))
    expect(handleChange).toHaveBeenCalled()
    const lastCall = handleChange.mock.calls[0][0]
    expect(lastCall.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T08:00$/)
    expect(lastCall.endsAt).toMatch(/^\d{4}-\d{2}-\d{2}T10:00$/)
  })

  it('toggles "Thời gian" switch between specific time and all-day mode', () => {
    const handleChange = vi.fn()
    render(
      <SmartEventTimePicker
        startsAt="2026-09-13T08:00"
        endsAt="2026-09-13T10:00"
        onChange={handleChange}
      />
    )

    const timeSwitch = screen.getByRole('switch', { name: 'Bật tắt thời gian' })
    expect(timeSwitch).toHaveAttribute('aria-checked', 'true')

    // Turn OFF time -> switches to All-Day mode
    fireEvent.click(timeSwitch)
    expect(handleChange).toHaveBeenCalledWith({
      startsAt: '2026-09-13T07:00',
      endsAt: '2026-09-13T17:00',
    })

    // Turn ON time -> switches back to Specific Time
    fireEvent.click(timeSwitch)
    expect(handleChange).toHaveBeenCalledWith({
      startsAt: '2026-09-13T08:00',
      endsAt: '2026-09-13T10:00',
    })
  })

  it('toggles "Ngày kết thúc" switch to lock to same-day or enable multi-day', () => {
    const handleChange = vi.fn()
    render(
      <SmartEventTimePicker
        startsAt="2026-09-13T08:00"
        endsAt="2026-09-15T10:00" // different day
        onChange={handleChange}
      />
    )

    const endDateSwitch = screen.getByRole('switch', { name: 'Bật tắt ngày kết thúc' })
    expect(endDateSwitch).toHaveAttribute('aria-checked', 'true')

    // Turn OFF Ngày kết thúc -> forces same-day!
    fireEvent.click(endDateSwitch)
    expect(handleChange).toHaveBeenCalledWith({
      startsAt: '2026-09-13T08:00',
      endsAt: '2026-09-13T10:00', // locked to 2026-09-13!
    })
  })

  it('handles single-day all-day event when both toggles are turned off', () => {
    const handleChange = vi.fn()
    render(
      <SmartEventTimePicker
        startsAt="2026-09-13T08:00"
        endsAt="2026-09-13T10:00"
        onChange={handleChange}
        defaultHasTime={false}
        defaultHasEndDate={false}
      />
    )

    expect(screen.getByText(/Sự kiện 1 ngày trọn vẹn/)).toBeInTheDocument()
    expect(screen.getByLabelText('Bắt đầu')).toBeInTheDocument()
  })
})
