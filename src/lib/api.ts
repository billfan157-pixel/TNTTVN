import type {
  ReportCardDTO,
  LeaveRequest,
  Fund,
  FinancialTransaction,
  StudentFeeRecord,
  FinanceSummary,
  CreateTransactionInput,
  CreateFundInput,
  Student,
  FeedbackTarget,
  FeedbackMessage,
  FeedbackStatus,
  CreateFeedbackInput,
  QuestionBankItem,
  QuestionBankStatus,
  QuestionBankType,
  QuestionDifficulty,
  ExamBlueprint,
  ExamBlueprintRule,
  ExamSession,
} from '../types'
import { clearAuthSnapshot } from './db'

// SECURITY (2026-08-11) — A-NEW-10 hardening: access token CHỈ tồn tại trong MEMORY.
// Trước đây persist ở localStorage (parish_access_token) → XSS cùng origin đọc được
// (dù TTL 15 phút). Giờ:
// - setTokens: chỉ set memory, KHÔNG ghi localStorage.
// - loadTokensFromStorage: KHÔNG đọc token từ localStorage — chỉ dọn legacy key.
//   Sau reload, access token được lấy lại qua POST /auth/refresh (HttpOnly cookie)
//   — xem bootstrapAccessToken().
// - clearTokens: xóa memory + dọn mọi legacy key phòng trường hợp version cũ để sót.
let accessToken: string | null = null

// A-NEW-27 (2026-08-11): KHÔNG import static { router } từ '../router' — tạo chu kỳ
// import tròn (api → router → stores → api) → stores gọi isAuthenticated() lúc module
// đang khởi tạo → ReferenceError TDZ (accessToken chưa init). Thay bằng handler
// navigate-to-login được đăng ký sau khi router tạo xong (router.tsx) — phá vòng,
// vẫn giữ router navigate (preserve React state) thay cho window.location.
let navigateToLogin: (() => void) | null = null
export function setNavigateToLogin(fn: () => void): void {
  navigateToLogin = fn
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export interface QuestionBankMutationInput {
  questionType: QuestionBankType
  stem: string
  answerData: Record<string, unknown>
  explanation?: string | null
  branchId?: string | null
  curriculumLevel?: string | null
  book?: string | null
  chapter?: string | null
  lesson?: string | null
  lessonOrder?: number | null
  topic?: string | null
  difficulty?: QuestionDifficulty | null
  tags?: string[]
  source?: string | null
  provenance?: 'human' | 'ai' | 'import'
  changeNote?: string | null
}

export function getAccessToken(): string | null {
  return accessToken
}

/**
 * SECURITY (2026-08-11) — A-NEW-10 hardening: helper xác định "đã đăng nhập".
 * Access token memory-only → sau reload memory rỗng dù session còn hợp lệ (cookie).
 * Session state persist ở `parish_current_user` (authStore) — dùng nó làm nguồn
 * xác thực cho guard/fetch-skip, KHÔNG dùng access token.
 */
export function isAuthenticated(): boolean {
  if (accessToken) return true
  try {
    return !!localStorage.getItem('parish_current_user')
  } catch {
    return false
  }
}

// A12: key idempotency cho retry an toàn (ổn định trong cả chuỗi retry của request(),
// vì nó được tạo một lần ở wrapper API trước khi request() được gọi).
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

// A-NEW-01 (2026-08-10): client CHỈ nhận access token. Refresh token không bao giờ
// tồn tại trong JS state — nguồn duy nhất là HttpOnly cookie (server set/rotate).
export function setTokens(access: string) {
  accessToken = access
  // SECURITY (2026-08-11): KHÔNG persist access token vào localStorage nữa — chỉ
  // memory. Xóa key cũ nếu còn sót từ version trước (dọn dẹp phòng thủ).
  try {
    localStorage.removeItem('parish_access_token')
    localStorage.removeItem('parish_refresh_token')
  } catch {
    // Ignore storage issues
  }
}

export function loadTokensFromStorage() {
  // SECURITY (2026-08-11): KHÔNG đọc access token từ localStorage — memory-only.
  // Sau reload, access token được lấy lại qua refresh cookie (bootstrapAccessToken).
  // Chỉ dọn legacy key phòng version cũ để sót.
  try {
    localStorage.removeItem('parish_access_token')
    localStorage.removeItem('parish_refresh_token')
  } catch {
    // Ignore
  }
}

export const loadTokens = loadTokensFromStorage

export function clearTokens() {
  accessToken = null
  try {
    localStorage.removeItem('parish_access_token')
    localStorage.removeItem('parish_refresh_token')
  } catch {
    // Ignore
  }
}

type RefreshResult = 'success' | 'auth_failed' | 'network_offline'
let refreshPromise: Promise<RefreshResult> | null = null
// Render free instances can need roughly one minute to wake. Keep bootstrap
// bounded while allowing one cold-start window before offline fallback.
const REFRESH_REQUEST_TIMEOUT_MS = 65_000

/**
 * Refresh access token with mutex to prevent concurrent refresh calls.
 * Multiple parallel 401 responses will share the same refresh promise.
 * A-NEW-01/02: refresh qua HttpOnly cookie (credentials include) — không body token.
 * FE-01 (2026-08-14): phân biệt rõ ràng giữa network offline và auth failure (401/403).
 */
async function refreshAccessToken(): Promise<RefreshResult> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) return refreshPromise

  refreshPromise = doRefresh()
  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

async function doRefresh(): Promise<RefreshResult> {
  // A01 Phase 1 + A-NEW-01/02: token chỉ nằm trong HttpOnly cookie (credentials:
  // 'include' gửi kèm). KHÔNG gửi refresh token trong body — JS không có token này.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'network_offline'
  }
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: AbortSignal.timeout(REFRESH_REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        clearTokens()
        return 'auth_failed'
      }
      return 'network_offline'
    }
    const data = await res.json()
    const tokens = data.data || data
    setTokens(tokens.accessToken)
    return 'success'
  } catch {
    return 'network_offline'
  }
}

function redirectToLogin() {
  clearTokens()
  // ADR-045: snapshot mã hóa (PII) cũng phải dọn — tránh PII mồ côi trong Dexie
  // khi session chết bất ngờ (401) mà không qua authStore.logout().
  clearAuthSnapshot()
  try {
    localStorage.removeItem('parish_current_user')
  } catch {
    // Ignore
  }
  // A-NEW-27: dùng router navigate (đã đăng ký qua setNavigateToLogin) để preserve
  // React state; fallback window.location nếu chưa có handler (vd test / startup edge).
  if (navigateToLogin) {
    try {
      navigateToLogin()
      return
    } catch {
      // fallthrough → window.location
    }
  }
  window.location.href = '/login'
}

