import { describe, it, expect, beforeEach, vi } from 'vitest'

// AUTHSTORE-TEST-1 (2026-08-24): authStore trước đây chỉ 1.63% coverage — lifecycle
// token/session client (login/logout/loadFromStorage/changePassword) gần như chưa
// từng được verify ở mức unit dù là vùng Security ưu tiên #1 của dự án.

const { mockApi, snapshotStore } = vi.hoisted(() => ({
  mockApi: {
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue({ serverConfirmed: true }),
    changePassword: vi.fn(),
    me: vi.fn(),
  },
  snapshotStore: new Map<string, string>(),
}))

vi.mock('../../lib/api', () => ({
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  loadTokensFromStorage: vi.fn(),
  bootstrapAccessToken: vi.fn(),
  api: mockApi,
}))

vi.mock('../../lib/pushManager', () => ({
  initPushSubscription: vi.fn().mockResolvedValue(undefined),
  disablePushSubscription: vi.fn().mockResolvedValue(undefined),
  isNativePushAvailable: vi.fn(() => false),
}))

vi.mock('../../stores/resetStores', () => ({
  resetAllStoresToDefault: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/tenantScope', () => ({
  getTenantScope: vi.fn(() => null),
  setTenantScope: vi.fn(),
  rehydrateTenantStores: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/syncSessionBoundary', () => ({
  markSyncScopeInvalidated: vi.fn(),
  quarantineInvalidatedSyncScope: vi.fn().mockResolvedValue(0),
}))

vi.mock('../../lib/db', () => ({
  AUTH_SNAPSHOT_KEY: 'parish_auth_user',
  clearAuthSnapshot: vi.fn(async () => snapshotStore.clear()),
  dexieStorage: {
    getItem: vi.fn(async (k: string) => snapshotStore.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { snapshotStore.set(k, v) }),
    removeItem: vi.fn(async (k: string) => { snapshotStore.delete(k) }),
  },
}))

import { useAuthStore } from '../../stores/authStore'
import { setTokens, clearTokens, loadTokensFromStorage, bootstrapAccessToken } from '../../lib/api'
import { setTenantScope } from '../../lib/tenantScope'
import { resetAllStoresToDefault } from '../../stores/resetStores'

const fullUser = {
  id: 'USR-1',
  username: '0901234567',
  fullName: 'Nguyễn Văn A',
  role: 'chunhiem',
  status: 'ACTIVE',
  parishId: 'PX-1',
  phone: '0901234567',
}

function freshState() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    authReady: false,
    error: null,
    requiresPasswordChange: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  snapshotStore.clear()
  freshState()
})

