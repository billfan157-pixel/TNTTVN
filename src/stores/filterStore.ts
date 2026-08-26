import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ViewMode } from '../types'
import { dexieStorage } from '../lib/db'
import { readBootUI, writeBootUI } from '../lib/uiBoot'

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
      // PHA 2 (audit A3): đọc mirror đồng bộ lúc khởi tạo — IndexedDB rehydrate
      // async khiến first render dùng 'auto' dù user đã chọn desktop/mobile.
      viewMode: readBootUI().viewMode ?? 'auto',

      setSelectedClassId: (id) => set({ selectedClassId: id }),
      setSelectedBranchId: (branch) => set({ selectedBranchId: branch }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedSemester: (sem) => set({ selectedSemester: sem }),
      setViewMode: (mode) => {
        writeBootUI({ viewMode: mode })
        set({ viewMode: mode })
      },
    }),
    {
      name: 'parish_store_filters',
      storage: createJSONStorage(() => dexieStorage),
      // PHA 2: đồng bộ mirror sau rehydrate (che khoảng trống nếu mirror bị mất)
      onRehydrateStorage: () => (state) => {
        if (state?.viewMode) writeBootUI({ viewMode: state.viewMode })
      },
    }
  )
)
