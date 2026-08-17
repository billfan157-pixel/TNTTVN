import React from 'react'
import { api, ApiError } from './api'
import { decryptQueueValue } from './offlineCipher'
import * as Sentry from '@sentry/react'

/**
 * Maximum retries for server/client errors (ApiError: 4xx, 5xx, etc.).
 * Network errors (TypeError / ApiError status 0) bypass this check and are always
 * `recoverable: true` — the sync engine caps them at `retryCount >= 5` (see
 * useSyncEngine.ts). Two different thresholds for two different error classes,
 * same `retryCount` field.
 */
const MAX_RETRIES = 3

/** Server owns id/code/parish/timestamps — never send these on create/update body. */
const STUDENT_SERVER_KEYS = new Set([
  'id',
  'code',
  'parishId',
  'createdAt',
  'updatedAt',
  'updatedBy',
  'deletedAt',
])

export function sanitizeStudentPayload(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data || {})) {
    if (STUDENT_SERVER_KEYS.has(key)) continue
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

const GRADE_META_SUFFIXES = ['_updated_at']

function stripGradeMeta(data: Record<string, unknown>): Record<string, unknown> {
  if (!data) return data
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (GRADE_META_SUFFIXES.some(s => k.endsWith(s))) continue
    out[k] = v
  }
  return out
}

export interface SyncItem {
  id?: string
  entityId?: string
  entityType?: string
  type?: string
  entity?: string
  action?: string
  operation?: string
  data?: any
  payload?: any
  clientTimestamp?: number
  retryCount?: number
}

export interface SyncProcessResult {
  ok: boolean
  recoverable?: boolean
  isAuthError?: boolean
  isConflict?: boolean
  error?: string
  data?: any
}

