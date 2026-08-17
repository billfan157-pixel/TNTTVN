import React from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage, getDB } from '../lib/db'
import type { AttendanceRecord, AttendanceType } from '../types'
import { calculateAttendanceRate, countAttendancePresent } from '../utils/grades'
import { useAcademicYearStore } from './academicYearStore'
import { useSettingsStore } from './settingsStore'
import { normalizeAcademicYear } from '../utils/academicYear'
import * as syncService from '../lib/syncService'
import { api, isAuthenticated, ApiError } from '../lib/api'
import { attendanceApiClient, BatchAttendanceResponseDTO } from '../lib/api/attendance'
import * as Sentry from '@sentry/react'
import { decryptQueueValue } from '../lib/offlineCipher'

/** Natural key của attendance: studentId:date:type. */
function attendanceNaturalKey(a: { studentId?: string; date?: string; type?: string }): string {
  return `${a.studentId}:${a.date}:${a.type}`
}

/**
 * ADR-016 (offline-sync audit #6): tập natural key của các attendance đang có op
 * pending/retrying — pull incremental KHÔNG đè row local (đang có thay đổi chưa sync).
 */
async function getPendingAttendanceNaturalKeys(): Promise<Set<string>> {
  try {
    const db = getDB()
    const pending = await db.syncQueue.where('status').anyOf(['pending', 'retrying']).toArray()
    const keys = new Set<string>()
    for (const item of pending) {
      if (item.entity !== 'attendance') continue
      try {
        const raw = await decryptQueueValue(item.payload)
        const p = raw !== null ? JSON.parse(raw) : null
        if (p && typeof p.studentId === 'string') keys.add(attendanceNaturalKey(p))
      } catch { /* payload không parse được — bỏ qua */ }
    }
    return keys
  } catch {
    return new Set<string>()
  }
}

// ADR-016 (S1): Lazy import to break the circular dependency:
// attendanceStore → useSyncEngine → router → @tanstack/react-router.
// Importing runSyncFlow at module top-level pulls router.tsx into every test
// that transitively imports attendanceStore, breaking mocks that don't expose
// createRootRoute. Deferring to call-time avoids loading router until sync
// actually runs.
async function triggerSyncFlow() {
  try {
    const { runSyncFlow } = await import('../hooks/useSyncEngine')
    await runSyncFlow()
  } catch {
    // Sync engine not available (e.g. during SSR/test teardown) — the queued
    // op will still be flushed by the periodic interval or online event.
  }
}

