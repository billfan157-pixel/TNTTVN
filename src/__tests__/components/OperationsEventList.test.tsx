import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationsEventList } from '../../components/operations/OperationsEventList'
import { formatEventSchedule } from '../../components/operations/operationsViewHelpers'
import type { OperationEvent } from '../../lib/api/operations'

const selectEvent = vi.fn().mockResolvedValue(undefined)
const searchEvents = vi.fn().mockResolvedValue(undefined)
const loadMoreEvents = vi.fn().mockResolvedValue(undefined)
let online = true
let source: 'server' | 'cache' | 'none' = 'server'
let events: OperationEvent[] = []

vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => online }))
vi.mock('../../stores/operationsStore', () => {
  const selectState = (selector?: any) => {
    const state = {
      events, source, loading: false, detailLoading: false, eventTotal: events.length, eventHasMore: false,
      creationOptions: null, eventQuery: '', selectEvent, loadMoreEvents, searchEvents,
    }
    return typeof selector === 'function' ? selector(state) : state
  }
  const useOperationsStore = Object.assign(
    (selector?: any) => selectState(selector),
    { setState: vi.fn(), getState: () => selectState() },
  )
  return { useOperationsStore }
})

const buildEvent = (overrides: Partial<OperationEvent> & { id: string }): OperationEvent => ({
  parishId: 'parish-a',
  title: 'Sự kiện',
  eventType: 'MEETING',
  startsAt: '2026-10-01T08:00:00Z',
  endsAt: '2026-10-01T10:00:00Z',
  timezone: 'Asia/Ho_Chi_Minh',
  status: 'PLANNING',
  visibility: 'INTERNAL',
  version: 1,
  ...overrides,
})

beforeEach(() => {
  online = true
  source = 'server'
  events = []
  selectEvent.mockClear()
  searchEvents.mockClear()
  loadMoreEvents.mockClear()
})

describe('OperationsEventList event-type windows (U-19)', () => {
  it('renders one window per event type, leading with the soonest event', () => {
    const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
    events = [
      buildEvent({ id: 'E1', title: 'Họp Ban Truyền thông', eventType: 'MEETING', startsAt: at(1), endsAt: at(1.2) }),
      buildEvent({ id: 'E2', title: 'Trại hè Ngành Thiếu', eventType: 'CAMP', startsAt: at(2), endsAt: at(2.2) }),
      buildEvent({ id: 'E3', title: 'Trại hè Ngành Nghĩa', eventType: 'CAMP', startsAt: at(10), endsAt: at(10.2) }),
      buildEvent({ id: 'E4', title: 'Sự kiện di sản', eventType: 'LEGACY_CODE', startsAt: at(5), endsAt: at(5.2) }),
    ]
    render(<OperationsEventList />)

    const meeting = screen.getByRole('region', { name: 'Nhóm sự kiện: Họp' })
    const camp = screen.getByRole('region', { name: 'Nhóm sự kiện: Trại / Sa mạc' })
    const other = screen.getByRole('region', { name: 'Nhóm sự kiện: Khác' })

    // U-19b: the window holding the soonest event leads, then the next one.
    expect(meeting.compareDocumentPosition(camp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(camp.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Counts stay per type (2 camps) and legacy codes never disappear.
    expect(within(camp).getByText('2')).toBeInTheDocument()
    expect(within(other).getByText('Sự kiện di sản')).toBeInTheDocument()

    // U-19b: inside a window the nearest event is listed first.
    const near = within(camp).getByText('Trại hè Ngành Thiếu')
    const far = within(camp).getByText('Trại hè Ngành Nghĩa')
    expect(near.compareDocumentPosition(far) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Types without rows render no window at all.
    expect(screen.queryByRole('region', { name: 'Nhóm sự kiện: Lễ / Bổn mạng' })).not.toBeInTheDocument()
  })

  it('shows the scheduled window and countdown on each row', () => {
    const startsAt = new Date(Date.now() + 5 * 86_400_000).toISOString()
    const endsAt = new Date(Date.now() + 5.25 * 86_400_000).toISOString()
    events = [buildEvent({ id: 'E1', title: 'Họp chuẩn bị', eventType: 'MEETING', startsAt, endsAt })]
    render(<OperationsEventList />)

    expect(screen.getByText(formatEventSchedule(startsAt, endsAt, 'Asia/Ho_Chi_Minh'))).toBeInTheDocument()
    expect(screen.getByText(/Còn \d+ ngày/)).toBeInTheDocument()
  })

  it('shows who created the event next to who is responsible for it', () => {
    events = [buildEvent({
      id: 'E1', title: 'Lễ Khai Giảng', eventType: 'FEAST_DAY',
      createdByName: 'Trưởng Xứ đoàn', organizerName: 'Ban Phụng vụ',
    })]
    render(<OperationsEventList />)

    const window = screen.getByRole('region', { name: 'Nhóm sự kiện: Lễ / Bổn mạng' })
    expect(window).toHaveTextContent('Người tạo: Trưởng Xứ đoàn')
    expect(window).toHaveTextContent('Phụ trách: Ban Phụng vụ')
  })

  it('omits the creator line when the server could not resolve a name', () => {
    events = [buildEvent({ id: 'E1', title: 'Sự kiện cũ', eventType: 'OTHER' })]
    render(<OperationsEventList />)

    expect(screen.getByText('Sự kiện cũ')).toBeInTheDocument()
    expect(screen.queryByText(/Người tạo:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Phụ trách:/)).not.toBeInTheDocument()
  })

  it('keeps the archive tab working with the same per-type windows', () => {
    events = [buildEvent({ id: 'E1', title: 'Sự kiện đã hủy', eventType: 'RETREAT', status: 'CANCELLED' })]
    render(<OperationsEventList />)

    fireEvent.click(screen.getByRole('button', { name: /Lưu trữ/ }))

    const window = screen.getByRole('region', { name: 'Nhóm sự kiện: Tĩnh tâm' })
    expect(within(window).getByText('Sự kiện đã hủy')).toBeInTheDocument()
    expect(within(window).getByRole('button', { name: 'Xem & Khôi phục' })).toBeInTheDocument()
  })

  it('opens the event detail from a row inside its type window', () => {
    events = [buildEvent({ id: 'E9', title: 'Tĩnh tâm Ban Huynh Trưởng', eventType: 'RETREAT' })]
    render(<OperationsEventList />)

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }))
    expect(selectEvent).toHaveBeenCalledWith('E9')
  })
})