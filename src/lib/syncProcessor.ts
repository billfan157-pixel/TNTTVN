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
        return { ok: true }
      }
      if (err.status === 401) {
        return { ok: false, recoverable: true, error: `Auth 401: ${err.message}` }
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
  return err instanceof TypeError && err.message === 'Failed to fetch'
}

/**
 * Executes lightweight Delta Sync by fetching only records updated after lastSyncAt
 */
export async function deltaSync(entity: string, lastSyncAt: string | null): Promise<any[]> {
  if (!lastSyncAt) return fullSyncEntity(entity)

  switch (entity) {
    case 'students':
      return api.getStudents(lastSyncAt)
    case 'grades':
      return api.getGrades({ updatedAfter: lastSyncAt })
    case 'attendance':
      return api.getAttendance({ updatedAfter: lastSyncAt })
    case 'notices':
      return api.getNotices(lastSyncAt)
    default:
      return []
  }
}

export async function fullSyncEntity(entity: string): Promise<any[]> {
  switch (entity) {
    case 'students':
      return api.getStudents()
    case 'grades':
      return api.getGrades()
    case 'attendance':
      return api.getAttendance()
    case 'notices':
      return api.getNotices()
    default:
      return []
  }
}
