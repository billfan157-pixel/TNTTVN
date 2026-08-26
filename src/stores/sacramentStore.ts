import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import type { BranchType, Student } from '../types'
import { getAcademicYear, getBranchForAge, getAge } from '../utils/sacraments'

interface PromotionSuggestion {
  studentId: string
  studentName: string
  currentBranch: BranchType
  suggestedBranch: BranchType | null
  reason: string
}

interface SacramentState {
  promotionQueue: PromotionSuggestion[]
  academicYear: string
  suggestPromotions: (students: Student[]) => void
  clearPromotion: (studentId: string) => void
  runAutoPromotion: (students: Student[], promoteIds: string[]) => Student[]
}

export const useSacramentStore = create<SacramentState>()(
  persist(
    (set, _get) => ({
      promotionQueue: [],
      academicYear: getAcademicYear(),

      suggestPromotions: (students) => {
        const suggestions: PromotionSuggestion[] = []
        for (const s of students) {
          if (s.status !== 'Đang học') continue
          const age = getAge(s.dateOfBirth)
          const ageBranch = getBranchForAge(age)
          if (ageBranch && ageBranch !== s.branch) {
            suggestions.push({
              studentId: s.id,
              studentName: s.fullName,
              currentBranch: s.branch,
              suggestedBranch: ageBranch,
              reason: `Đã ${age} tuổi — phù hợp ngành ${ageBranch}`,
            })
          }
        }
        set({ promotionQueue: suggestions })
      },

      clearPromotion: (studentId) => {
        set((state) => ({
          promotionQueue: state.promotionQueue.filter(p => p.studentId !== studentId)
        }))
      },

      runAutoPromotion: (students, promoteIds) => {
        return students.map((s) => {
          if (!promoteIds.includes(s.id)) return s
          const age = getAge(s.dateOfBirth)
          const ageBranch = getBranchForAge(age)
          if (!ageBranch) return s
          return { ...s, branch: ageBranch, classId: '' }
        })
      },
    }),
    {
      name: 'parish_store_sacrament',
      storage: createJSONStorage(() => dexieStorage),
    }
  )
)
