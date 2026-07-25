import { router } from '../router'

let accessToken: string | null = null
let refreshToken: string | null = null

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// ─── Mutex for JWT refresh ───
let refreshPromise: Promise<boolean> | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setTokens(access: string, refresh: string) {
  accessToken = access
  refreshToken = refresh
  try {
    localStorage.setItem('parish_access_token', access)
    localStorage.setItem('parish_refresh_token', refresh)
  } catch {
    // Ignore storage issues
  }
}

export function loadTokensFromStorage() {
  try {
    accessToken = localStorage.getItem('parish_access_token')
    refreshToken = localStorage.getItem('parish_refresh_token')
  } catch {
    // Ignore
  }
}

export const loadTokens = loadTokensFromStorage

export function clearTokens() {
  accessToken = null
  refreshToken = null
  try {
    localStorage.removeItem('parish_access_token')
    localStorage.removeItem('parish_refresh_token')
  } catch {
    // Ignore
  }
}

/**
 * Refresh access token with mutex to prevent concurrent refresh calls.
 * Multiple parallel 401 responses will share the same refresh promise.
 */
async function refreshAccessToken(): Promise<boolean> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) return refreshPromise

  refreshPromise = doRefresh()
  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

async function doRefresh(): Promise<boolean> {
  if (!refreshToken) return false
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      clearTokens()
      return false
    }
    const data = await res.json()
    const tokens = data.data || data
    setTokens(tokens.accessToken, tokens.refreshToken)
    return true
  } catch {
    return false
  }
}

function redirectToLogin() {
  clearTokens()
  try {
    localStorage.removeItem('parish_current_user')
  } catch {
    // Ignore
  }
  // Use router navigation instead of window.location to preserve React state
  try {
    router.navigate({ to: '/login' })
  } catch {
    window.location.href = '/login'
  }
}

const MAX_RETRIES = 3
const RETRY_BASE_MS = 1000

/**
 * Core request function with:
 * - JWT auto-refresh with mutex (prevents concurrent refresh race)
 * - Retry logic with exponential backoff for transient failures
 * - Proper error classification
 */
