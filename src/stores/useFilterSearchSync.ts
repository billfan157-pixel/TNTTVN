import { useEffect, useRef } from 'react'
import { useRouterState, useNavigate } from '@tanstack/react-router'
import { useFilterStore } from './filterStore'

export interface FilterSearchParams {
  classId?: string
  branchId?: string
  semester?: string
  search?: string
}

export function useFilterSearchSync() {
  const searchValue = useRouterState({ select: s => s.location.search })
  const routerSearchStr = useRouterState({ select: s => s.location.searchStr })
  const searchStr = typeof routerSearchStr === 'string'
    ? routerSearchStr
    : typeof searchValue === 'string'
    ? searchValue
    : (() => {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(searchValue || {})) {
          if (value !== undefined && value !== null) params.set(key, String(value))
        }
        const query = params.toString()
        return query ? `?${query}` : ''
      })()
  const pathname = useRouterState({ select: s => s.location.pathname })
  const navigate = useNavigate()
  // Hydrate deep-linked filters on the first mount as well as later navigation.
  // Initializing with searchStr skipped the first effect, so a reload at
  // /students?classId=... silently reset the visible roster to "all".
  const urlRef = useRef<string | null>(null)
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const applyingUrlRef = useRef(false)

  useEffect(() => {
    if (searchStr === urlRef.current) return
    urlRef.current = searchStr
    const params = new URLSearchParams(searchStr)
    const store = useFilterStore.getState()
    const classId = params.get('classId')
    const branchId = params.get('branchId')
    const semester = params.get('semester')
    const search = params.get('search')
    const supportsClass = pathname === '/students' || pathname === '/grades' || pathname === '/attendance'
    const supportsSemester = pathname === '/students' || pathname === '/grades'

    applyingUrlRef.current = true
    try {
      if (supportsClass) {
        const nextClassId = classId || 'all'
        if (nextClassId !== store.selectedClassId) store.setSelectedClassId(nextClassId)
      }
      if (pathname === '/students') {
        const nextBranchId = branchId || 'all'
        if (nextBranchId !== store.selectedBranchId) store.setSelectedBranchId(nextBranchId)
      }
      if (supportsSemester) {
        const nextSemester = semester === '2' ? 2 : 1
        if (nextSemester !== store.selectedSemester) store.setSelectedSemester(nextSemester)
      }
      if (pathname === '/students') {
        const nextSearch = search || ''
        if (nextSearch !== store.searchQuery) store.setSearchQuery(nextSearch)
      }
    } finally {
      applyingUrlRef.current = false
    }

    // The route schema rejects invalid semester values, but browser URL text is
    // independent from the parsed object. Remove the rejected value explicitly
    // so reload/back-forward cannot resurrect a non-canonical deep link.
    if (supportsSemester && semester !== null && semester !== '1' && semester !== '2') {
      params.delete('semester')
      const canonicalSearch = params.toString()
      urlRef.current = canonicalSearch ? `?${canonicalSearch}` : ''
      navigate({ to: pathname, search: Object.fromEntries(params), replace: true })
    }
  }, [navigate, pathname, searchStr])

  useEffect(() => {
    const unsub = useFilterStore.subscribe((state, prev) => {
      if (applyingUrlRef.current) return
      if (pendingRef.current) clearTimeout(pendingRef.current)

      // Only sync filterStore to URL on routes that support class/branch/search filters
      const supportedRoutes = ['/students', '/grades', '/attendance']
      if (!supportedRoutes.some(r => pathname === r || pathname.startsWith(`${r}/`))) {
        return
      }

      const params = new URLSearchParams(window.location.search)

      let changed = false
      if (state.selectedClassId !== prev.selectedClassId) {
        if (state.selectedClassId === 'all') params.delete('classId')
        else params.set('classId', state.selectedClassId)
        changed = true
      }
      if (pathname === '/students' && state.selectedBranchId !== prev.selectedBranchId) {
        if (state.selectedBranchId === 'all') params.delete('branchId')
        else params.set('branchId', state.selectedBranchId)
        changed = true
      }
      if ((pathname === '/students' || pathname === '/grades') && state.selectedSemester !== prev.selectedSemester) {
        if (state.selectedSemester === 1) params.delete('semester')
        else params.set('semester', String(state.selectedSemester))
        changed = true
      }
      if (pathname === '/students' && state.searchQuery !== prev.searchQuery) {
        if (state.searchQuery) params.set('search', state.searchQuery)
        else params.delete('search')
        changed = true
      }

      if (!changed) return

      const delay = state.searchQuery !== prev.searchQuery ? 400 : 0
      pendingRef.current = setTimeout(() => {
        const qs = params.toString()
        const newSearch = qs ? `?${qs}` : ''
        urlRef.current = newSearch
        navigate({ to: pathname, search: Object.fromEntries(params), replace: true })
      }, delay)
    })
    return () => {
      unsub()
      if (pendingRef.current) clearTimeout(pendingRef.current)
    }
  }, [navigate, pathname])
}
