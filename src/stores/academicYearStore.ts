import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import { api, isAuthenticated } from '../lib/api'
import { getCurrentAcademicYear, normalizeAcademicYear, resolveActiveAcademicYear } from '../utils/academicYear'

export interface AcademicYearItem {
  id: string
  startDate: string
  endDate: string
  isLocked: number
  /** Học kỳ đang mở (1|2) — SSOT từ server (academic_years.current_semester). */
  currentSemester?: number
}

interface AcademicYearState {
  academicYears: AcademicYearItem[]
  currentYear: string
  isLoading: boolean
  error: string | null
  fetchAcademicYears: () => Promise<void>
  setCurrentYear: (year: string) => void
  /** Tạo năm học mới — chỉ chuyển active sau acknowledgement authoritative từ server. */
  createAcademicYear: (year: string) => Promise<void>
  /** ADR-017: Năm học hoạt động hợp lệ ('YYYY-YYYY', không bao giờ rỗng). */
  resolveActiveYear: () => string
  /** ADR-017: Range ngày của năm học (ưu tiên academic_years từ server, fallback chuẩn tháng 8). */
  getYearRange: (academicYear?: string) => { startDate: string; endDate: string }
}

export const useAcademicYearStore = create<AcademicYearState>()(
  persist(
    (set, get) => ({
      academicYears: [],
      currentYear: '',
      isLoading: false,
      error: null,

      fetchAcademicYears: async () => {
        if (!isAuthenticated()) {
          // ADR-016 (sync-fix): Không có token (offline) cũng seed currentYear —
          // mọi producer khác (DesktopGradeMatrix, báo cáo) đọc raw currentYear;
          // nếu để '' → payload sync gửi academicYear: "" → server 400 cả batch.
          if (!get().currentYear) set({ currentYear: getCurrentAcademicYear() })
          return
        }
        set({ isLoading: true, error: null })
        try {
          const years = await api.getClassAcademicYears()
          if (Array.isArray(years) && years.length > 0) {
            // ADR-017: Auto-seed currentYear khi chưa chọn — nếu không, mọi báo
            // cáo (in ấn, Excel, dashboard) khớp exact-match với year rỗng → rỗng
            // dữ liệu. Ưu tiên năm học hiện tại theo ngày, nếu không có thì năm đầu.
            const existingYear = normalizeAcademicYear(get().currentYear)
            const activeYear = getCurrentAcademicYear()
            const match = years.find((y) => normalizeAcademicYear(y.id) === activeYear)
            const seed = existingYear
              ? years.find((y) => normalizeAcademicYear(y.id) === existingYear)?.id || get().currentYear
              : match?.id || years[0].id
            set({ academicYears: years, currentYear: seed, isLoading: false })
          } else {
            // ADR-016 (sync-fix): Server chưa có năm học nào → seed mặc định để
            // currentYear không rỗng (matrix sync không gửi academicYear: "").
            if (!get().currentYear) set({ currentYear: getCurrentAcademicYear() })
            set({ isLoading: false })
          }
        } catch {
          if (!get().currentYear) set({ currentYear: getCurrentAcademicYear() })
          set({ isLoading: false })
        }
      },

      setCurrentYear: (year: string) => set({ currentYear: year }),

      // Academic-year creation has no durable offline command contract. Selection
      // and creation are separate actions: never announce/create local authority
      // until the server has acknowledged the authoritative row.
      createAcademicYear: async (year: string) => {
        const normId = normalizeAcademicYear(year) || year
        if (!isAuthenticated()) {
          throw new Error('Cần kết nối và đăng nhập để tạo năm học mới')
        }
        const created = await api.createAcademicYear({ id: normId })
        if (!created?.id) throw new Error('Máy chủ không xác nhận năm học vừa tạo')
        set((state) => ({
          currentYear: created.id,
          academicYears: [
            created,
            ...state.academicYears.filter((item) => normalizeAcademicYear(item.id) !== normalizeAcademicYear(created.id)),
          ] as AcademicYearItem[],
        }))
      },

      resolveActiveYear: () => resolveActiveAcademicYear(get().currentYear),

      getYearRange: (academicYear?: string) => {
        const year = normalizeAcademicYear(academicYear || get().currentYear) || getCurrentAcademicYear()
        const ay = get().academicYears.find((a) => normalizeAcademicYear(a.id) === year)
        if (ay?.startDate && ay?.endDate) {
          return { startDate: ay.startDate, endDate: ay.endDate }
        }
        const fallback = resolveActiveAcademicYear(year)
        const [startYear, endYear] = fallback.split('-').map((n) => parseInt(n, 10))
        if (!startYear || !endYear || endYear !== startYear + 1) {
          return { startDate: '2000-01-01', endDate: '2099-12-31' }
        }
        return { startDate: `${startYear}-08-01`, endDate: `${endYear}-07-31` }
      },
    }),
    {
      name: 'parish_store_academic_year',
      storage: createJSONStorage(() => dexieStorage),
    }
  )
)