interface AttendanceState {
  attendance: AttendanceRecord[]
  error: string | null
  lockError: string | null
  batchResult: BatchAttendanceResponseDTO | null
  isSubmitting: boolean
  setAttendance: (attendance: AttendanceRecord[]) => void
  fetchAttendance: (updatedAfter?: string) => Promise<void>
  saveAttendance: (
    studentId: string, date: string, type: AttendanceType,
    status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused', note?: string,
    skipSync?: boolean,
    serverRecord?: { id: string; status: string; note?: string | null; version?: number }
  ) => Promise<void>
  batchSaveAttendance: (
    records: { studentId: string; status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'; note?: string }[],
    date: string, type: AttendanceType
  ) => Promise<BatchAttendanceResponseDTO | null>
  getStudentAttendanceRate: (studentId: string, academicYear?: string) => { rate: number; presentCount: number; totalCount: number }
  clearErrors: () => void
  clearBatchResult: () => void
}

export const useAttendanceStore = create<AttendanceState>()(
  persist(
    (set, get) => ({
      attendance: [],
      error: null,
      lockError: null,
      batchResult: null,
      isSubmitting: false,
      setAttendance: (attendance) => set({ attendance }),

      fetchAttendance: async (updatedAfter?: string) => {
        if (!isAuthenticated()) return
        try {
          const params = updatedAfter ? { updatedAfter } : undefined
          const fetched = await api.getAttendance(params)
          if (Array.isArray(fetched)) {
            if (updatedAfter) {
              // ADR-016 (offline-sync audit #6): merge theo natural key thay vì id —
              // bản ghi local còn temp AT- id và row server cùng (studentId,date,type)
              // từng thành 2 dòng trùng. Row server là canonical; không đè row đang
              // có op pending (thay đổi chưa sync sẽ áp dụng qua applyServerResult).
              const pendingKeys = await getPendingAttendanceNaturalKeys()
              set((state) => {
                const merged = new Map<string, AttendanceRecord>()
                for (const a of state.attendance) merged.set(attendanceNaturalKey(a), a)
                for (const a of fetched) {
                  const key = attendanceNaturalKey(a)
                  const local = merged.get(key)
                  if (local && pendingKeys.has(key)) continue
                  merged.set(key, a)
                }
                return { attendance: Array.from(merged.values()) }
              })
            } else {
              set({ attendance: fetched })
            }
          }
        } catch (err) {
          Sentry.captureException(err)
          set({ error: (err as Error)?.message || 'Lỗi tải điểm danh' })
        }
      },

      saveAttendance: async (studentId, date, type, status, note, skipSync, serverRecord) => {
        set({ isSubmitting: true, error: null, lockError: null })

        // ADR-016 (S1): Optimistic update applied FIRST so the UI is always
        // responsive, then the operation is enqueued to the sync queue when the
        // device is offline — matching gradeStore/studentStore behavior. Previously
        // the HTTP call was made directly with no sync-queue fallback, which
        // permanently lost offline attendance data.
        const applyLocal = (serverRecord?: { id: string; status: string; note?: string | null; version?: number }) => {
          set((state) => {
            const existingIdx = state.attendance.findIndex(a => a.studentId === studentId && a.date === date && a.type === type)
            const updated = [...state.attendance]
            if (existingIdx >= 0) {
              updated[existingIdx] = {
                ...updated[existingIdx],
                status: (serverRecord?.status as any) || status,
                note: serverRecord ? (serverRecord.note || undefined) : (note || undefined),
                version: serverRecord?.version ?? updated[existingIdx].version,
              }
            } else {
              updated.push({
                id: serverRecord?.id || `AT-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                studentId,
                date,
                type,
                status: (serverRecord?.status as any) || status,
                note: serverRecord ? (serverRecord.note || undefined) : (note || undefined),
                version: serverRecord?.version,
              })
            }
            return { attendance: updated, isSubmitting: false }
          })
        }

        // skipSync=true means the server already applied this record (called from
        // useSyncEngine.applyServerResult) — just update local state, no enqueue.
        if (skipSync) {
          applyLocal(serverRecord)
          return
        }

        // ADR-016 (S21): Kèm version hiện tại (nếu có) — server từ chối nếu ai đó
        // đã sửa bản ghi này ở máy khác, thay vì ghi đè im lặng.
        const existing = get().attendance.find(a => a.studentId === studentId && a.date === date && a.type === type)
        const version = existing?.version

        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
        if (isOffline) {
          // Offline: optimistic update + enqueue to IndexedDB sync queue so the
          // record is retried automatically when connectivity returns.
          applyLocal()
          syncService.syncSaveAttendance({ studentId, date, type, status, note, version })
          void triggerSyncFlow()
          return
        }

        try {
          const res = await attendanceApiClient.markAttendance({ studentId, date, type, status, note, version })
          applyLocal(res)
        } catch (err: any) {
          // Network failure mid-request (not a server validation error): fall back to
          // enqueueing so the offline-entered attendance isn't lost.
          const isNetwork = err instanceof TypeError
            || (err?.message && (String(err.message).includes('Network error') || String(err.message).includes('failed to fetch')))
          if (isNetwork) {
            applyLocal()
            syncService.syncSaveAttendance({ studentId, date, type, status, note, version })
            void triggerSyncFlow()
            return
          }
          const msg = err instanceof ApiError ? err.message : 'Lỗi khi lưu điểm danh'
          if (err instanceof ApiError && err.status === 403) {
            set({ lockError: msg, isSubmitting: false })
          } else {
            set({ error: msg, isSubmitting: false })
          }
        }
      },

      batchSaveAttendance: async (records, date, type) => {
        set({ isSubmitting: true, error: null, lockError: null, batchResult: null })

        // ADR-016 (offline-sync audit #9): trước đây không có nhánh offline/network —
        // toàn bộ sheet điểm danh bị mất khi offline (trả null, không enqueue).
        // Optimistic local + enqueue từng record vào sync queue (engine sẽ batch lại).
        const queueOffline = () => {
          set((state) => {
            const attMap = new Map<string, { record: AttendanceRecord; index: number }>()
            const updated = [...state.attendance]
            for (let i = 0; i < updated.length; i++) {
              attMap.set(attendanceNaturalKey(updated[i]), { record: updated[i], index: i })
            }

            for (const r of records) {
              const key = attendanceNaturalKey({ studentId: r.studentId, date, type })
              const match = attMap.get(key)
              const patch = { status: r.status as any, note: r.note || undefined }
              if (match) {
                const newRec = { ...match.record, ...patch }
                updated[match.index] = newRec
                attMap.set(key, { record: newRec, index: match.index })
              } else {
                const newRec: AttendanceRecord = {
                  id: `AT-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                  studentId: r.studentId, date, type,
                  status: r.status as any, note: r.note || undefined, version: undefined,
                }
                const newIdx = updated.length
                updated.push(newRec)
                attMap.set(key, { record: newRec, index: newIdx })
              }
            }
            return { attendance: updated, isSubmitting: false }
          })
          syncService.syncBatchSaveAttendance(date, type, records)
          void triggerSyncFlow()
          return {
            total: records.length,
            successCount: records.length,
            skippedCount: 0,
            conflictCount: 0,
            errorCount: 0,
            results: records.map(r => ({ studentId: r.studentId, status: 'saved' as const })),
          } satisfies BatchAttendanceResponseDTO
        }

        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
        if (isOffline) return queueOffline()

        try {
          // ADR-016 (S21): Kèm version hiện tại từng record (nếu có) để server
          // phát hiện xung đột multi-device; server-wins khi conflict.
          const currentAttMap = new Map<string, AttendanceRecord>()
          for (const a of get().attendance) {
            currentAttMap.set(attendanceNaturalKey(a), a)
          }

          const withVersion = records.map(r => {
            const key = attendanceNaturalKey({ studentId: r.studentId, date, type })
            const existing = currentAttMap.get(key)
            return existing?.version !== undefined ? { ...r, version: existing.version } : r
          })
          const result = await attendanceApiClient.batchMarkAttendance(withVersion, date, type)
          set((state) => {
            const attMap = new Map<string, { record: AttendanceRecord; index: number }>()
            const updated = [...state.attendance]
            for (let i = 0; i < updated.length; i++) {
              attMap.set(attendanceNaturalKey(updated[i]), { record: updated[i], index: i })
            }

            for (const r of result.results) {
              const key = attendanceNaturalKey({ studentId: r.studentId, date, type })
              const match = attMap.get(key)
              if (r.record) {
                if (match) {
                  const newRec = {
                    ...match.record,
                    status: r.record.status as any,
                    note: r.record.note || undefined,
                    version: r.record.version,
                  }
                  updated[match.index] = newRec
                  attMap.set(key, { record: newRec, index: match.index })
                } else {
                  const newRec: AttendanceRecord = { id: r.record.id, studentId: r.studentId, date, type, status: r.record.status as any, note: r.record.note || undefined, version: r.record.version }
                  const newIdx = updated.length
                  updated.push(newRec)
                  attMap.set(key, { record: newRec, index: newIdx })
                }
              }
            }
            return { attendance: updated, batchResult: result, isSubmitting: false }
          })
          return result
        } catch (err: any) {
          const msg = err instanceof ApiError ? err.message : 'Lỗi khi điểm danh hàng loạt'
          if (err instanceof ApiError && err.status === 403) {
            set({ lockError: msg, isSubmitting: false })
            return null
          }
          // Network failure mid-request: fallback enqueue (không mất dữ liệu).
          const isNetwork = err instanceof TypeError
            || (err?.message && (String(err.message).includes('Network error') || String(err.message).includes('failed to fetch')))
          if (isNetwork) return queueOffline()
          set({ error: msg, isSubmitting: false })
          return null
        }
      },

      getStudentAttendanceRate: (studentId, academicYear?) => {
        // ADR-017 (F2): Attendance được giới hạn theo năm học — trước đây tính
        // all-time khiến tỷ lệ bị pha loãng bởi các năm trước (lệch so với
        // ReportViewModelFactory scoped-by-year và server). Ưu tiên academic_years
        // từ server, fallback mặc định tháng 8.
        const activeYear = useAcademicYearStore.getState().resolveActiveYear()
        const year = normalizeAcademicYear(academicYear || activeYear) || activeYear
        const range = useAcademicYearStore.getState().getYearRange(year)
        const records = get().attendance.filter(
          (a) => a.studentId === studentId && a.date >= range.startDate && a.date <= range.endDate
        )
        // ADR-017 (F3): ExcusedWeight từ attendancePolicy (khớp server & factory) —
        // trước đây đếm AbsentExcused full 1.0 bất kể parish cấu hình excusedWeight < 1.
        // Tỷ lệ UI phải đồng nhất với AttendanceRateSpecification để không lật kết quả
        // xét thăng tiến ở ngưỡng minRateForExam.
        const { settings } = useSettingsStore.getState()
        const excusedWeight = settings.attendancePolicy?.excusedWeight ?? 1.0
        const presentCount = countAttendancePresent(records, excusedWeight)
        return calculateAttendanceRate(presentCount, records.length)
      },

      clearErrors: () => set({ error: null, lockError: null }),
      clearBatchResult: () => set({ batchResult: null }),
    }),
    {
      name: 'parish_store_attendance',
      storage: createJSONStorage(() => dexieStorage),
    }
  )
)

export { calculateAttendanceRate }