export async function processSyncQueueItem(item: SyncItem): Promise<SyncProcessResult> {
  const entityType = (item.entityType || item.type || item.entity || '').toLowerCase()
  const action = (item.action || item.operation || '').toLowerCase()
  // A-NEW-32: payload syncQueue được mã hóa tại-rest (AAD 'syncQueue') — giải mã
  // trước khi gửi server. decryptQueueValue dual-format: legacy plaintext (queue
  // cũ / mock) trả nguyên. Ciphertext hỏng → bỏ qua op (như payload không parse).
  let rawData: unknown = item.data ?? item.payload ?? {}
  if (typeof rawData === 'string') {
    const decrypted = await decryptQueueValue(rawData)
    if (decrypted === null) {
      return { ok: false, recoverable: false, error: 'Queue payload corrupted (ciphertext không giải mã được)' }
    }
    rawData = decrypted
  }
  const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
  const targetId = item.entityId || item.id || data.id || data.studentId
  const retryCount = item.retryCount || 0

  try {
    switch (entityType) {
      case 'student':
        if (action === 'delete') {
          await api.deleteStudent(targetId)
        } else if (action === 'create') {
          // Strip client id/code so server generates authoritative values.
          // ADR-016 (offline-sync audit #3): kèm idempotencyKey = temp id của op —
          // retry sau timeout trả về student đã tạo (server dedupe) thay vì tạo
          // trùng. Key bền qua compact (CREATE+UPDATE giữ entityId gốc).
          const created = await api.createStudent({
            ...sanitizeStudentPayload(data),
            idempotencyKey: item.entityId || data.id || undefined,
          })
          return { ok: true, data: created }
        } else if (action === 'update') {
          const updated = await api.updateStudent(targetId, sanitizeStudentPayload(data))
          return { ok: true, data: updated }
        }
        break

      case 'grade':
        if (action === 'delete') {
          // No server-side DELETE endpoint — null-out all scores via upsert
          const nulledData = { ...stripGradeMeta(data), scoreOral: null, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: null, scoreDaoDuc: null }
          const gradeResult = await api.upsertGrade(nulledData)
          return { ok: true, data: gradeResult }
        } else {
          const gradeResult = await api.upsertGrade(stripGradeMeta(data))
          return { ok: true, data: gradeResult }
        }

      case 'attendance':
        const attResult = await api.upsertAttendance(data)
        return { ok: true, data: attResult }

      case 'notice':
      case 'notices':
        if (action === 'delete') {
          await api.deleteNotice(targetId)
        } else if (action === 'create') {
          const created = await api.createNotice({
            ...data,
            idempotencyKey: item.entityId || data.id || data.idempotencyKey || undefined,
          })
          return { ok: true, data: created }
        } else if (action === 'update') {
          const updated = await api.updateNotice(targetId, data)
          return { ok: true, data: updated }
        }
        break

      case 'class':
      case 'classes':
        if (action === 'delete') {
          await api.deleteClass(targetId)
        } else if (action === 'create') {
          const created = await api.createClass({
            ...data,
            idempotencyKey: item.entityId || data.id || data.idempotencyKey || undefined,
          })
          return { ok: true, data: created }
        } else if (action === 'update') {
          const updated = await api.updateClass(targetId, data)
          return { ok: true, data: updated }
        }
        break

      case 'exam':
      case 'exams':
        if (action === 'delete') {
          await api.deleteExam(targetId)
          return { ok: true }
        } else if (action === 'create') {
          // ADR-023 (Phase 3 offline): kèm idempotencyKey = temp id của session —
          // retry sau timeout trả về session đã tạo (server dedupe) thay vì tạo trùng.
          const created = await api.createExam({
            ...data,
            idempotencyKey: item.entityId || data.id || undefined,
          })
          return { ok: true, data: created }
        } else if (action === 'update') {
          const targetSessionId = data.sessionId || targetId
          if (data.action === 'save_results') {
            const res = await api.saveExamResults(targetSessionId, data.scores)
            return { ok: true, data: res }
          } else if (data.action === 'remove_result') {
            await api.removeExamResult(targetSessionId, data.studentId)
            return { ok: true }
          } else if (data.action === 'complete') {
            const completed = await api.completeExam(targetSessionId)
            return { ok: true, data: completed }
          } else if (data.action === 'reopen') {
            const reopened = await api.reopenExam(targetSessionId)
            return { ok: true, data: reopened }
          }
        }
        break

      default:
        return { ok: false, recoverable: false, error: `Unknown entityType: ${entityType}` }
    }

    return { ok: true }
  } catch (err) {
    if (isNetworkError(err)) {
      return { ok: false, recoverable: true, error: 'Network offline' }
    }

    if (err instanceof ApiError) {
      if (err.status === 409) {
        Sentry.captureMessage(`[Sync] Conflict on ${entityType}/${targetId}`, 'warning')
        const conflictData = (err as any).details
        return { ok: true, isConflict: true, data: conflictData, error: 'Conflict resolved: server version accepted' }
      }
      if (err.status === 401) {
        return { ok: false, recoverable: false, isAuthError: true, error: `Auth expired: ${err.message}` }
      }
      if (err.status === 429) {
        return { ok: false, recoverable: true, error: `Rate limited: ${err.message}` }
      }
      if (err.status >= 400 && err.status < 500) {
        return { ok: false, recoverable: false, error: `Client error ${err.status}: ${err.message}` }
      }
      if (err.status >= 500) {
        return retryCount < MAX_RETRIES
          ? { ok: false, recoverable: true, error: `Server error ${err.status}: retry queued` }
          : { ok: false, recoverable: false, error: `Max retries reached (${MAX_RETRIES})` }
      }
    }

    return retryCount < MAX_RETRIES
      ? { ok: false, recoverable: true, error: `HTTP failure: ${String(err)}` }
      : { ok: false, recoverable: false, error: `Max retries exceeded` }
  }
}

export const processOperation = processSyncQueueItem

export function getBackoffMs(retryCount: number): number {
  return retryCount === 0 ? 5000 : retryCount === 1 ? 15000 : 60000
}

export function isNetworkError(err: unknown): boolean {
  // ADR-016 (offline-sync audit #4): api.ts:139 throw ApiError(0, 'Network error …')
  // sau 3 lần retry nội bộ — status 0 không phải TypeError nên trước đây rơi xuống
  // nhánh bottom 'Max retries exceeded' → op 'failed' dù lỗi thuần network (và nếu
  // retryCount >= MAX_RETRIES thì recoverable=false, sai bản chất lỗi tạm thời).
  if (err instanceof ApiError && err.status === 0) return true
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase()
    return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')
  }
  return false
}


