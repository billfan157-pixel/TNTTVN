import { api, ApiError } from './api'
import { getDB, type SyncQueueItem } from './db'

const MAX_RETRIES = 5
const INITIAL_BACKOFF_MS = 2000

export function getBackoffMs(retryCount: number): number {
  return Math.min(INITIAL_BACKOFF_MS * Math.pow(2, retryCount), 60000)
}

export type ProcessResult =
  | { ok: true }
  | { ok: false; recoverable: boolean; error: string }

export async function processOperation(op: SyncQueueItem): Promise<ProcessResult> {
  try {
    const payload = JSON.parse(op.payload)
    switch (op.entity) {
      case 'student':
        return await processStudent(op, payload)
      case 'grade':
        return await processGrade(op, payload)
      case 'attendance':
        return await processAttendance(op, payload)
      default:
        return { ok: false, recoverable: false, error: `Unknown entity: ${op.entity}` }
    }
  } catch (err) {
    if (err instanceof ApiError) {
      return handleApiError(err, op.retryCount)
    }
    return { ok: false, recoverable: true, error: String(err) }
  }
}

async function processStudent(op: SyncQueueItem, payload: any): Promise<ProcessResult> {
  switch (op.operation) {
    case 'CREATE':
      await api.createStudent(payload)
      return { ok: true }
    case 'UPDATE':
      await api.updateStudent(op.entityId, payload)
      return { ok: true }
    case 'DELETE':
      await api.deleteStudent(op.entityId)
      return { ok: true }
  }
}

async function processGrade(op: SyncQueueItem, payload: any): Promise<ProcessResult> {
  switch (op.operation) {
    case 'CREATE':
    case 'UPDATE':
      await api.upsertGrade(payload)
      return { ok: true }
    case 'DELETE':
      return { ok: false, recoverable: false, error: 'Grade DELETE not supported' }
  }
}

async function processAttendance(op: SyncQueueItem, payload: any): Promise<ProcessResult> {
  switch (op.operation) {
    case 'CREATE':
    case 'UPDATE':
      await api.upsertAttendance(payload)
      return { ok: true }
    case 'DELETE':
      return { ok: false, recoverable: false, error: 'Attendance DELETE not supported' }
  }
}

function handleApiError(err: ApiError, retryCount: number): ProcessResult {
  switch (err.status) {
    case 400:
      return { ok: false, recoverable: false, error: `Bad request: ${err.message}` }
    case 401:
      return retryCount < 1
        ? { ok: false, recoverable: true, error: 'Token expired, will retry' }
        : { ok: false, recoverable: false, error: 'Authentication failed' }
    case 403:
      return { ok: false, recoverable: false, error: 'Forbidden' }
    case 404:
      return { ok: false, recoverable: false, error: `Not found: ${err.path}` }
    case 409:
      return { ok: true } // Conflict — local wins (LWW), skip
    case 429:
      return { ok: false, recoverable: true, error: 'Rate limited' }
    case 500:
    case 502:
    case 503:
      return retryCount < MAX_RETRIES
        ? { ok: false, recoverable: true, error: `Server error: ${err.status}` }
        : { ok: false, recoverable: false, error: `Max retries exceeded: ${err.status}` }
    default:
      return retryCount < MAX_RETRIES
        ? { ok: false, recoverable: true, error: `HTTP ${err.status}: ${err.message}` }
        : { ok: false, recoverable: false, error: `Max retries exceeded: ${err.status}` }
  }
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && err.message === 'Failed to fetch'
}

export async function deltaSync(entity: string, lastSyncAt: string | null): Promise<any[]> {
  if (!lastSyncAt) return []

  const qs = `?updatedAfter=${encodeURIComponent(lastSyncAt)}`
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
