// Phase 3: transport core tách từ lib/api.ts (verbatim + export request/newIdempotencyKey/
// API_BASE/refreshAccessToken/withDeadline cho domain modules). Auth/refresh/retry/envelope giữ nguyên.
import { clearAuthSnapshot } from '../db'
import { captureTenantScope, isTenantScopeCurrent, type TenantScopeSnapshot } from '../tenantScope'
// All tabs share the HttpOnly cookie. The server still rejects replay from
// clients that cannot coordinate through this origin's Web Locks.
export async function withRefreshSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('catevia-refresh-session', { mode: 'exclusive' }, operation)
  }
  return operation()
}

// SECURITY (2026-08-11) — A-NEW-10 hardening: access token CHỈ tồn tại trong MEMORY.
// Trước đây persist ở localStorage (parish_access_token) → XSS cùng origin đọc được
// (dù TTL 15 phút). Giờ:
// - setTokens: chỉ set memory, KHÔNG ghi localStorage.
// - loadTokensFromStorage: KHÔNG đọc token từ localStorage — chỉ dọn legacy key.
//   Sau reload, access token được lấy lại qua POST /auth/refresh (HttpOnly cookie)
//   — xem bootstrapAccessToken().
// - clearTokens: xóa memory + dọn mọi legacy key phòng trường hợp version cũ để sót.
let accessToken: string | null = null
// Monotonic identity boundary for in-flight requests. It changes on explicit
// login/logout, but not on an access-token rotation for the same session.
let authSessionGeneration = 0

function removeLegacyTokenStorage(): void {
  try {
    localStorage.removeItem('parish_access_token')
    localStorage.removeItem('parish_refresh_token')
  } catch {
    // Ignore storage issues
  }
}

// A-NEW-27 (2026-08-11): KHÔNG import static { router } từ '../router' — tạo chu kỳ
// import tròn (api → router → stores → api) → stores gọi isAuthenticated() lúc module
// đang khởi tạo → ReferenceError TDZ (accessToken chưa init). Thay bằng handler
// navigate-to-login được đăng ký sau khi router tạo xong (router.tsx) — phá vòng,
// vẫn giữ router navigate (preserve React state) thay cho window.location.
let navigateToLogin: (() => void) | null = null
export function setNavigateToLogin(fn: () => void): void {
  navigateToLogin = fn
}

export const API_BASE = import.meta.env.VITE_API_BASE || '/api'


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
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

// A-NEW-01 (2026-08-10): client CHỈ nhận access token. Refresh token không bao giờ
// tồn tại trong JS state — nguồn duy nhất là HttpOnly cookie (server set/rotate).
export function setTokens(access: string) {
  accessToken = access
  authSessionGeneration++
  // SECURITY (2026-08-11): KHÔNG persist access token vào localStorage nữa — chỉ
  // memory. Xóa key cũ nếu còn sót từ version trước (dọn dẹp phòng thủ).
  removeLegacyTokenStorage()
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
  authSessionGeneration++
  removeLegacyTokenStorage()
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
export async function refreshAccessToken(): Promise<RefreshResult> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) return refreshPromise

  const generation = authSessionGeneration
  refreshPromise = withRefreshSessionLock(() =>
    generation === authSessionGeneration ? doRefresh() : Promise.resolve('auth_failed' as const),
  )
  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

async function doRefresh(): Promise<RefreshResult> {
  const refreshSessionGeneration = authSessionGeneration
  const refreshOwner = captureTenantScope()
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
    if (authSessionGeneration !== refreshSessionGeneration) return 'auth_failed'
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        clearTokens()
        return 'auth_failed'
      }
      return 'network_offline'
    }
    const data = await res.json()
    const tokens = data.data || data
    // Logout/account switch won the race: never let a stale refresh response
    // resurrect the old browser session.
    if (authSessionGeneration !== refreshSessionGeneration) return 'auth_failed'
    // Refresh cookies are origin-wide while tenant scope is document-local.
    // Reject a token rotated for a different account by another tab.
    if (refreshOwner && (
      !isTenantScopeCurrent(refreshOwner) ||
      tokens.userId !== refreshOwner.userId ||
      tokens.parishId !== refreshOwner.parishId
    )) {
      clearTokens()
      return 'auth_failed'
    }

    const wasUnauthenticated = accessToken === null
    accessToken = tokens.accessToken
    if (wasUnauthenticated) authSessionGeneration++
    removeLegacyTokenStorage()
    return 'success'
  } catch {
    return 'network_offline'
  }
}