async function request<T>(method: string, path: string, body?: unknown, retryCount = 0): Promise<T> {
  const url = `${API_BASE}${path}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    // Network error — retry if possible
    if (retryCount < MAX_RETRIES) {
      await sleep(RETRY_BASE_MS * Math.pow(2, retryCount))
      return request<T>(method, path, body, retryCount + 1)
    }
    throw new ApiError(0, 'Network error — unable to reach server', path)
  }

  // Handle 401 with mutex refresh or redirect to login
  if (res.status === 401) {
    if (refreshToken) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        headers['Authorization'] = `Bearer ${accessToken}`
        res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
      } else {
        redirectToLogin()
        throw new ApiError(401, 'Session expired — redirecting to login', path)
      }
    } else {
      redirectToLogin()
      throw new ApiError(401, 'Unauthorized — redirecting to login', path)
    }
  }

  // Handle 5xx with retry
  if (res.status >= 500 && retryCount < MAX_RETRIES) {
    await sleep(RETRY_BASE_MS * Math.pow(2, retryCount))
    return request<T>(method, path, body, retryCount + 1)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(res.status, text || res.statusText, path)
  }

  if (res.status === 204) return undefined as T
  const json = await res.json()
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return json.data as T
  }
  return json as T
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class ApiError extends Error {
  status: number
  path: string
  constructor(status: number, message: string, path: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.path = path
  }
}

// ─── Auth & Entities API ───
export const api = {
  login: (username: string, password: string) =>
    request<{
      user: { id: string; username: string; fullName: string; role: string; status: string; mustChangePassword?: number }
      accessToken: string
      refreshToken: string
    }>('POST', '/auth/login', { username, password }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>('POST', '/auth/change-password', { currentPassword, newPassword }),

  // ─── Users ───
  getUsers: () => request<any[]>('GET', '/users'),
  createUser: (data: { username: string; fullName: string; phone?: string; role: string; assignedClasses?: string[] }) =>
    request<{ id: string; username: string; tempPassword: string }>('POST', '/users', data),
  updateUserStatus: (id: string, status: string) =>
    request<{ success: boolean }>('PUT', `/users/${id}/status`, { status }),
  updateUserAssignments: (id: string, assignedClasses: string[]) =>
    request<{ id: string; assignedClasses: string[] }>('PUT', `/users/${id}/assignments`, { assignedClasses }),
  resetUserPassword: (id: string) =>
    request<{ username: string; tempPassword: string }>('POST', `/users/${id}/reset-password`),
  forceLogoutUser: (id: string) =>
    request<{ success: boolean }>('POST', `/users/${id}/force-logout`),

  // ─── Students ───
  getStudents: (updatedAfter?: string) => {
    const q = updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : ''
    return request<any[]>('GET', `/students${q}`)
  },
  getStudent: (id: string) => request<any>('GET', `/students/${id}`),
  createStudent: (data: Record<string, unknown>) => request<any>('POST', '/students', data),
  updateStudent: (id: string, data: Record<string, unknown>) => request<any>('PUT', `/students/${id}`, data),
  deleteStudent: (id: string) => request<{ success: boolean }>('DELETE', `/students/${id}`),

  // ─── Grades ───
  getGrades: (params?: { studentId?: string; semester?: number; updatedAfter?: string }) => {
    const qs = new URLSearchParams()
    if (params?.studentId) qs.set('studentId', params.studentId)
    if (params?.semester) qs.set('semester', String(params.semester))
    if (params?.updatedAfter) qs.set('updatedAfter', params.updatedAfter)
    const q = qs.toString()
    return request<any[]>('GET', `/grades${q ? `?${q}` : ''}`)
  },
  upsertGrade: (data: Record<string, unknown>) => request<any>('POST', '/grades', data),
  batchUpsertGrades: (dataList: Record<string, unknown>[]) => request<{ success: boolean }>('POST', '/grades/batch', dataList),

  // ─── Attendance ───
  getAttendance: (params?: { studentId?: string; date?: string; type?: string; updatedAfter?: string }) => {
    const qs = new URLSearchParams()
    if (params?.studentId) qs.set('studentId', params.studentId)
    if (params?.date) qs.set('date', params.date)
    if (params?.type) qs.set('type', params.type)
    if (params?.updatedAfter) qs.set('updatedAfter', params.updatedAfter)
    const q = qs.toString()
    return request<any[]>('GET', `/attendance${q ? `?${q}` : ''}`)
  },
  upsertAttendance: (data: Record<string, unknown>) => request<any>('POST', '/attendance', data),
  batchUpsertAttendance: (date: string, type: string, records: { studentId: string; status: string; note?: string }[]) =>
    request<{ success: boolean }>('POST', '/attendance/batch', { date, type, records }),

  // ─── Classes ───
  getClasses: () => request<any[]>('GET', '/classes'),
  getClass: (id: string) => request<any>('GET', `/classes/${id}`),
  getClassBranches: () => request<any[]>('GET', '/classes/branches'),
  getClassAcademicYears: () => request<any[]>('GET', '/classes/academic-years'),
  createClass: (data: Record<string, unknown>) => request<any>('POST', '/classes', data),
  updateClass: (id: string, data: Record<string, unknown>) => request<any>('PUT', `/classes/${id}`, data),
  deleteClass: (id: string) => request<{ success: boolean }>('DELETE', `/classes/${id}`),

  // ─── Notices ───
  getNotices: (updatedAfter?: string) => {
    const q = updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : ''
    return request<any[]>('GET', `/notices${q}`)
  },
  createNotice: (data: Record<string, unknown>) => request<any>('POST', '/notices', data),
  deleteNotice: (id: string) => request<{ success: boolean }>('DELETE', `/notices/${id}`),

  // ─── Notifications ───
  sendReportCards: (data: { students: any[] }) =>
    request<{ success: boolean }>('POST', '/notifications/smart/report-cards', data),

  // ─── Audit Logs ───
  getAuditLogs: (params?: { page?: number; limit?: number; userId?: string; action?: string; entityType?: string }) => {
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.userId) qs.set('userId', params.userId)
    if (params?.action) qs.set('action', params.action)
    if (params?.entityType) qs.set('entityType', params.entityType)
    const q = qs.toString()
    return request<{ data: any[]; meta: { page: number; limit: number; total: number } }>('GET', `/audit-logs${q ? `?${q}` : ''}`)
  },
}
