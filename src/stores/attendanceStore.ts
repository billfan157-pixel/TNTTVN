import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { getDB } from '../lib/db'
import { academicCacheStorage, beginAcademicPull, flushAcademicCache, mergeAcademicPull } from '../lib/academicPull'
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
import { isOwnOp } from './syncStore'
import { requestSync } from '../lib/syncTrigger'

export type AttendanceMutationAcknowledgement = 'server' | 'durable_queue'
export type BatchAttendanceSaveReceipt = BatchAttendanceResponseDTO & {
  acknowledgement: AttendanceMutationAcknowledgement
}

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
      // OFF-TENANT-1: chỉ tính ops đúng scope phiên hiện tại.
      if (!isOwnOp(item)) continue
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

// Store only signals a framework-neutral trigger; it never imports a hook.
async function triggerSyncFlow() {
  try {
    await requestSync()
  } catch {
    // Sync engine not available (e.g. during SSR/test teardown) — the queued
    // op will still be flushed by the periodic interval or online event.
  }
}

interface AttendanceState {
  syncScopeRevision: string | null
  attendance: AttendanceRecord[]
  error: string | null
  lockError: string | null
  batchResult: BatchAttendanceSaveReceipt | null
  isSubmitting: boolean
  setAttendance: (attendance: AttendanceRecord[]) => void
  fetchAttendance: (updatedAfter?: string, throwOnError?: boolean) => Promise<void>
  saveAttendance: (
    studentId: string, date: string, type: AttendanceType,
    status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused', note?: string,
    skipSync?: boolean,
    serverRecord?: { id: string; status: string; note?: string | null; version?: number }
  ) => Promise<AttendanceMutationAcknowledgement | null>
  batchSaveAttendance: (
    records: { studentId: string; status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'; note?: string }[],
    date: string, type: AttendanceType
  ) => Promise<BatchAttendanceSaveReceipt | null>
  getStudentAttendanceRate: (studentId: string, academicYear?: string) => { rate: number; presentCount: number; totalCount: number }
  clearErrors: () => void
  clearBatchResult: () => void
}

export const useAttendanceStore = create<AttendanceState>()(
  persist(
    (set, get) => ({
      attendance: [],
      syncScopeRevision: null,
      error: null,
      lockError: null,
      batchResult: null,
      isSubmitting: false,
      setAttendance: (attendance) => set({ attendance }),

      fetchAttendance: async (updatedAfter?: string, throwOnError?: boolean) => {
        if (!isAuthenticated()) return
        const pull = beginAcademicPull('attendance')
        try {
          const revision = get().syncScopeRevision
          const fetched = await api.pullAttendance(updatedAfter, revision)
          const pendingKeys = await getPendingAttendanceNaturalKeys()
          pull.assertCurrent()
          const merged = mergeAcademicPull(fetched, get().attendance, pendingKeys, attendanceNaturalKey, revision)
          set({ attendance: merged.rows, syncScopeRevision: merged.revision, error: null })
          await flushAcademicCache('parish_store_attendance')
          pull.assertCurrent()
        } catch (err) {
          Sentry.captureException(err)
          if (pull.current()) set({ error: (err as Error)?.message || 'Lỗi tải điểm danh' })
          if (throwOnError) throw err
        }
      },

      saveAttendance: async (studentId, date, type, status, note, skipSync, serverRecord) => {
        set({ isSubmitting: true, error: null, lockError: null })

        // Apply the local read model only after either the server responds or the
        // encrypted queue transaction commits. The editor owns the volatile draft
        // before that boundary, so enqueue failure cannot be shown as saved.
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
          return 'server'
        }

        // ADR-016 (S21): Kèm version hiện tại (nếu có) — server từ chối nếu ai đó
        // đã sửa bản ghi này ở máy khác, thay vì ghi đè im lặng.
        const existing = get().attendance.find(a => a.studentId === studentId && a.date === date && a.type === type)
        const version = existing?.version ?? 0

        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
        if (isOffline) {
          // Acknowledge only after encryption + IndexedDB transaction succeeds.
          // If enqueue fails, leave the caller's draft intact and report failure;
          // never manufacture a saved state that has no durable owner.
          try {
            await syncService.syncSaveAttendance({ studentId, date, type, status, note, version })
            applyLocal()
            void triggerSyncFlow()
            return 'durable_queue'
          } catch (err) {
            Sentry.captureException(err)
            set({ error: 'Không thể lưu điểm danh trên thiết bị. Dữ liệu nhập vẫn chưa được xác nhận.', isSubmitting: false })
            return null
          }
        }

        try {
          const res = await attendanceApiClient.markAttendance({ studentId, date, type, status, note, version })
          applyLocal(res)
          return 'server'
        } catch (err: any) {
          // Network failure mid-request (not a server validation error): fall back to
          // enqueueing so the offline-entered attendance isn't lost.
          const isNetwork = err instanceof TypeError
            || (err?.message && (String(err.message).includes('Network error') || String(err.message).includes('failed to fetch')))
          if (isNetwork) {
            try {
              await syncService.syncSaveAttendance({ studentId, date, type, status, note, version })
              applyLocal()
              void triggerSyncFlow()
              return 'durable_queue'
            } catch (queueError) {
              Sentry.captureException(queueError)
              set({ error: 'Mất kết nối và không thể lưu điểm danh trên thiết bị. Vui lòng thử lại.', isSubmitting: false })
              return null
            }
          }
          const msg = err instanceof ApiError ? err.message : 'Lỗi khi lưu điểm danh'
          if (err instanceof ApiError && err.status === 403) {
            set({ lockError: msg, isSubmitting: false })
          } else {
            set({ error: msg, isSubmitting: false })
          }
          return null
        }
      },

      batchSaveAttendance: async (records, date, type) => {
        set({ isSubmitting: true, error: null, lockError: null, batchResult: null })
        // Snapshot the expected version before any optimistic local projection.
        // An absent row is an explicit expectation, including offline replay.
        const currentAttMap = new Map<string, AttendanceRecord>()
        for (const a of get().attendance) currentAttMap.set(attendanceNaturalKey(a), a)
        const withVersion = records.map(r => {
          const key = attendanceNaturalKey({ studentId: r.studentId, date, type })
          return { ...r, version: currentAttMap.get(key)?.version ?? 0 }
        })

        // ADR-016 (offline-sync audit #9): trước đây không có nhánh offline/network —
        // toàn bộ sheet điểm danh bị mất khi offline (trả null, không enqueue).
        // Enqueue từng record vào sync queue (engine sẽ batch lại), rồi mới cập
        // nhật local read model và phát receipt cho UI.
        const queueOffline = async (): Promise<BatchAttendanceSaveReceipt | null> => {
          try {
            await syncService.syncBatchSaveAttendance(date, type, withVersion)
          } catch (err) {
            Sentry.captureException(err)
            set({
              error: 'Không thể lưu điểm danh trên thiết bị. Bản nháp vẫn được giữ để bạn thử lại.',
              isSubmitting: false,
            })
            return null
          }

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
          void triggerSyncFlow()
          const receipt: BatchAttendanceSaveReceipt = {
            total: records.length,
            successCount: records.length,
            skippedCount: 0,
            conflictCount: 0,
            errorCount: 0,
            results: records.map(r => ({ studentId: r.studentId, status: 'saved' as const })),
            acknowledgement: 'durable_queue',
          }
          set({ batchResult: receipt })
          return receipt
        }

        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
        if (isOffline) return queueOffline()

        try {
          // ADR-016 (S21): Kèm version hiện tại từng record (nếu có) để server
          // phát hiện xung đột multi-device; server-wins khi conflict.
          const serverResult = await attendanceApiClient.batchMarkAttendance(withVersion, date, type)
          const result: BatchAttendanceSaveReceipt = { ...serverResult, acknowledgement: 'server' }
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
      version: 2,
      migrate: () => ({ attendance: [], syncScopeRevision: null }),
      storage: createJSONStorage(() => academicCacheStorage),
    }
  )
)

export { calculateAttendanceRate }