function redirectToLogin() {
  clearTokens()
  // ADR-045: snapshot mã hóa (PII) cũng phải dọn — tránh PII mồ côi trong Dexie
  // khi session chết bất ngờ (401) mà không qua authStore.logout().
  void clearAuthSnapshot().catch(() => {})
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
  if (res === 'auth_failed') redirectToLogin()
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
 * P1-4: combine a caller-supplied abort signal (superseded selections) with
 * the transport timeout. Prefers native AbortSignal.any with a manual
 * fallback so older webviews never break every request.
 */
function combineWithTimeout(externalSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  if (!externalSignal) return timeoutSignal
  const nativeAny = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any
  if (typeof nativeAny === 'function') return nativeAny.call(AbortSignal, [externalSignal, timeoutSignal])
  const controller = new AbortController()
  const abortFromExternal = () => {
    timeoutSignal.removeEventListener('abort', abortFromTimeout)
    controller.abort()
  }
  const abortFromTimeout = () => {
    externalSignal.removeEventListener('abort', abortFromExternal)
    controller.abort()
  }
  if (externalSignal.aborted) abortFromExternal()
  else if (timeoutSignal.aborted) abortFromTimeout()
  else {
    externalSignal.addEventListener('abort', abortFromExternal, { once: true })
    timeoutSignal.addEventListener('abort', abortFromTimeout, { once: true })
  }
  return controller.signal
}

function requestAbortedError(path: string): ApiError {
  // Superseded by a newer selection — never retried, never treated as offline.
  return new ApiError(0, 'Request superseded — a newer selection replaced it', path, 'REQUEST_ABORTED')
}

interface RequestContinuity {
  generation: number
  owner: TenantScopeSnapshot | null
}

function captureRequestContinuity(): RequestContinuity {
  return { generation: authSessionGeneration, owner: captureTenantScope() }
}

function assertRequestContinuity(expected: RequestContinuity, path: string): void {
  // Explicit logout intentionally tears down local identity before the cookie
  // revocation response arrives. Its acknowledgement cannot authorize or
  // mutate tenant data, so it is the sole owner-continuity exception.
  if (path === '/auth/logout') return
  const ownerStillCurrent = expected.owner
    ? isTenantScopeCurrent(expected.owner)
    : captureTenantScope() === null
  if (authSessionGeneration !== expected.generation || !ownerStillCurrent) {
    throw new ApiError(401, 'Authentication owner changed while request was in flight', path)
  }
}

/**
 * Core request function with:
 * - JWT auto-refresh with mutex (prevents concurrent refresh race)
 * - Retry logic with exponential backoff for transient failures (method-aware — A12)
 * - Proper error classification
 * - Optional caller abort signal (P1-4): aborts superseded detail loads early
 *   instead of letting them run to the transport timeout.
 */
export async function request<T>(method: string, path: string, body?: unknown, retryCount = 0, customHeaders?: Record<string, string>, allowRetry = false, responseType: 'json' | 'blob' = 'json', keepEnvelope = false, externalSignal?: AbortSignal, expectedContinuity?: RequestContinuity): Promise<T> {
  const continuity = expectedContinuity || captureRequestContinuity()
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

  // Capture once for the whole logical request. A recursive retry must keep
  // the original owner instead of adopting ambient auth after backoff.
  assertRequestContinuity(continuity, path)

  const url = `${API_BASE}${path}`
  const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData
  const headers: Record<string, string> = { ...(isMultipart ? {} : { 'Content-Type': 'application/json' }), ...(customHeaders || {}) }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  const serializedBody = body === undefined ? undefined : isMultipart ? body : JSON.stringify(body)
  const timeoutMs = responseType === 'blob' ? BLOB_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: serializedBody,
      // A01 Phase 1: bắt buộc để gửi/nhận HttpOnly cookie refresh (cùng site
      // & cross-origin khi API server riêng).
      credentials: 'include',
      signal: combineWithTimeout(externalSignal, timeoutMs),
    })
  } catch {
    assertRequestContinuity(continuity, path)
    // P1-4: a caller-aborted (superseded) request must neither retry nor
    // masquerade as a network/offline failure.
    if (externalSignal?.aborted) {
      throw requestAbortedError(path)
    }
    // Network error — A12: chỉ retry method idempotent (hoặc có Idempotency-Key)
    if (canAutoRetry(method, customHeaders, allowRetry) && retryCount < MAX_RETRIES) {
      await sleep(RETRY_BASE_MS * Math.pow(2, retryCount))
      assertRequestContinuity(continuity, path)
      return request<T>(method, path, body, retryCount + 1, customHeaders, allowRetry, responseType, keepEnvelope, externalSignal, continuity)
    }
    throw new ApiError(0, 'Network error — unable to reach server', path)
  }

  assertRequestContinuity(continuity, path)

  // Handle 401 with mutex refresh or redirect to login (trừ auth routes như /auth/login, /auth/refresh)
  if (res.status === 401 && !isAuthRoute) {
    // A01 Phase 1 + A-NEW-01: refresh qua HttpOnly cookie (không cần memory token —
    // sau reload cookie vẫn hiệu lực).
    const refreshRes = await refreshAccessToken()
    if (refreshRes === 'success') {
      assertRequestContinuity(continuity, path)
      headers['Authorization'] = `Bearer ${accessToken}`
      if (externalSignal?.aborted) {
        throw requestAbortedError(path)
      }
      res = await fetch(url, { method, headers, body: serializedBody, credentials: 'include', signal: combineWithTimeout(externalSignal, timeoutMs) })
      assertRequestContinuity(continuity, path)
      if (externalSignal?.aborted) {
        throw requestAbortedError(path)
      }
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
    if (externalSignal?.aborted) {
      throw requestAbortedError(path)
    }
    await sleep(RETRY_BASE_MS * Math.pow(2, retryCount))
    assertRequestContinuity(continuity, path)
    return request<T>(method, path, body, retryCount + 1, customHeaders, allowRetry, responseType, keepEnvelope, externalSignal, continuity)
  }

  if (!res.ok) {
    // API-DIAG (2026-08-25): backend offline qua platform proxy (Railway fallback)
    // — ném message hướng dẫn rõ ràng thay vì JSON "Application not found" của nền tảng.
    if (isBackendUnavailableResponse(res)) {
      throw new ApiError(res.status, BACKEND_UNAVAILABLE_MESSAGE, path)
    }
    const text = await res.text().catch(() => '')
    assertRequestContinuity(continuity, path)
    let details: any = undefined
    let issues: any[] | undefined
    let customMessage: string | undefined
    let errorCode: string | undefined
    try {
      const parsed = JSON.parse(text)
      errorCode = typeof parsed?.error?.code === 'string' ? parsed.error.code : undefined
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
    const err = new ApiError(res.status, message, path, errorCode)
    ;(err as any).details = details
    ;(err as any).issues = issues
    ;(err as any).code = errorCode
    throw err
  }

  if (res.status === 204) return undefined as T
  if (responseType === 'blob') {
    const blob = await res.blob()
    assertRequestContinuity(continuity, path)
    return blob as T
  }
  const json = await res.json()
  assertRequestContinuity(continuity, path)
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
export function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

export class ApiError extends Error {
  status: number
  path: string
  code?: string
  constructor(status: number, message: string, path: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.path = path
    this.code = code
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
