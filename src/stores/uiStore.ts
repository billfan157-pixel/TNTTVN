import { create } from 'zustand'
import type { Student } from '../types'

interface UIState {
  isStudentModalOpen: boolean
  studentToEdit: Student | null
  isReportModalOpen: boolean
  studentForReport: Student | null
  isPhotoCardOpen: boolean
  photoCardStudent: Student | null
  isCertificateOpen: boolean
  certificateStudent: Student | null
  certificateType: 'completion' | 'promotion'
  openAddStudent: () => void
  openEditStudent: (student: Student) => void
  closeStudentModal: () => void
  openReport: (student: Student) => void
  closeReport: () => void
  openPhotoCard: (student: Student) => void
  closePhotoCard: () => void
  openCertificate: (student: Student, type?: 'completion' | 'promotion') => void
  closeCertificate: () => void
}

export const useUIStore = create<UIState>((set) => ({
  isStudentModalOpen: false,
  studentToEdit: null,
  isReportModalOpen: false,
  studentForReport: null,
  isPhotoCardOpen: false,
  photoCardStudent: null,
  isCertificateOpen: false,
  certificateStudent: null,
  certificateType: 'completion',

  openAddStudent: () => set({ isStudentModalOpen: true, studentToEdit: null }),
  openEditStudent: (student) => set({ isStudentModalOpen: true, studentToEdit: student }),
  closeStudentModal: () => set({ isStudentModalOpen: false, studentToEdit: null }),

  openReport: (student) => set({ isReportModalOpen: true, studentForReport: student }),
  closeReport: () => set({ isReportModalOpen: false, studentForReport: null }),

  openPhotoCard: (student) => set({ isPhotoCardOpen: true, photoCardStudent: student }),
  closePhotoCard: () => set({ isPhotoCardOpen: false, photoCardStudent: null }),

  openCertificate: (student, type = 'completion') => set({ isCertificateOpen: true, certificateStudent: student, certificateType: type }),
  closeCertificate: () => set({ isCertificateOpen: false, certificateStudent: null }),
}))
