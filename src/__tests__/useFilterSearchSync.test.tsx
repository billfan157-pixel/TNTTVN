import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFilterSearchSync } from '../stores/useFilterSearchSync'
import { useFilterStore } from '../stores/filterStore'

const routerState = vi.hoisted(() => ({
  pathname: '/grades',
  search: '',
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) => select({
    location: { pathname: routerState.pathname, search: routerState.search },
  }),
  useNavigate: () => routerState.navigate,
}))

function Probe() {
  useFilterSearchSync()
  return null
}

describe('useFilterSearchSync canonical URL contract', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    routerState.pathname = '/grades'
    routerState.search = ''
    routerState.navigate.mockReset()
    window.history.replaceState({}, '', '/grades')
    useFilterStore.setState({
      selectedClassId: 'all',
      selectedBranchId: 'all',
      selectedSemester: 1,
      searchQuery: '',
    })
  })

  it('rejects and removes an invalid semester instead of injecting it into typed filter state', () => {
    useFilterStore.setState({ selectedSemester: 2 })
    routerState.search = '?semester=7'
    window.history.replaceState({}, '', '/grades?semester=7')
    render(<Probe />)

    expect(useFilterStore.getState().selectedSemester).toBe(1)
    expect(routerState.navigate).toHaveBeenCalledWith({
      to: '/grades',
      search: {},
      replace: true,
    })
  })

  it('hydrates missing URL filters as canonical defaults instead of retaining persisted state', () => {
    useFilterStore.setState({ selectedClassId: 'cl-stale', selectedSemester: 2 })
    render(<Probe />)

    expect(useFilterStore.getState().selectedClassId).toBe('all')
    expect(useFilterStore.getState().selectedSemester).toBe(1)
    expect(routerState.navigate).not.toHaveBeenCalled()
  })

  it('navigates when resetting the last non-default query parameter', () => {
    routerState.search = '?semester=2'
    window.history.replaceState({}, '', '/grades?semester=2')
    render(<Probe />)
    expect(useFilterStore.getState().selectedSemester).toBe(2)

    act(() => {
      useFilterStore.getState().setSelectedSemester(1)
      vi.runAllTimers()
    })

    expect(routerState.navigate).toHaveBeenCalledWith({
      to: '/grades',
      search: {},
      replace: true,
    })
  })
})
