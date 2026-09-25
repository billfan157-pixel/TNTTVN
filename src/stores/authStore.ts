import { create } from 'zustand'
import type { Role } from '../types'
import { setTokens, clearTokens, loadTokensFromStorage, bootstrapAccessToken, api } from '../lib/api'
import { initPushSubscription, disablePushSubscription, isNativePushAvailable } from '../lib/pushManager'
import { resetAllStoresToDefault } from './resetStores'
import { getTenantScope, rehydrateTenantStores, setTenantScope } from '../lib/tenantScope'
import { AUTH_SNAPSHOT_KEY, clearAuthSnapshot, dexieStorage } from '../lib/db'
import { markSyncScopeInvalidated, quarantineInvalidatedSyncScope, type SyncOwnerScope } from '../lib/syncSessionBoundary'

export interface AuthUser {
  id: string
  username: string
  fullName: string
  role: Role
  status: string
  parishId: string
  phone?: string | null
  mustChangePassword?: number
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  authReady: boolean
  error: string | null
  requiresPasswordChange: boolean

  login: (username: string, password: string) => Promise<boolean>
  logout: (options?: LogoutOptions) => Promise<LogoutResult>
  setUser: (user: AuthUser) => void
  clearError: () => void
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>
  loadFromStorage: () => Promise<void>
}

export interface LogoutResult {
  serverConfirmed: boolean
  snapshotCleared: boolean
}

export interface LogoutOptions {
  serverRejected?: boolean
  scope?: SyncOwnerScope
}

let logoutInFlight: Promise<LogoutResult> | null = null

// ADR-045 (2026-08-16): chia 2 tầng persist cho session state:
// 1) MARKER (parish_current_user) — CHỈ { id, role, parishId }, không chứa PII,
//    ở localStorage → router guard / api.isAuthenticated() / syncStore chạy đồng bộ.
// 2) SNAPSHOT (parish_auth_user) — bản đầy đủ (username, fullName, phone = SĐT PH…)
//    MÃ HÓA AES-GCM tại-rest trong Dexie (dexieStorage, tenant-scoped, khóa
//    non-extractable) → XSS cùng origin không đọc được PII từ localStorage.
// Tài khoản PH: username == SĐT (ADR-022/026/027) → snapshot là điểm lộ PII chính.
const MARKER_KEY = 'parish_current_user'

