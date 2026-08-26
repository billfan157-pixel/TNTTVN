import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import { api, isAuthenticated } from '../lib/api'
import { DEFAULT_GRADE_WEIGHTS, type GradeWeightsConfig } from '../utils/grades'

export interface AttendancePolicyConfig {
  excusedWeight: number
  minRateForExam: number
}

export interface PromotionPolicyConfig {
  minGpa: number
  minAttendance: number
}

export interface ParishSettings {
  parishName: string
  dioceseName: string
  gradeWeights: GradeWeightsConfig
  attendancePolicy: AttendancePolicyConfig
  promotionPolicy: PromotionPolicyConfig
  /** Giờ Thánh Lễ Thiếu Nhi Chúa Nhật (HH:MM) — nguồn cho useSundayReminder. */
  sundayMassTime: string
  academicYear: string
  currentSemester: 1 | 2
}

const DEFAULT_SETTINGS: ParishSettings = {
  parishName: 'Giáo Xứ Gia Tôn',
  dioceseName: 'Giáo Phận Xuân Lộc',
  gradeWeights: DEFAULT_GRADE_WEIGHTS,
  attendancePolicy: { excusedWeight: 1.0, minRateForExam: 80 },
  promotionPolicy: { minGpa: 5.0, minAttendance: 80 },
  sundayMassTime: '08:00',
  academicYear: '2025-2026',
  currentSemester: 1,
}

interface SettingsState {
  settings: ParishSettings
  isLoading: boolean
  error: string | null
  fetchSettings: () => Promise<void>
  updateSettings: (partial: Partial<ParishSettings>) => Promise<boolean>
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      isLoading: false,
      error: null,

      fetchSettings: async () => {
        if (!isAuthenticated()) return
        set({ isLoading: true, error: null })
        try {
          const res = await api.getSettings()
          if (res) {
            set({
              settings: {
                ...DEFAULT_SETTINGS,
                ...res,
                gradeWeights: { ...DEFAULT_SETTINGS.gradeWeights, ...res.gradeWeights },
                attendancePolicy: { ...DEFAULT_SETTINGS.attendancePolicy, ...res.attendancePolicy },
                promotionPolicy: { ...DEFAULT_SETTINGS.promotionPolicy, ...res.promotionPolicy },
              },
              isLoading: false,
            })
          }
        } catch (err: any) {
          set({ isLoading: false, error: err.message || 'Lỗi tải cấu hình' })
        }
      },

      updateSettings: async (partial) => {
        set({ isLoading: true, error: null })
        try {
          const res = await api.updateSettings(partial as Record<string, unknown>)
          if (res) {
            const nextSettings: ParishSettings = {
              ...get().settings,
              ...res,
              gradeWeights: { ...get().settings.gradeWeights, ...res.gradeWeights },
              attendancePolicy: { ...get().settings.attendancePolicy, ...res.attendancePolicy },
              promotionPolicy: { ...get().settings.promotionPolicy, ...res.promotionPolicy },
            }
            set({ settings: nextSettings, isLoading: false })
            return true
          }
          return false
        } catch (err: any) {
          set({ isLoading: false, error: err.message || 'Lỗi cập nhật cấu hình' })
          return false
        }
      },
    }),
    {
      name: 'parish_store_settings',
      storage: createJSONStorage(() => dexieStorage),
    }
  )
)
