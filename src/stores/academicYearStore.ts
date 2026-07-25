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
  academicYears: [],
  currentYear: '',
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