/**
 * SECURITY (2026-08-11) — A-NEW-10 hardening: khôi phục access token sau reload.
 * Access token KHÔNG còn persist ở localStorage → sau reload memory rỗng. Hàm này
 * gọi POST /auth/refresh (HttpOnly cookie — A-NEW-01/02) để lấy access token mới.
 * - Refresh thành công → setTokens(access) → memory có token, app hoạt động bình thường.
 * - Refresh thất bại (cookie hết hạn / revoked) → clearTokens + trả false.
 * - Offline (fetch lỗi) → trả false, KHÔNG xóa user — PWA offline vẫn xem dữ liệu đã sync (FE-01).
 */
export async function bootstrapAccessToken(): Promise<boolean> {
  if (accessToken) return true
  const res = await refreshAccessToken()
  return res === 'success'
}

const MAX_RETRIES = 3
const RETRY_BASE_MS = 1000

// SEC-NET-1 (2026-08-24): mọi fetch qua request() đều có timeout tường minh
// (AbortSignal.timeout). Trước đây fetch có thể treo vô hạn khi proxy chết /
// mạng di động yếu rớt gói mà không đóng TCP — UI chờ mãi không có error.
// Timeout bị abort → rơi vào nhánh network-error hiện có → retry idempotent
// theo A12 hoạt động đúng. PDF export (puppeteer render phía server) được
// cấp cửa sổ dài hơn.
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const BLOB_REQUEST_TIMEOUT_MS = 120_000

/**
 * A12 (2026-08-10): retry tự động chỉ an toàn với method idempotent.
 * - GET / HEAD / PUT / DELETE → retry (PUT/DELETE idempotent theo HTTP spec;
 *   replay sau commit không tạo thêm side-effect).
 * - POST / PATCH → retry CHỈ khi có Idempotency-Key (server dedup — students/classes/
 *   exams/grade-override đã hỗ trợ). Key có thể nằm ở header (overrideGrade) hoặc
 *   body (createStudent/createClass/createExam — truyền qua `allowRetry`).
 *   KHÔNG retry mù: nếu server đã commit mà response mất trên đường truyền, retry
 *   sẽ nhân đôi mutation.
 * Trước A12: network error / 5xx đều retry kể cả POST → duplicate users/notices/
 * notifications/import khi WiFi yếu (bối cảnh giáo xứ).
 */
function canAutoRetry(method: string, customHeaders?: Record<string, string>, allowRetry = false): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'PUT' || method === 'DELETE') return true
  if (method === 'POST' || method === 'PATCH') {
    if (allowRetry) return true
    return !!(customHeaders?.['Idempotency-Key'] || customHeaders?.['x-idempotency-key'])
  }
  return false
}

/**
 * Core request function with:
 * - JWT auto-refresh with mutex (prevents concurrent refresh race)
 * - Retry logic with exponential backoff for transient failures (method-aware — A12)
 * - Proper error classification
 */
async function request<T>(method: string, path: string, body?: unknown, retryCount = 0, customHeaders?: Record<string, string>, allowRetry = false, responseType: 'json' | 'blob' = 'json', keepEnvelope = false): Promise<T> {
  // SECURITY (2026-08-11): KHÔNG nạp access token từ localStorage — memory-only.
  // Nếu memory rỗng (sau reload), caller phải gọi bootstrapAccessToken() trước
  // (xem authStore.loadFromStorage / main.tsx). Refresh token nguồn duy nhất là
  // HttpOnly cookie (gửi tự động qua credentials: 'include').

  const isAuthRoute = path.startsWith('/auth/')
  if (!isAuthRoute && !accessToken) {
    // SECURITY (2026-08-11) — A-NEW-10 hardening: memory rỗng (sau reload) →
    // thử bootstrap qua HttpOnly cookie TRƯỚC khi gọi API.
    // FE-01 (2026-08-14): Phân biệt offline và auth failure:
    // - auth_failed (401/403) -> redirectToLogin()
    // - network_offline -> ném ApiError(0) để offline/IndexedDB fallback xử lý, KHÔNG logout local.
    const refreshRes = await refreshAccessToken()
    if (refreshRes === 'auth_failed') {
      redirectToLogin()
      throw new ApiError(401, 'Unauthorized — login required', path)
    }
    if (refreshRes === 'network_offline' || !accessToken) {
      throw new ApiError(0, 'Network offline — cannot reach server', path)
    }
  }

  const url = `${API_BASE}${path}`
  const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData
  const headers: Record<string, string> = { ...(isMultipart ? {} : { 'Content-Type': 'application/json' }), ...(customHeaders || {}) }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  const serializedBody = body === undefined ? undefined : isMultipart ? body : JSON.stringify(body)

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: serializedBody,
      // A01 Phase 1: bắt buộc để gửi/nhận HttpOnly cookie refresh (cùng site
      // & cross-origin khi API server riêng).
      credentials: 'include',
      signal: AbortSignal.timeout(responseType === 'blob' ? BLOB_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS),
    })
  } catch {
    // Network error — A12: chỉ retry method idempotent (hoặc có Idempotency-Key)
    if (canAutoRetry(method, customHeaders, allowRetry) && retryCount < MAX_RETRIES) {
      await sleep(RETRY_BASE_MS * Math.pow(2, retryCount))
      return request<T>(method, path, body, retryCount + 1, customHeaders, allowRetry, responseType, keepEnvelope)
    }
    throw new ApiError(0, 'Network error — unable to reach server', path)
  }

  // Handle 401 with mutex refresh or redirect to login (trừ auth routes như /auth/login, /auth/refresh)
  if (res.status === 401 && !isAuthRoute) {
    // A01 Phase 1 + A-NEW-01: refresh qua HttpOnly cookie (không cần memory token —
    // sau reload cookie vẫn hiệu lực).
    const refreshRes = await refreshAccessToken()
    if (refreshRes === 'success') {
      headers['Authorization'] = `Bearer ${accessToken}`
      res = await fetch(url, { method, headers, body: serializedBody, credentials: 'include', signal: AbortSignal.timeout(responseType === 'blob' ? BLOB_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS) })
    } else if (refreshRes === 'auth_failed') {
      redirectToLogin()
      throw new ApiError(401, 'Session expired — redirecting to login', path)
    } else {
      // network offline
      throw new ApiError(0, 'Network offline — cannot refresh session', path)
    }
  }

  // Handle 5xx with retry — A12: chỉ method idempotent (hoặc có Idempotency-Key)
  // 501 Not Implemented là cấu hình tĩnh (vd VAPID chưa set) — retry không bao giờ thành công, chỉ tạo spam 4×.
  if (res.status >= 500 && res.status !== 501 && canAutoRetry(method, customHeaders, allowRetry) && retryCount < MAX_RETRIES) {
    await sleep(RETRY_BASE_MS * Math.pow(2, retryCount))
    return request<T>(method, path, body, retryCount + 1, customHeaders, allowRetry, responseType, keepEnvelope)
  }

  if (!res.ok) {
    // API-DIAG (2026-08-25): backend offline qua platform proxy (Railway fallback)
    // — ném message hướng dẫn rõ ràng thay vì JSON "Application not found" của nền tảng.
    if (isBackendUnavailableResponse(res)) {
      throw new ApiError(res.status, BACKEND_UNAVAILABLE_MESSAGE, path)
    }
    const text = await res.text().catch(() => '')
    let details: any = undefined
    let issues: any[] | undefined
    let customMessage: string | undefined
    try {
      const parsed = JSON.parse(text)
      details = parsed?.error?.details
      // ADR-016 (sync-fix): zValidator 400 trả { success:false, error:{ issues:[...] } }.
      // Lưu issues để batch handler cách ly đúng record lỗi (thay vì retry mù cả batch),
      // và dựng message đọc được thay vì dump cả JSON vào console/UI.
      issues = Array.isArray(parsed?.error?.issues) ? parsed.error.issues : undefined
      // ADR-016 (users): Server trả error.message rõ ràng (vd USERNAME_EXISTS 409) —
      // phải ưu tiên lấy nó, nếu không UI hiển thị cả chuỗi JSON.
      if (typeof parsed?.error?.message === 'string' && parsed.error.message) {
        customMessage = parsed.error.message
      }
    } catch {}
    let message = text || res.statusText
    if (customMessage) {
      message = customMessage
    } else if (issues && issues.length > 0) {
      const first = issues[0]
      const field = Array.isArray(first?.path) && first.path.length > 0
        ? first.path.map(String).join('.')
        : undefined
      message = issues.slice(0, 2).map((i: any) => i?.message || 'dữ liệu không hợp lệ').join('; ')
      if (field) message = `[${field}] ${message}`
    }
    // 502 từ Vite proxy khi backend (Hono :3001) không chạy — body thường là HTML/plain
    // "Bad Gateway" của proxy, không phải JSON từ server. Thay bằng message hướng dẫn.
    if (res.status === 502 && !customMessage && !issues) {
      message = 'Không thể kết nối máy chủ — backend đang không chạy. Hãy mở `npm run dev:server` (hoặc `npm run dev:all`).'
    }
    const err = new ApiError(res.status, message, path)
    ;(err as any).details = details
    ;(err as any).issues = issues
    throw err
  }

  if (res.status === 204) return undefined as T
  if (responseType === 'blob') {
    return res.blob() as Promise<T>
  }
  const json = await res.json()
  // AUDIT-F8 fix (2026-08-22): keepEnvelope=true dành cho endpoint phân trang
  // (paginatedResponse) — caller cần cả `meta` (total/totalPages) chứ không chỉ
  // `data`. Trước đây envelope luôn bị bóc → AuditLogPage nhận mảng trần, đọc
  // res.data/res.meta = undefined → trang nhật ký hiển thị rỗng vĩnh viễn dù
  // backend trả đủ 92 bản ghi.
  if (!keepEnvelope && json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return json.data as T
  }
  return json as T
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Race p với deadline — trả fallback khi quá hạn; luôn clear timer (không leak). */
function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
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

