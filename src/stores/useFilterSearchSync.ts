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
  const searchStr = useRouterState({ select: s => s.location.search })
  const pathname = useRouterState({ select: s => s.location.pathname })
  const navigate = useNavigate()
  const urlRef = useRef(searchStr)
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (searchStr === urlRef.current) return
    urlRef.current = searchStr
    const params = new URLSearchParams(searchStr)
    const store = useFilterStore.getState()
    const classId = params.get('classId')
    const branchId = params.get('branchId')
    const semester = params.get('semester')
    const search = params.get('search')

    if (classId && classId !== store.selectedClassId) store.setSelectedClassId(classId)
    if (branchId && branchId !== store.selectedBranchId) store.setSelectedBranchId(branchId)
    if (semester) {
      const sem = Number(semester) as 1 | 2
      if (sem !== store.selectedSemester) store.setSelectedSemester(sem)
    }
    if (search !== null && search !== store.searchQuery) store.setSearchQuery(search)
  }, [searchStr])

  useEffect(() => {
    const unsub = useFilterStore.subscribe((state, prev) => {
      if (pendingRef.current) clearTimeout(pendingRef.current)
      const params = new URLSearchParams(window.location.search)

      let changed = false
      if (state.selectedClassId !== prev.selectedClassId) {
        if (state.selectedClassId === 'all') params.delete('classId')
        else { params.set('classId', state.selectedClassId); changed = true }
      }
      if (state.selectedBranchId !== prev.selectedBranchId) {
        if (state.selectedBranchId === 'all') params.delete('branchId')
        else { params.set('branchId', state.selectedBranchId); changed = true }
      }
      if (state.selectedSemester !== prev.selectedSemester) {
        if (state.selectedSemester === 1) params.delete('semester')
        else { params.set('semester', String(state.selectedSemester)); changed = true }
      }
      if (state.searchQuery !== prev.searchQuery) {
        if (state.searchQuery) { params.set('search', state.searchQuery); changed = true }
        else params.delete('search')
      }

      if (!changed && !params.toString()) return

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
