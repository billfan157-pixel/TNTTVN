import { create } from 'zustand'
import { api } from '../lib/api'

export interface AcademicYearItem {
  id: string
  name: string
  startDate: string
  endDate: string
  isLocked: boolean
}

interface AcademicYearState {
  academicYears: AcademicYearItem[]
  currentYear: string
  isLoading: boolean
  error: string | null
  fetchAcademicYears: () => Promise<void>
  setCurrentYear: (year: string) => void
}

export const useAcademicYearStore = create<AcademicYearState>((set) => ({
  academicYears: [
    { id: '2025 - 2026', name: 'Năm Học 2025 - 2026', startDate: '2025-09-01', endDate: '2026-06-30', isLocked: false },
    { id: '2024 - 2025', name: 'Năm Học 2024 - 2025', startDate: '2024-09-01', endDate: '2025-06-30', isLocked: true },
  ],
  currentYear: '2025 - 2026',
  isLoading: false,
  error: null,

  fetchAcademicYears: async () => {
    set({ isLoading: true, error: null })
    try {
      const years = await api.getClassAcademicYears()
      if (Array.isArray(years) && years.length > 0) {
        set({ academicYears: years, isLoading: false })
      } else {
        set({ isLoading: false })
      }
    } catch {
      set({ isLoading: false })
    }
  },

  setCurrentYear: (year: string) => set({ currentYear: year }),
}))