/**
 * API-DIAG (2026-08-25): nhận diện phản hồi từ PLATFORM PROXY fallback của Railway —
 * khi domain backend (`*.up.railway.app`) trỏ vào nhưng KHÔNG có deployment nào
 * đang chạy (service bị pause/xóa/deploy fail), edge của Railway tự trả
 * `404/502/503` kèm header `x-railway-fallback: true` + body
 * {"message":"Application not found"}. Đây KHÔNG phải lỗi nghiệp vụ (vd sai
 * username/mật khẩu hay thiếu dữ liệu) mà là backend offline → hiển thị thông
 * điệp hướng dẫn thay vì dump JSON nền tảng gây hiểu nhầm.
 */
export function isBackendUnavailableResponse(res: Pick<Response, 'status' | 'headers'>): boolean {
  if (res.status !== 404 && res.status !== 502 && res.status !== 503) return false
  try {
    return (res.headers.get('x-railway-fallback') || '').trim().toLowerCase() === 'true'
  } catch {
    return false
  }
}

export const BACKEND_UNAVAILABLE_MESSAGE =
  'Máy chủ API hiện không khả dụng (backend chưa chạy hoặc đã dừng). Vui lòng thử lại sau ít phút hoặc báo quản trị viên khởi động lại dịch vụ backend.'

export const httpFetch = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

  // ─── Auth & Entities API ───
