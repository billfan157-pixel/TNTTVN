const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

let accessToken: string | null = null
let refreshToken: string | null = null

export function setTokens(access: string, refresh: string) {
  accessToken = access
  refreshToken = refresh
  localStorage.setItem('parish_access_token', access)
  localStorage.setItem('parish_refresh_token', refresh)
}

export function loadTokens() {
  accessToken = localStorage.getItem('parish_access_token')
  refreshToken = localStorage.getItem('parish_refresh_token')
}

export function clearTokens() {
  accessToken = null
  refreshToken = null
  localStorage.removeItem('parish_access_token')
  localStorage.removeItem('parish_refresh_token')
}

export function getAccessToken() {
  return accessToken
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json()
    setTokens(data.accessToken, data.refreshToken || refreshToken)
    return true
  } catch {
    return false
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${API_BASE}${path}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  let res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`
      res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(res.status, text || res.statusText, path)
  }

  if (res.status === 204) return undefined as T
  return res.json()
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

// ─── Auth ───
export const api = {
  login: (username: string, password: string) =>
    request<{
      user: { id: string; username: string; fullName: string; role: string }
      accessToken: string
      refreshToken: string
    }>('POST', '/auth/login', { username, password }),

  // ─── Students ───
  getStudents: () => request<any[]>('GET', '/students'),
  getStudent: (id: string) => request<any>('GET', `/students/${id}`),
  createStudent: (data: Record<string, unknown>) =>
    request<any>('POST', '/students', data),
  updateStudent: (id: string, data: Record<string, unknown>) =>
    request<any>('PUT', `/students/${id}`, data),
  deleteStudent: (id: string) =>
    request<{ success: boolean }>('DELETE', `/students/${id}`),

  // ─── Grades ───
  getGrades: (params?: { studentId?: string; semester?: number }) => {
    const qs = new URLSearchParams()
    if (params?.studentId) qs.set('studentId', params.studentId)
    if (params?.semester) qs.set('semester', String(params.semester))
    const q = qs.toString()
    return request<any[]>('GET', `/grades${q ? `?${q}` : ''}`)
  },
  upsertGrade: (data: Record<string, unknown>) =>
    request<any>('POST', '/grades', data),
  batchUpsertGrades: (dataList: Record<string, unknown>[]) =>
    request<{ success: boolean }>('POST', '/grades/batch', dataList),

  // ─── Attendance ───
  getAttendance: (params?: { studentId?: string; date?: string; type?: string }) => {
    const qs = new URLSearchParams()
    if (params?.studentId) qs.set('studentId', params.studentId)
    if (params?.date) qs.set('date', params.date)
    if (params?.type) qs.set('type', params.type)
    const q = qs.toString()
    return request<any[]>('GET', `/attendance${q ? `?${q}` : ''}`)
  },
  upsertAttendance: (data: Record<string, unknown>) =>
    request<any>('POST', '/attendance', data),
  batchUpsertAttendance: (date: string, type: string, records: { studentId: string; status: string; note?: string }[]) =>
    request<{ success: boolean }>('POST', '/attendance/batch', { date, type, records }),

  // ─── Notices ───
  getNotices: () => request<any[]>('GET', '/notices'),
  createNotice: (data: Record<string, unknown>) =>
    request<any>('POST', '/notices', data),
  deleteNotice: (id: string) =>
    request<{ success: boolean }>('DELETE', `/notices/${id}`),
}
