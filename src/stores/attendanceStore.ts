import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import type { AttendanceRecord } from '../types'
import { calculateAttendanceRate } from '../utils/grades'
import * as syncService from '../lib/syncService'
import { api } from '../lib/api'
import * as Sentry from '@sentry/react'

interface AttendanceState {
  attendance: AttendanceRecord[]
  setAttendance: (attendance: AttendanceRecord[]) => void
  fetchAttendance: () => Promise<void>
  saveAttendance: (
    studentId: string, date: string, type: 'SundayMass' | 'CatechismClass',
    status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused', note?: string
  ) => void
  batchSaveAttendance: (
    records: { studentId: string; status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'; note?: string }[],
    date: string, type: 'SundayMass' | 'CatechismClass'
  ) => void
  getStudentAttendanceRate: (studentId: string) => { rate: number; presentCount: number; totalCount: number }
}

export const useAttendanceStore = create<AttendanceState>()(
  persist(
    (set, get) => ({
      attendance: [],
      setAttendance: (attendance) => set({ attendance }),

      fetchAttendance: async () => {
        try {
          const fetched = await api.getAttendance()
          if (Array.isArray(fetched)) {
            set({ attendance: fetched })
          }
        } catch (err) {
          Sentry.captureException(err)
        }
      },

      saveAttendance: (studentId, date, type, status, note) => set((state) => {
        const existingIdx = state.attendance.findIndex(a => a.studentId === studentId && a.date === date && a.type === type)
        if (existingIdx >= 0) {
          const updated = [...state.attendance]
          updated[existingIdx] = { ...updated[existingIdx], status, note }
          syncService.syncSaveAttendance(updated[existingIdx] as unknown as Record<string, unknown>)
          return { attendance: updated }
        }
        const record: AttendanceRecord = {
          id: `AT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          studentId, date, type, status, note,
        }
        syncService.syncSaveAttendance(record as unknown as Record<string, unknown>)
        return { attendance: [...state.attendance, record] }
      }),

      batchSaveAttendance: (records, date, type) => set((state) => {
        const updated = [...state.attendance]
        for (const r of records) {
          const existingIdx = updated.findIndex(a => a.studentId === r.studentId && a.date === date && a.type === type)
          if (existingIdx >= 0) {
            updated[existingIdx] = { ...updated[existingIdx], status: r.status, note: r.note }
          } else {
            updated.push({
              id: `AT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              studentId: r.studentId, date, type, status: r.status, note: r.note,
            })
          }
        }
        syncService.syncBatchSaveAttendance(date, type, records)
        return { attendance: updated }
      }),

      getStudentAttendanceRate: (studentId) => {
        const records = get().attendance.filter(a => a.studentId === studentId)
        return calculateAttendanceRate(
          records.filter(a => a.status === 'Present').length,
          records.length
        )
      },
    }),
    {
      name: 'parish_store_attendance',
      storage: createJSONStorage(() => dexieStorage),
    }
  )
)

export { calculateAttendanceRate }