export const api = {
  login: (username: string, password: string) =>
    request<{
      user: { id: string; username: string; fullName: string; phone?: string | null; role: string; status: string; parishId: string; mustChangePassword?: number }
      accessToken: string
    }>('POST', '/auth/login', { username, password }),

  // ADR-045 (2026-08-16): GET /auth/me — rebuild snapshot đăng nhập (PII) khi
  // snapshot mã hóa local bị thiếu/hỏng (Dexie purge, khóa rotate, LAN không có crypto).
  me: () =>
    request<{ id: string; username: string; fullName: string; phone: string | null; role: string; status: string }>('GET', '/auth/me'),

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await request<{ success: boolean; accessToken: string }>('POST', '/auth/change-password', { currentPassword, newPassword })
    // Server đã hủy tokenVersion cũ và cấp token mới cùng response. Cập nhật
    // ngay memory token để phiên Settings/force-change không phải chờ 401+refresh.
    setTokens(response.accessToken)
    return response
  },

  // A06 (2026-08-10): admin-change-password / reset-password yêu cầu re-authentication —
  // gửi kèm adminPassword (mật khẩu HIỆN TẠI của admin đang thao tác).
  adminChangePassword: (userId: string, newPassword: string, adminPassword: string) =>
    request<{ success: boolean; message: string }>('POST', '/auth/admin-change-password', { userId, newPassword, adminPassword }),

  // ADR-087: request public chỉ tạo ticket; không tự đổi credential và response
  // không cho biết SĐT có tồn tại. Xử lý ticket vẫn là admin-only + re-auth.
  requestParentPasswordReset: (phone: string) =>
    request<{ accepted: boolean; message: string }>('POST', '/password-reset-requests', { phone }),
  getPasswordResetRequests: () =>
    request<Array<{
      id: string
      userId: string
      fullName: string
      username: string
      phone: string | null
      status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
      requestCount: number
      lastRequestedAt: string
    }>>('GET', '/password-reset-requests/admin'),
  resolvePasswordResetRequest: (requestId: string, adminPassword: string) =>
    request<{ username: string; tempPassword: string; fullName: string }>('POST', `/password-reset-requests/admin/${requestId}/reset`, { adminPassword }),
  dismissPasswordResetRequest: (requestId: string) =>
    request<{ dismissed: boolean }>('PATCH', `/password-reset-requests/admin/${requestId}/dismiss`, {}),

  // ADR-039: phụ huynh không tự đổi SĐT — gửi phone undefined để server giữ nguyên
  updateProfile: (fullName: string, phone?: string) =>
    request<{ id: string; username: string; fullName: string; phone: string | null; role: string; status: string }>('PUT', '/auth/profile', { fullName, phone }),

  // A-NEW-01 (2026-08-10): JS không giữ refresh token nữa → logout không gửi body token;
  // server revoke session qua HttpOnly cookie (credentials: 'include' đã bật sẵn).
  logout: () => request<{ success: boolean }>('POST', '/auth/logout', {}),

  // ─── Web Push ───
  // 200 { publicKey, configured:true } khi đã cấu hình; 200 { publicKey:null, configured:false } khi chưa (tránh 501 spam).
  // Giữ catch 501 legacy trong pushManager cho deploy cũ chưa redeploy.
  getVapidPublicKey: () =>
    request<{ publicKey: string | null; configured?: boolean }>('GET', '/notifications/vapid-public-key'),

  subscribePush: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ ok: boolean }>('POST', '/notifications/subscribe', sub),

  unsubscribePush: (endpoint: string) =>
    request<{ ok: boolean }>('POST', '/notifications/unsubscribe', { endpoint }),

  registerNativePush: (registration: { installationId: string; platform: 'android' | 'ios'; token: string }) =>
    request<{ ok: boolean }>('POST', '/notifications/native/register', registration),

  unregisterNativePush: (installationId: string) =>
    request<{ ok: boolean }>('POST', '/notifications/native/unregister', { installationId }),

  // ─── Parents (Cổng Phụ Huynh) ───
  getMyChildren: () => request<any[]>('GET', '/parents/my-children'),
  getStudentReportCard: (studentId: string, academicYear: string) =>
    request<ReportCardDTO>('GET', `/reports/report-card/${studentId}?academicYear=${encodeURIComponent(academicYear)}`),

  // ADR-022: liên kết Telegram — PH tự quản lý (link token 10 phút / status / toggle / revoke)
  getTelegramLinkStatus: () =>
    request<Array<{ chatId: string; telegramUsername: string | null; status: string; notificationsEnabled: number; linkedAt: string | null; lastSeenAt: string | null }>>('GET', '/parents/telegram/status'),
  createTelegramLinkToken: () =>
    request<{ token: string; expiresAt: string }>('POST', '/parents/telegram/link-token', {}),
  setTelegramNotifications: (enabled: boolean) =>
    request<{ enabled: boolean; updatedLinks: number }>('POST', '/parents/telegram/notifications', { enabled }),
  revokeTelegramLink: () =>
    request<{ revokedLinks: number }>('DELETE', '/parents/telegram/link'),

  // ─── Hộp thư góp ý ───
  getFeedbackTargets: () => request<FeedbackTarget[]>('GET', '/feedback/targets'),
  getFeedbackInbox: () => request<FeedbackMessage[]>('GET', '/feedback/inbox'),
  getPublicSentFeedback: () => request<FeedbackMessage[]>('GET', '/feedback/sent'),
  createFeedback: (data: CreateFeedbackInput) => request<FeedbackMessage>('POST', '/feedback', data),
  updateFeedbackStatus: (id: string, status: Exclude<FeedbackStatus, 'NEW'>) =>
    request<FeedbackMessage>('PATCH', `/feedback/${encodeURIComponent(id)}/status`, { status }),

  // ─── Leave Requests (Xin Phép Nghỉ Online) ───
  getLeaveRequests: (params?: { classId?: string; status?: string; date?: string; studentId?: string }) => {
    const qs = new URLSearchParams()
    if (params?.classId) qs.set('classId', params.classId)
    if (params?.status) qs.set('status', params.status)
    if (params?.date) qs.set('date', params.date)
    if (params?.studentId) qs.set('studentId', params.studentId)
    const q = qs.toString()
    return request<LeaveRequest[]>('GET', `/leave-requests${q ? `?${q}` : ''}`)
  },
  getPendingLeaveRequestsCount: () =>
    request<{ pendingCount: number }>('GET', '/leave-requests/pending-count'),
  createLeaveRequest: (data: { studentId: string; date: string; sessionTypes: string[]; reason: string; parentName?: string; parentPhone?: string }) =>
    request<LeaveRequest>('POST', '/leave-requests', data),
  reviewLeaveRequest: (id: string, data: { status: 'APPROVED' | 'REJECTED'; reviewNote?: string }) =>
    request<LeaveRequest>('PATCH', `/leave-requests/${id}/review`, data),
  cancelLeaveRequest: (id: string) =>
    request<{ ok: boolean; id: string; status: string }>('DELETE', `/leave-requests/${id}`),

  // ─── Question Bank & Exam Blueprint (ADR-096) ───
  listQuestionBank: (params?: { search?: string; status?: QuestionBankStatus; questionType?: QuestionBankType; branchId?: string; curriculumLevel?: string; difficulty?: QuestionDifficulty; lessonFrom?: number; lessonTo?: number; topic?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    Object.entries(params ?? {}).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)) })
    return request<{ items: QuestionBankItem[]; pagination: { limit: number; offset: number; nextOffset: number | null } }>('GET', `/question-bank/questions${qs.size ? `?${qs}` : ''}`)
  },
  getQuestionBankItem: (id: string) => request<QuestionBankItem>('GET', `/question-bank/questions/${encodeURIComponent(id)}`),
  createQuestionBankItem: (data: QuestionBankMutationInput) => request<QuestionBankItem>('POST', '/question-bank/questions', data),
  importQuestionBankItems: (items: QuestionBankMutationInput[]) =>
    request<{ importedCount: number; questionIds: string[]; status: 'draft' }>('POST', '/question-bank/questions/import', { items }),
  reviseQuestionBankItem: (id: string, data: QuestionBankMutationInput) =>
    request<QuestionBankItem>('PUT', `/question-bank/questions/${encodeURIComponent(id)}`, data),
  transitionQuestionBankItem: (id: string, action: 'submit' | 'reject' | 'approve' | 'activate' | 'archive') =>
    request<QuestionBankItem>('POST', `/question-bank/questions/${encodeURIComponent(id)}/lifecycle`, { action }),
  listExamBlueprints: () => request<ExamBlueprint[]>('GET', '/question-bank/blueprints'),
  getExamBlueprint: (id: string) => request<ExamBlueprint>('GET', `/question-bank/blueprints/${encodeURIComponent(id)}`),
  createExamBlueprint: (data: { name: string; description?: string | null; branchId?: string | null; curriculumLevel?: string | null; totalQuestions: number; maxScore: number; rules: ExamBlueprintRule[] }) =>
    request<ExamBlueprint>('POST', '/question-bank/blueprints', data),
  setExamBlueprintStatus: (id: string, status: 'active' | 'archived') =>
    request<ExamBlueprint>('POST', `/question-bank/blueprints/${encodeURIComponent(id)}/status`, { status }),
  buildExamFromQuestionBank: (data: { mode: 'manual' | 'blueprint'; questionIds?: string[]; blueprintId?: string; classId: string; subject: string; scoreType: string; semester: 1 | 2; academicYear: string; maxScore: number; variantCount: number }) =>
    request<ExamSession>('POST', '/question-bank/exams/build', data),

  // ─── Smart Exam Grading (Phase 1) ───
  // A12: auto-generate Idempotency-Key khi caller không truyền (như createStudent) —
  // server dedup examSessions.idempotencyKey (examService.ts:68-72).
  createExam: (data: { classId: string; subject: string; scoreType: string; maxScore?: number; semester: number; academicYear?: string; examType?: string; questionCount?: number; answerKey?: string; answerVariants?: string; questions?: string; idempotencyKey?: string }) => {
    const payload = data.idempotencyKey ? data : { ...data, idempotencyKey: newIdempotencyKey() }
    return request<any>('POST', '/exams', payload, 0, undefined, true)
  },
  getExamSessionsForClass: (classId: string, params?: { subject?: string; scoreType?: string; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.subject) qs.set('subject', params.subject)
    if (params?.scoreType) qs.set('scoreType', params.scoreType)
    if (params?.status) qs.set('status', params.status)
    const q = qs.toString()
    return request<any[]>('GET', `/exams/class/${encodeURIComponent(classId)}${q ? `?${q}` : ''}`)
  },
  getMyExamSessions: () => request<any[]>('GET', '/exams/my-classes'),
  getExam: (id: string) => request<any>('GET', `/exams/${id}`),
  decodeBarcode: (barcodeText: string) =>
    request<{ sessionId: string; studentId: string; classId: string; subject: string; examType: string; maxScore: number; questionCount: number; protocolVersion?: 2 | 3; templateMode?: 'integrated' | 'full_page'; examVersion?: string; formChecksum?: string }>('POST', '/exams/barcode/decode', { barcodeText }),
  updateAnswerKey: (id: string, answerKey: string, questionCount: number) =>
    request<{ session: any; rescored: number; skipped: number }>('PATCH', `/exams/${id}/answer-key`, { answerKey, questionCount }),
  updateAnswerVariants: (id: string, answerVariants: string, questionCount: number) =>
    request<{ session: any; rescored: number; skipped: number }>('PATCH', `/exams/${id}/answer-variants`, { answerVariants, questionCount }),
  generateExamVariantManifests: (id: string, variantCount: number) =>
    request<{ session: any; manifests: unknown }>('POST', `/exams/${id}/variant-manifests`, { variantCount }),
  saveExamResults: (id: string, results: { studentId: string; score: number; essayScore?: number; source?: string; answers?: string; scanMetadata?: string; examVersion?: string; clientMutationId?: string; attemptFingerprint?: string; capturedAt?: string }[]) => {
    const capturedAt = new Date().toISOString()
    const withMutationIds = results.map(result => ({
      ...result,
      clientMutationId: result.clientMutationId || newIdempotencyKey(),
      capturedAt: result.capturedAt || capturedAt,
    }))
    // Request header enables method-aware retry; durable dedup is enforced per
    // item by clientMutationId on the server, so a lost response is safe to replay.
    const requestId = withMutationIds.length === 1
      ? withMutationIds[0].clientMutationId
      : newIdempotencyKey()
    return request<{
      saved: number
      upserted: number
      total: number
      adjustments?: Array<{ studentId: string; clientScore: number; serverScore: number }>
      items?: Array<{
        clientMutationId?: string
        studentId: string
        status: 'created' | 'updated' | 'duplicate'
        clientScore: number
        serverScore: number
      }>
    }>('POST', `/exams/${id}/results`, { results: withMutationIds }, 0, { 'Idempotency-Key': requestId })
  },
  removeExamResult: (id: string, studentId: string) => request<{ deleted: boolean }>('DELETE', `/exams/${id}/results/${encodeURIComponent(studentId)}`),
  getExamResults: (id: string) => request<{ session: any; results: any[] }>('GET', `/exams/${id}/results`),
  completeExam: (id: string) => request<any>('POST', `/exams/${id}/complete`),
  reopenExam: (id: string) => request<any>('POST', `/exams/${id}/reopen`),
  deleteExam: (id: string) => request<{ deleted: boolean; sessionId: string; resultsDeleted: number }>('DELETE', `/exams/${id}`),

  // ─── Settings ───
  getSettings: () => request<any>('GET', '/settings'),
  updateSettings: (data: Record<string, unknown>) => request<any>('PUT', '/settings', data),

  // ─── Users ───
  getUsers: () => request<any[]>('GET', '/users'),
  getCatechists: () => request<any[]>('GET', '/users/catechists'),
  // ADR-027 (2026-08-12): username optional — server tự sinh `chức vụ_Tên thánh + Họ và tên`
  // từ holyName+fullName; gửi username = override thủ công (auto trùng). Phụ huynh: SĐT.
  createUser: (data: { username?: string; holyName?: string; fullName: string; phone?: string; role: string; assignedClasses?: string[] }) =>
    request<{ id: string; username: string; tempPassword: string }>('POST', '/users', data),
  updateUserStatus: (id: string, status: string) =>
    request<{ success: boolean }>('PUT', `/users/${id}/status`, { status }),
  updateUserAssignments: (id: string, assignedClasses: string[]) =>
    request<{ id: string; assignedClasses: string[] }>('PUT', `/users/${id}/assignments`, { assignedClasses }),
  // ADR-039 (2026-08-15): admin đổi SĐT (endpoint duy nhất; PH không tự đổi).
  // Phuhuynh có username = SĐT → server đồng bộ username kèm theo.
  updateUserPhone: (id: string, phone: string, adminPassword: string) =>
    request<{ id: string; phone: string; username: string; usernameChanged: boolean }>('PUT', `/users/${id}/phone`, { phone, adminPassword }),
  // A06 (2026-08-10): reset-password cũng yêu cầu adminPassword (re-authentication)
  resetUserPassword: (id: string, adminPassword: string) =>
    request<{ username: string; tempPassword: string }>('POST', `/users/${id}/reset-password`, { adminPassword }),
  forceLogoutUser: (id: string) =>
    request<{ success: boolean }>('POST', `/users/${id}/force-logout`),
  deleteUser: (id: string, adminPassword: string) =>
    request<{ id: string; deleted: true; alreadyDeleted: boolean }>('DELETE', `/users/${id}`, { adminPassword }),
  // ADR-026 (2026-08-12): cấp tài khoản phụ huynh hàng loạt từ students.parentPhone
  getParentProvisionPreview: () =>
    request<{ total: number; candidates: Array<{ phone: string; parentName: string; childrenCount: number }>; validPhoneCount: number; existingCount: number }>('GET', '/users/parent-provision-preview'),
  provisionParentAccounts: (adminPassword: string) =>
    request<{ total: number; successCount: number; skippedCount: number; errorCount: number; results: Array<{ phone: string; fullName: string; status: string; reason?: string; username?: string; tempPassword?: string }> }>('POST', '/users/provision-parents', { adminPassword }),

  // ─── Students ───
  getStudents: (params?: { updatedAfter?: string; updatedBefore?: string; limit?: number; page?: number }) => {
    const qs = new URLSearchParams()
    if (params?.updatedAfter) qs.set('updatedAfter', params.updatedAfter)
    if (params?.updatedBefore) qs.set('updatedBefore', params.updatedBefore)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.page) qs.set('page', String(params.page))
    const q = qs.toString()
    return request<{ success: boolean; data: any[]; total: number }>(
      'GET', `/students${q ? `?${q}` : ''}`, undefined, 0, undefined, false, 'json', true,
    ).then(envelope => ({ data: envelope.data || [], total: envelope.total ?? 0 }))
  },
  getStudent: (id: string) => request<any>('GET', `/students/${id}`),
  // A12: auto-generate Idempotency-Key khi caller không truyền — key ổn định suốt chuỗi
  // retry (key nằm trong body → allowRetry=true cho phép retry; server dedup qua
  // idx_students_idempotency khi response bị mất).
  createStudent: (data: Record<string, unknown>) => {
    const withKey = data.idempotencyKey ? data : { ...data, idempotencyKey: newIdempotencyKey() }
    return request<any>('POST', '/students', withKey, 0, undefined, true)
  },
  updateStudent: (id: string, data: Record<string, unknown>) => request<any>('PUT', `/students/${id}`, data),
  deleteStudent: (id: string) => request<{ success: boolean }>('DELETE', `/students/${id}`),
  validateStudents: (rows: any[]) => request<{ rows: any[]; classesNotFound: string[]; suggestedNewClasses?: { name: string; branch: string; academicYearId: string }[]; contentHash?: string; previousImport?: { batchId: string; fileName: string | null; createdAt: string; totalRows: number } | null }>('POST', '/students/validate', { rows }),
  importStudents: (payload: { rows: any[]; classMappings: Record<string, string | null>; newClasses: { name: string; branch: string; academicYearId: string }[]; duplicateActions: Record<string, 'skip' | 'update' | 'create'>; fileName?: string; serviceExclusions?: number[] }) =>
    request<{ imported: number; skipped: number; errors: number; classesCreated: string[]; batchId: string; studentChanges: Array<{ action: 'created' | 'updated'; student: Student }>; report: any[] }>('POST', '/students/import', payload),
  undoImport: (batchId: string) => request<{ undone: number; errors: string[] }>('POST', `/students/undo/${batchId}`),
  getImportHistory: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return request<any[]>('GET', `/students/history${q ? `?${q}` : ''}`)
  },
  getBatchDetail: (batchId: string) =>
    request<{ rows: any[]; counts: Record<string, number> }>('GET', `/students/batch/${batchId}`),

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
  batchUpsertGrades: (dataList: Record<string, unknown>[]) => request<{ results: { studentId: string; status: 'saved' | 'conflict' | 'error'; error?: string; currentGrade?: any; record?: any }[] }>('POST', '/grades/batch', { grades: dataList }),
  checkGradeImportDuplicate: (params: { hash: string; classId: string; semester: number; academicYear: string }) =>
    request<{ isDuplicate: boolean; importedAt?: string; totalRows?: number }>('POST', '/grades/check-import-duplicate', params),
  registerGradeImport: (params: { hash: string; classId: string; semester: number; academicYear: string; totalRows: number }) =>
    request<{ registered: boolean }>('POST', '/grades/register-import', params),
  // ADR-039: Khôi phục đợt nhập điểm (CREATE → xóa row, UPDATE → về trạng thái trước import).
  undoGradeImport: (params: { semester: number; academicYear: string; studentIds: string[] }) =>
    request<{ results: { studentId: string; status: 'restored' | 'deleted' | 'not-found' | 'no-audit' | 'not-clean' | 'expired' | 'forbidden' | 'locked' | 'error'; message?: string }[] }>('POST', '/grades/undo-import', params),

  // Override Endpoints
  overrideGrade: (id: string, data: { scoreField: string; manualValue: number; reasonCode?: string; reasonNote?: string; studentId?: string; academicYear?: string; semester?: number }, idempotencyKey?: string) => {
    const headers: Record<string, string> = {}
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
    return request<any>('PATCH', `/grades/${id}/override`, data, 0, headers)
  },
  getGradeOverrideHistory: (id: string) =>
    request<any[]>('GET', `/grades/${id}/override/history`),

  // ─── Mapping Memory (Learning System) ───
  getMappingMemory: (params?: { scope?: 'class' | 'student'; academicYearId?: string }) => {
    const qs = new URLSearchParams()
    if (params?.scope) qs.set('scope', params.scope)
    if (params?.academicYearId) qs.set('academicYearId', params.academicYearId)
    const q = qs.toString()
    return request<any[]>('GET', `/students/mappings${q ? `?${q}` : ''}`)
  },
  saveMappingMemory: (data: { scope: 'class' | 'student'; alias: string; entityId: string; entityName?: string; academicYearId?: string }) =>
    request<{ success: boolean }>('POST', '/students/mappings', data),
  deleteMappingMemory: (id: string) => request<{ success: boolean }>('DELETE', `/students/mappings/${id}`),

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
  batchUpsertAttendance: (date: string, type: string, records: { studentId: string; status: string; note?: string; version?: number }[]) =>
    request<{ results: { studentId: string; status: 'saved' | 'skipped' | 'conflict' | 'error'; reason?: string; record?: any }[]; total: number; successCount: number; skippedCount: number; conflictCount: number; errorCount: number }>('POST', '/attendance/batch', { date, type, records }),

  // ─── Classes ───
  getClasses: (params?: { updatedAfter?: string; updatedBefore?: string }) => {
    const qs = new URLSearchParams()
    if (params?.updatedAfter) qs.set('updatedAfter', params.updatedAfter)
    if (params?.updatedBefore) qs.set('updatedBefore', params.updatedBefore)
    const q = qs.toString()
    return request<any[]>('GET', `/classes${q ? `?${q}` : ''}`)
  },
  getClass: (id: string) => request<any>('GET', `/classes/${id}`),
  getClassBranches: () => request<any[]>('GET', '/classes/branches'),
  getClassAcademicYears: () => request<any[]>('GET', '/classes/academic-years'),
  createAcademicYear: (data: { id: string; startDate?: string; endDate?: string }) =>
    request<any>('POST', '/classes/academic-years', data),
  getAvailableTeachers: () => request<{ id: string; fullName: string; username: string; role: string }[]>('GET', '/classes/available-teachers'),
  createClass: (data: Record<string, unknown>) => {
    // A12: đảm bảo luôn có Idempotency-Key (classStore thường tự truyền; nếu không,
    // auto-generate) → retry an toàn, server dedup qua idx_classes_idempotency.
    const withKey = data.idempotencyKey ? data : { ...data, idempotencyKey: newIdempotencyKey() }
    return request<any>('POST', '/classes', withKey, 0, undefined, true)
  },
  updateClass: (id: string, data: Record<string, unknown>) => request<any>('PUT', `/classes/${id}`, data),
  deleteClass: (id: string) => request<{ success: boolean }>('DELETE', `/classes/${id}`),
  assignClassTeacher: (classId: string, userId: string, roleInClass: 'chunhiem' | 'phuta') =>
    request<{ ok: boolean }>('POST', `/classes/${classId}/assignments`, { userId, roleInClass }),
  unassignClassTeacher: (classId: string, userId: string) =>
    request<{ ok: boolean }>('DELETE', `/classes/${classId}/assignments/${userId}`),

  // ─── Notices ───
  getNotices: (updatedAfter?: string) => {
    const q = updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : ''
    return request<any[]>('GET', `/notices${q}`)
  },
  createNotice: (data: Record<string, unknown>) => request<any>('POST', '/notices', data),
  updateNotice: (id: string, data: Record<string, unknown>) => request<any>('PUT', `/notices/${id}`, data),
  deleteNotice: (id: string) => request<{ success: boolean }>('DELETE', `/notices/${id}`),

  // ─── Notifications ───
  sendReportCards: (data: { students: any[] }) =>
    request<{ sent: number; total: number }>('POST', '/notifications/smart/report-cards', data),

  // ─── Audit Logs ───
  getAuditLogs: (params?: { page?: number; limit?: number; userId?: string; action?: string; entityType?: string }) => {
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.userId) qs.set('userId', params.userId)
    if (params?.action) qs.set('action', params.action)
    if (params?.entityType) qs.set('entityType', params.entityType)
    const q = qs.toString()
    // keepEnvelope=true — cần meta (total/totalPages) cho phân trang
    return request<{ success: boolean; data: any[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('GET', `/audit-logs${q ? `?${q}` : ''}`, undefined, 0, undefined, false, 'json', true)
  },

  // ADR-047 / P3 — Policy Visualization Dashboard. Returns policy-related audit
  // entries enriched with studentId/studentName (for grade overrides & promotion
  // decisions) and `meta.summary` stats for the dashboard header.
  getPolicyHistory: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    const q = qs.toString()
    // keepEnvelope=true — cần meta (total/totalPages/summary) cho phân trang + KPI
    return request<{
      success: boolean
      data: any[]
      meta: {
        page: number
        limit: number
        total: number
        totalPages: number
        summary?: { policyUpdates: number; gradeOverrides: number; promotionDecisions: number; semesterLocks: number; total: number }
      }
    }>('GET', `/audit-logs/policy-history${q ? `?${q}` : ''}`, undefined, 0, undefined, false, 'json', true)
  },

  // ─── System (Purge v2.3) ───
  purgeAllData: (password: string, confirmKey: string) =>
    request<{ success: boolean; message: string; purgeVersion: number; countsBefore: Record<string, number> }>('POST', '/system/purge', { password, confirmKey }),

  // ─── Reports (PDF Generation) ───
  generatePDF: (htmlContent: string, options?: { format?: 'A4' | 'A3' | 'Letter'; landscape?: boolean; margin?: Record<string, string> }) =>
    request<Blob>('POST', '/reports/generate-pdf', { htmlContent, options }, 0, undefined, false, 'blob'),

  /**
   * Probe purge_version với fetch thô + AbortController (timeout, KHÔNG retry/backoff).
   * Check chạy trước mỗi pull delta — nếu retry với backoff 1s+2s+4s như `request()`
   * thì offline (fetch lỗi) sẽ treo sync 7s mỗi chu kỳ và làm timeout test 5s (CI).
   * Trả về null khi lỗi mạng / không phản hồi → bỏ qua check, pull delta vẫn chạy.
   *
   * PROD FIX (2026-08-12): trước đây probe fetch thô KHÔNG có Authorization khi
   * accessToken còn rỗng (memory-only, ngay sau reload) và KHÔNG refresh-on-401 —
   * khác request() → `/system/purge-version` trả 401 ở cycle sync đầu (race với
   * authStore.loadFromStorage bootstrap fire-and-forget), ghost-data check (A-NEW-02)
   * bị silent skip và log network đầy 401. Giờ đồng bộ hành vi với request():
   * - memory rỗng → bootstrap qua HttpOnly cookie TRƯỚC khi fetch (bounded timeout);
   * - 401 → refresh 1 lần (bounded timeout) rồi thử lại 1 lần — vẫn KHÔNG backoff.
   */
  probePurgeVersion: async (timeoutMs = 2000): Promise<number | null> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      if (!accessToken) {
        const bootstrapped = await withDeadline(bootstrapAccessToken().catch(() => false), timeoutMs, false)
        if (!bootstrapped || !accessToken) return null
      }

      const fetchProbe = async (): Promise<number | null | 'UNAUTHORIZED'> => {
        try {
          const res = await fetch(`${API_BASE}/system/purge-version`, {
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            credentials: 'include',
            signal: controller.signal,
          })
          if (res.status === 401) return 'UNAUTHORIZED'
          if (!res.ok) return null
          const json = (await res.json()) as { data?: { purgeVersion?: number } }
          const v = json?.data?.purgeVersion
          return typeof v === 'number' ? v : null
        } catch {
          return null
        }
      }

      let result = await fetchProbe()
      if (result === 'UNAUTHORIZED') {
        const refreshed = await withDeadline(refreshAccessToken().catch(() => false), timeoutMs, false)
        if (refreshed && accessToken) {
          const retry = await fetchProbe()
          if (retry !== 'UNAUTHORIZED') result = retry
        } else {
          result = null
        }
      }
      return result === 'UNAUTHORIZED' ? null : result
    } finally {
      clearTimeout(timer)
    }
  },

  finances: {
    getSummary: (academicYear?: string) =>
      request<FinanceSummary>('GET', academicYear ? `/finances/summary?academicYear=${encodeURIComponent(academicYear)}` : '/finances/summary'),

    getFunds: () =>
      request<Fund[]>('GET', '/finances/funds'),

    createFund: (data: CreateFundInput) =>
      request<Fund>('POST', '/finances/funds', data),

    getTransactions: async (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : ''
      // SEC-NET-1 (2026-08-24): chuyển từ fetch thô sang pipeline request() chung —
      // trước đây endpoint này KHÔNG có retry, refresh-on-401 lẫn timeout:
      // 401 sau 15m không tự refresh → lỗi "Failed to fetch transactions" giả.
      // keepEnvelope=true vì listResponse trả { success, data, total }.
      const json = await request<{ success: boolean; data: FinancialTransaction[]; total: number }>(
        'GET',
        `/finances/transactions${query}`,
        undefined,
        0,
        undefined,
        false,
        'json',
        true,
      )
      return { data: json.data || [], total: json.total ?? 0 }
    },

    createTransaction: (data: CreateTransactionInput) =>
      request<FinancialTransaction>('POST', '/finances/transactions', data),

    deleteTransaction: (id: string) =>
      request<{ deleted: boolean }>('DELETE', `/finances/transactions/${encodeURIComponent(id)}`),

    getClassFeeRecords: (classId: string, academicYear?: string, feeType?: string) => {
      const params = new URLSearchParams()
      if (academicYear) params.append('academicYear', academicYear)
      if (feeType) params.append('feeType', feeType)
      const q = params.toString() ? `?${params.toString()}` : ''
      return request<StudentFeeRecord[]>('GET', `/finances/classes/${encodeURIComponent(classId)}/fees${q}`)
    },

    updateStudentFee: (classId: string, data: any) =>
      request<StudentFeeRecord>('POST', `/finances/classes/${encodeURIComponent(classId)}/fees`, data),
  },

  // ─── Parish Events (Lịch Xứ Đoàn) — server persistence + tenant isolation
  getParishEvents: (params?: { from?: string; to?: string; category?: string }) => {
    const qs = new URLSearchParams()
    if (params?.from) qs.set('from', params.from)
    if (params?.to) qs.set('to', params.to)
    if (params?.category) qs.set('category', params.category)
    const q = qs.toString()
    return request<any[]>('GET', `/parish-events${q ? `?${q}` : ''}`)
  },
  createParishEvent: (data: { date: string; title: string; category: string; categoryName?: string; time?: string; location?: string }) =>
    request<any>('POST', '/parish-events', data),
  updateParishEvent: (id: string, data: any) =>
    request<any>('PUT', `/parish-events/${encodeURIComponent(id)}`, data),
  deleteParishEvent: (id: string) =>
    request<{ deleted: boolean }>('DELETE', `/parish-events/${encodeURIComponent(id)}`),

  parishProfile: {
    getSnapshot: () => request<import('../types/parishProfile').ParishProfileSnapshot>('GET', '/parish-profile'),
    updateProfile: (data: import('../types/parishProfile').ParishProfileInput) => request('PUT', '/parish-profile/profile', data),
    createPerson: (data: import('../types/parishProfile').ParishPersonInput) => request('POST', '/parish-profile/people', data),
    updatePerson: (id: string, data: import('../types/parishProfile').ParishPersonInput) => request('PUT', `/parish-profile/people/${encodeURIComponent(id)}`, data),
    deletePerson: (id: string) => request('DELETE', `/parish-profile/people/${encodeURIComponent(id)}`),
    createUnit: (data: import('../types/parishProfile').ParishUnitInput) => request('POST', '/parish-profile/units', data),
    updateUnit: (id: string, data: import('../types/parishProfile').ParishUnitInput) => request('PUT', `/parish-profile/units/${encodeURIComponent(id)}`, data),
    deleteUnit: (id: string) => request('DELETE', `/parish-profile/units/${encodeURIComponent(id)}`),
    createTerm: (data: import('../types/parishProfile').ParishTermInput) => request('POST', '/parish-profile/terms', data),
    updateTerm: (id: string, data: import('../types/parishProfile').ParishTermInput) => request('PUT', `/parish-profile/terms/${encodeURIComponent(id)}`, data),
    deleteTerm: (id: string) => request('DELETE', `/parish-profile/terms/${encodeURIComponent(id)}`),
    createRecord: (data: import('../types/parishProfile').ParishRecordInput) => request('POST', '/parish-profile/records', data),
    updateRecord: (id: string, data: import('../types/parishProfile').ParishRecordInput) => request('PUT', `/parish-profile/records/${encodeURIComponent(id)}`, data),
    deleteRecord: (id: string) => request('DELETE', `/parish-profile/records/${encodeURIComponent(id)}`),
    createExternalAsset: (data: import('../types/parishProfile').ParishExternalAssetInput) => request('POST', '/parish-profile/assets/external', data),
    uploadAsset: (data: import('../types/parishProfile').ParishUploadAssetInput) => {
      const form = new FormData()
      form.set('file', data.file)
      form.set('assetType', data.assetType)
      form.set('title', data.title)
      if (data.description) form.set('description', data.description)
      if (data.capturedOn) form.set('capturedOn', data.capturedOn)
      form.set('visibility', data.visibility)
      form.set('recordIds', JSON.stringify(data.recordIds))
      return request('POST', '/parish-profile/assets/upload', form)
    },
    updateAsset: (id: string, data: import('../types/parishProfile').ParishAssetInput) => request('PUT', `/parish-profile/assets/${encodeURIComponent(id)}`, data),
    deleteAsset: (id: string) => request('DELETE', `/parish-profile/assets/${encodeURIComponent(id)}`),
    downloadAsset: (id: string) => request<Blob>('GET', `/parish-profile/assets/${encodeURIComponent(id)}/download`, undefined, 0, undefined, false, 'blob'),
  },

  // ─── Sync coordination ───
  getSyncWatermark: () => request<{ serverTime: string; cursorVersion: number }>('GET', '/sync/watermark'),
}
