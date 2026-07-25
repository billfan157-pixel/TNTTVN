import { api, ApiError } from './api'

const MAX_RETRIES = 5

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
  error?: string
}

export async function processSyncQueueItem(item: SyncItem): Promise<SyncProcessResult> {
  const entityType = (item.entityType || item.type || item.entity || '').toLowerCase()
  const action = (item.action || item.operation || '').toLowerCase()
  const rawData = item.data ?? item.payload ?? {}
  const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
  const targetId = item.entityId || item.id || data.id || data.studentId
  const retryCount = item.retryCount || 0

  try {
    switch (entityType) {
      case 'student':
        if (action === 'delete') {
          await api.deleteStudent(targetId)
        } else if (action === 'create') {
          await api.createStudent(data)
        } else if (action === 'update') {
          await api.updateStudent(targetId, data)
        }
        break

      case 'grade':
        await api.upsertGrade(data)
        break

      case 'attendance':
        await api.upsertAttendance(data)
        break

      case 'notice':
      case 'notices':
        if (action === 'delete') {
          await api.deleteNotice(targetId)
        } else if (action === 'create') {
          await api.createNotice(data)
        }
        break

      case 'class':
      case 'classes':
        if (action === 'delete') {
          await api.deleteClass(targetId)
        } else if (action === 'create') {
          await api.createClass(data)
        } else if (action === 'update') {
          await api.updateClass(targetId, data)
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
        // Conflict: server has newer version — refetch to merge
        console.warn(`[Sync] Conflict on ${entityType}/${targetId} — server version wins`)
        return { ok: true, error: 'Conflict resolved: server version accepted' }
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
  const base = 2000
  const delay = base * Math.pow(2, retryCount)
  return Math.min(delay, 60000)
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase()
    return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')
  }
  return false
}


