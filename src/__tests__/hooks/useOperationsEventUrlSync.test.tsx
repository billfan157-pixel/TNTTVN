import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOperationsEventUrlSync, type OperationsEventModalTab } from '../../hooks/useOperationsEventUrlSync'

let selectedEvent: { event: { id: string } } | null = null
const selectEvent = vi.fn()
const mockNavigate = vi.fn()
let operationsSearch: { event?: string; tab?: string } = {}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => operationsSearch,
}))
vi.mock('../../stores/operationsStore', () => ({
  useOperationsStore: (selector?: any) => selector({ selectedEvent, detailLoading: false, selectEvent }),
}))

describe('useOperationsEventUrlSync tab race (W2.2-fix)', () => {
  beforeEach(() => {
    selectedEvent = { event: { id: 'E1' } }
    operationsSearch = { event: 'E1', tab: 'workstreams' }
    mockNavigate.mockClear()
  })

  it('honors ?tab= on arrival but never reverts a later manual tab switch', () => {
    const applyUrlTab = vi.fn()
    const { rerender } = renderHook(
      ({ tab }: { tab: OperationsEventModalTab }) => useOperationsEventUrlSync(tab, applyUrlTab),
      // Page default is 'tasks'; the deep-link must drive the first switch.
      { initialProps: { tab: 'tasks' as OperationsEventModalTab } },
    )
    // Initial deep-link is honored exactly once.
    expect(applyUrlTab).toHaveBeenCalledTimes(1)
    expect(applyUrlTab).toHaveBeenCalledWith('workstreams')

    // Parent applies the honored tab, then the user switches away manually
    // while the URL still holds the old tab: the stale URL value must not
    // drag the UI back (the pre-fix race reverted this).
    rerender({ tab: 'workstreams' as const })
    expect(applyUrlTab).toHaveBeenCalledTimes(1)
    rerender({ tab: 'tasks' as const })
    expect(applyUrlTab).toHaveBeenCalledTimes(1)

    // A genuinely new deep-link tab still applies.
    operationsSearch = { event: 'E1', tab: 'reminders' }
    rerender({ tab: 'tasks' as const })
    expect(applyUrlTab).toHaveBeenCalledWith('reminders')
  })
})
