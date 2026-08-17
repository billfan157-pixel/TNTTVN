import React from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ViewMode } from '../types'
import { dexieStorage } from '../lib/db'

interface FilterState {
  selectedClassId: string
  selectedBranchId: string
  searchQuery: string
  selectedSemester: 1 | 2
  viewMode: ViewMode
  setSelectedClassId: (id: string) => void
  setSelectedBranchId: (branch: string) => void
  setSearchQuery: (query: string) => void
  setSelectedSemester: (sem: 1 | 2) => void
  setViewMode: (mode: ViewMode) => void
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      selectedClassId: 'all',
      selectedBranchId: 'all',
      searchQuery: '',
      selectedSemester: 1,
      viewMode: 'auto',

      setSelectedClassId: (id) => set({ selectedClassId: id }),
      setSelectedBranchId: (branch) => set({ selectedBranchId: branch }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedSemester: (sem) => set({ selectedSemester: sem }),
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    { name: 'parish_store_filters', storage: createJSONStorage(() => dexieStorage) }
  )
)