describe('authStore — login', () => {
  it('login thành công → marker localStorage CHỈ chứa {id,role,parishId} (không PII)', async () => {
    mockApi.login.mockResolvedValue({ accessToken: 'acc-1', user: fullUser })

    const ok = await useAuthStore.getState().login('0901234567', 'Passw0rd!')

    expect(ok).toBe(true)
    expect(setTokens).toHaveBeenCalledWith('acc-1')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(resetAllStoresToDefault).toHaveBeenCalled()

    const marker = JSON.parse(localStorage.getItem('parish_current_user')!)
    expect(marker).toEqual({ id: 'USR-1', role: 'chunhiem', parishId: 'PX-1' })
    // PII (username=SĐT, fullName, phone) KHÔNG được nằm trong localStorage.
    expect(localStorage.getItem('parish_current_user')).not.toContain('Nguyễn Văn A')
    expect(localStorage.getItem('parish_current_user')).not.toContain('0901234567')
  })

  it('login FORCE_PASSWORD_CHANGE → requiresPasswordChange=true', async () => {
    mockApi.login.mockResolvedValue({
      accessToken: 'acc-2',
      user: { ...fullUser, status: 'FORCE_PASSWORD_CHANGE' },
    })
    await useAuthStore.getState().login('u', 'p')
    expect(useAuthStore.getState().requiresPasswordChange).toBe(true)
  })

  it('login sai mật khẩu → error, không authenticated', async () => {
    mockApi.login.mockRejectedValue(new Error('Tên đăng nhập hoặc mật khẩu không chính xác!'))
    const ok = await useAuthStore.getState().login('u', 'wrong')
    expect(ok).toBe(false)
    expect(useAuthStore.getState().error).toContain('không chính xác')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('login response thiếu tenant context → lỗi tường minh', async () => {
    mockApi.login.mockResolvedValue({ accessToken: 'acc-3', user: { ...fullUser, parishId: '' } })
    const ok = await useAuthStore.getState().login('u', 'p')
    expect(ok).toBe(false)
    expect(useAuthStore.getState().error).toContain('thiếu tenant context')
  })
})

describe('authStore — logout / setUser', () => {
  it('logout → dọn token + scope + state; api.logout được gọi', async () => {
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'USR-1', role: 'admin', parishId: 'PX-1' }))
    snapshotStore.set('parish_auth_user', JSON.stringify(fullUser))
    useAuthStore.setState({ user: fullUser as any, isAuthenticated: true })

    expect(await useAuthStore.getState().logout()).toEqual({ serverConfirmed: true, snapshotCleared: true })

    expect(mockApi.logout).toHaveBeenCalled()
    expect(clearTokens).toHaveBeenCalled()
    expect(setTenantScope).toHaveBeenCalledWith(null)
    expect(localStorage.getItem('parish_current_user')).toBeNull()
    expect(snapshotStore.size).toBe(0)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('setUser thiếu parishId → throw (guard chống session không tenant)', () => {
    expect(() => useAuthStore.getState().setUser({ ...fullUser, parishId: '' } as any)).toThrow(/parishId/)
  })
})

describe('authStore — changePassword', () => {
  it('đổi thành công → status ACTIVE, requiresPasswordChange=false', async () => {
    useAuthStore.setState({ user: { ...fullUser, status: 'FORCE_PASSWORD_CHANGE' } as any })
    mockApi.changePassword.mockResolvedValue({ success: true })

    const ok = await useAuthStore.getState().changePassword('Old1!', 'NewPass1!')

    expect(ok).toBe(true)
    expect(mockApi.changePassword).toHaveBeenCalledWith('Old1!', 'NewPass1!')
    const user = useAuthStore.getState().user!
    expect(user.status).toBe('ACTIVE')
    expect(user.mustChangePassword).toBe(0)
    expect(useAuthStore.getState().requiresPasswordChange).toBe(false)
  })

  it('đổi thất bại → error, trả false', async () => {
    useAuthStore.setState({ user: fullUser as any })
    mockApi.changePassword.mockRejectedValue(new Error('Mật khẩu hiện tại không đúng'))
    const ok = await useAuthStore.getState().changePassword('bad', 'x')
    expect(ok).toBe(false)
    expect(useAuthStore.getState().error).toContain('không đúng')
  })
})

describe('authStore — loadFromStorage (bootstrap phiên sau reload)', () => {
  it('không có marker → unauthenticated, authReady=true', async () => {
    await useAuthStore.getState().loadFromStorage()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().authReady).toBe(true)
    expect(setTenantScope).toHaveBeenCalledWith(null)
  })

  it('marker + snapshot hợp lệ + refresh OK → authenticated, scope kích hoạt', async () => {
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'USR-1', role: 'chunhiem', parishId: 'PX-1' }))
    snapshotStore.set('parish_auth_user', JSON.stringify(fullUser))
    vi.mocked(bootstrapAccessToken).mockResolvedValue(true)

    await useAuthStore.getState().loadFromStorage()

    expect(loadTokensFromStorage).toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().user?.id).toBe('USR-1')
    expect(setTenantScope).toHaveBeenCalledWith({ parishId: 'PX-1', userId: 'USR-1' })
  })

  it('snapshot mất + OFFLINE → clearAuth, unauthenticated (không giữ session không xác thực)', async () => {
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'USR-1', role: 'chunhiem', parishId: 'PX-1' }))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    await useAuthStore.getState().loadFromStorage()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(localStorage.getItem('parish_current_user')).toBeNull()
    ;(navigator.onLine as any).mockRestore?.()
  })

  it('snapshot mất + online + refresh FAIL → clearAuth, unauthenticated', async () => {
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'USR-1', role: 'chunhiem', parishId: 'PX-1' }))
    vi.mocked(bootstrapAccessToken).mockResolvedValue(false)

    await useAuthStore.getState().loadFromStorage()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(localStorage.getItem('parish_current_user')).toBeNull()
  })
})