interface AuthMarker {
  id: string
  role: string
  parishId: string
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

async function activateScope(user: AuthUser): Promise<void> {
  setTenantScope({ parishId: user.parishId, userId: user.id })
  await rehydrateTenantStores()
}

function toAuthUser(res: {
  id: string
  username: string
  fullName: string
  phone?: string | null
  role: string
  status: string
  parishId: string
  mustChangePassword?: number
}): AuthUser {
  return {
    id: res.id,
    username: res.username,
    fullName: res.fullName,
    role: res.role as Role,
    status: res.status || 'ACTIVE',
    parishId: res.parishId,
    phone: res.phone,
    mustChangePassword: res.mustChangePassword,
  }
}

function readMarker(): AuthMarker | null {
  try {
    const raw = localStorage.getItem(MARKER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthMarker>
    if (parsed && typeof parsed.id === 'string' && parsed.id && typeof parsed.role === 'string' && parsed.role && typeof parsed.parishId === 'string' && parsed.parishId) {
      return { id: parsed.id, role: parsed.role, parishId: parsed.parishId }
    }
  } catch {
    // ignore
  }
  return null
}

function writeMarker(user: AuthUser): void {
  try {
    localStorage.setItem(
      MARKER_KEY,
      JSON.stringify({ id: user.id, role: user.role, parishId: user.parishId } satisfies AuthMarker),
    )
  } catch {
    // ignore
  }
}

function clearMarker(): void {
  try {
    localStorage.removeItem(MARKER_KEY)
  } catch {
    // ignore
  }
}

// Snapshot mã hóa fail-safe: lỗi Dexie/crypto (vd LAN HTTP không có crypto.subtle)
// KHÔNG được làm hỏng login — marker tối thiểu vẫn đủ cho guard, app chạy bình thường.
async function persistSnapshot(user: AuthUser): Promise<void> {
  try {
    await dexieStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(user))
  } catch (err) {
    console.warn('[authStore] Không lưu được snapshot mã hóa (Dexie/crypto không khả dụng) — chỉ giữ marker tối thiểu:', err)
  }
}

async function loadSnapshot(): Promise<AuthUser | null> {
  try {
    const raw = await dexieStorage.getItem(AUTH_SNAPSHOT_KEY)
    if (!raw) return null
    const user = JSON.parse(raw) as AuthUser
    if (user && user.id && user.parishId) return user
  } catch {
    // ignore
  }
  return null
}

async function persistAuth(user: AuthUser): Promise<void> {
  writeMarker(user)
  await persistSnapshot(user)
}

function clearAuth(): void {
  clearMarker()
  void clearAuthSnapshot().catch(() => {})
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  authReady: false,
  error: null,
  requiresPasswordChange: false,

  login: async (username: string, password: string) => {
    if (logoutInFlight) await logoutInFlight
    // authReady ý nghĩa "session bootstrap đã phân định" — login do người dùng chủ
    // động khởi phát nên KHÔNG flip authReady về false: RootLayout sẽ không unmount
    // trang login giữa chừng, giữ nguyên form (và thông tin đã gõ) khi login thất bại.
    // isLoading là trạng thái phản hồi UI duy nhất trong lúc submit.
    set({ isLoading: true, error: null })
    try {
      const res = await api.login(username, password)
      if (res && res.accessToken && res.user.parishId) {
        setTokens(res.accessToken)
        const user = toAuthUser(res.user)
        await resetAllStoresToDefault({ clearPersisted: false })
        await activateScope(user)
        // ADR-045: marker (localStorage) + snapshot (Dexie mã hóa). Chờ snapshot ghi
        // xong để reload ngay sau login không bị rơi vào đường rebuild /auth/me.
        await persistAuth(user)
        const requiresChange = user.status === 'FORCE_PASSWORD_CHANGE' || user.mustChangePassword === 1
        set({ user, isAuthenticated: true, isLoading: false, authReady: true, requiresPasswordChange: requiresChange })
        if (!requiresChange) initPushSubscription().catch(console.warn)
        return true
      }
      set({ error: 'Đăng nhập không thành công hoặc thiếu tenant context', isLoading: false, authReady: true })
      return false
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tên đăng nhập hoặc mật khẩu không chính xác!'
      set({ error: message, isLoading: false, authReady: true })
      return false
    }
  },

  logout: (options = {}) => {
    if (logoutInFlight) return logoutInFlight
    const activeUser = get().user
    const activeScope = getTenantScope()
    const invalidatedScope = options.serverRejected
      ? options.scope || (activeUser ? { parishId: activeUser.parishId, userId: activeUser.id } : activeScope)
      : null
    if (invalidatedScope) markSyncScopeInvalidated(invalidatedScope)
    disablePushSubscription().catch(console.warn)
    clearTokens()
    clearMarker()
    set({ user: null, isAuthenticated: false, isLoading: true, authReady: true, requiresPasswordChange: false, error: null })

    logoutInFlight = (async () => {
      // Start after clearTokens, so transport observes the post-logout identity
      // generation. Attach rejection handling immediately, even during cleanup.
      const serverResult = Promise.resolve().then(() => api.logout()).then(
        result => result?.serverConfirmed === true,
        () => false,
      )
      let queueQuarantined = true
      if (invalidatedScope) {
        try {
          await quarantineInvalidatedSyncScope(invalidatedScope)
        } catch {
          // The durable invalidation marker remains. runSyncFlow will retry the
          // quarantine and fail before sending anything if IndexedDB still fails.
          queueQuarantined = false
        }
      }
      let snapshotCleared = true
      try {
        // Its physical key requires the outgoing tenant scope.
        await clearAuthSnapshot()
      } catch {
        snapshotCleared = false
      }
      let tenantCacheCleared = true
      try {
        await resetAllStoresToDefault()
      } catch {
        tenantCacheCleared = false
      }
      setTenantScope(null)
      const serverConfirmed = await serverResult
      const warnings = [
        ...(!serverConfirmed ? ['Đã đăng xuất trên thiết bị này, nhưng chưa xác nhận được thu hồi phiên trên máy chủ.'] : []),
        ...(!snapshotCleared ? ['Không thể xác nhận xóa dữ liệu phiên cục bộ đã mã hóa.'] : []),
        ...(!tenantCacheCleared ? ['Không thể xác nhận xóa toàn bộ dữ liệu tenant cục bộ.'] : []),
        ...(!queueQuarantined ? ['Các thay đổi offline của phiên đã bị thu hồi đang bị khóa và chưa thể hoàn tất cách ly.'] : []),
      ]
      set({ isLoading: false, error: warnings.length ? warnings.join(' ') : null })
      return { serverConfirmed, snapshotCleared }
    })().finally(() => { logoutInFlight = null })
    return logoutInFlight
  },

  setUser: (user: AuthUser) => {
    if (logoutInFlight) throw new Error('Cannot activate user while logout is pending')
    if (!user.parishId) throw new Error('Cannot activate user without parishId')
    setTenantScope({ parishId: user.parishId, userId: user.id })
    void persistAuth(user)
    set({ user, isAuthenticated: true, authReady: true })
  },

  clearError: () => set({ error: null }),

  changePassword: async (currentPassword: string, newPassword: string) => {
    set({ isLoading: true, error: null })
    try {
      await api.changePassword(currentPassword, newPassword)
      const user = get().user
      if (user) {
        const updatedUser = { ...user, status: 'ACTIVE', mustChangePassword: 0 }
        void persistAuth(updatedUser)
        set({ user: updatedUser, requiresPasswordChange: false, isLoading: false })
      } else set({ isLoading: false })
      return true
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể đổi mật khẩu'
      set({ error: message, isLoading: false })
      return false
    }
  },

  loadFromStorage: async () => {
    if (logoutInFlight) await logoutInFlight
    set({ authReady: false })
    loadTokensFromStorage()
    // ADR-045: đọc marker trước (localStorage, đồng bộ) — guard luôn chạy được kể cả
    // khi Dexie chưa init xong (main.tsx: loadFromStorage chạy trước initDB).
    const marker = readMarker()
    const previousScope = getTenantScope()
    if (!marker) {
      if (previousScope) await resetAllStoresToDefault({ clearPersisted: false })
      setTenantScope(null)
      set({ user: null, isAuthenticated: false, authReady: true })
      return
    }
    try {
      if (previousScope && (previousScope.parishId !== marker.parishId || previousScope.userId !== marker.id)) {
        await resetAllStoresToDefault({ clearPersisted: false })
      }
      // Cần scope (parishId:userId) TRƯỚC khi đọc snapshot scoped trong Dexie.
      setTenantScope({ parishId: marker.parishId, userId: marker.id })
    } catch {
      clearAuth()
      setTenantScope(null)
      set({ user: null, isAuthenticated: false, authReady: true })
      return
    }

    try {
      let user = await loadSnapshot()
      if (user && (user.id !== marker.id || user.parishId !== marker.parishId)) {
        // The marker is cross-tab shared. Never activate a snapshot that was
        // loaded under a different document owner.
        user = null
      }
      if (!user) {
        // Snapshot mã hóa thiếu/hỏng: Dexie bị purge, khóa rotate, hoặc LAN HTTP
        // không có crypto.subtle → thử rebuild từ server qua GET /auth/me.
        // Offline → xem như chưa đăng nhập (không giữ session không xác thực được).
        if (isOffline()) {
          clearAuth()
          setTenantScope(null)
          set({ user: null, isAuthenticated: false, authReady: true })
          return
        }
        const refreshed = await bootstrapAccessToken()
        if (!refreshed) {
          if (logoutInFlight) await logoutInFlight
          clearAuth()
          setTenantScope(null)
          set({ user: null, isAuthenticated: false, authReady: true })
          return
        }
        try {
          const me = await api.me()
          user = toAuthUser(me)
          if (user.id !== marker.id || user.parishId !== marker.parishId) {
            throw new Error('Authenticated server identity does not match this document owner')
          }
        } catch {
          clearAuth()
          setTenantScope(null)
          set({ user: null, isAuthenticated: false, authReady: true })
          return
        }
        await persistAuth(user)
      }

      const refreshed = await bootstrapAccessToken()
      if (!refreshed && !isOffline()) {
        if (logoutInFlight) await logoutInFlight
        clearAuth()
        setTenantScope(null)
        set({ user: null, isAuthenticated: false, authReady: true })
        return
      }

      await activateScope(user)
      const requiresChange = user.status === 'FORCE_PASSWORD_CHANGE' || user.mustChangePassword === 1
      set({ user, isAuthenticated: true, authReady: true, requiresPasswordChange: requiresChange })
      if (!requiresChange && (isNativePushAvailable() || (typeof Notification !== 'undefined' && Notification.permission === 'granted'))) {
        initPushSubscription().catch(console.warn)
      }
    } catch {
      clearAuth()
      setTenantScope(null)
      set({ user: null, isAuthenticated: false, authReady: true })
    }
  },
}))
