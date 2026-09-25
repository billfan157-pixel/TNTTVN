import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('../../lib/pushManager', () => ({
  initPushSubscription: vi.fn().mockResolvedValue(undefined),
  disablePushSubscription: vi.fn().mockResolvedValue(undefined),
  isNativePushAvailable: () => false,
}))
// Deliberately disable broad cleanup: scoped deletion must work independently.
vi.mock('../../stores/resetStores', () => ({ resetAllStoresToDefault: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../lib/tenantScope', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/tenantScope')>(),
  rehydrateTenantStores: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

import { useAuthStore } from '../../stores/authStore'
import { resetAllStoresToDefault } from '../../stores/resetStores'
import { db, AUTH_SNAPSHOT_KEY, dexieStorage } from '../../lib/db'
import { setTenantScope, getTenantScope, scopedStorageKey } from '../../lib/tenantScope'
import { setTokens, clearTokens, getAccessToken } from '../../lib/api/core'
import { LoginPage } from '../../pages/LoginPage'

const user = { id: 'U-AUTH02', parishId: 'P-AUTH02', username: 'synthetic', fullName: 'Synthetic User', status: 'ACTIVE', role: 'phuta' as const }
let snapshotKey: string
const ok = () => new Response(JSON.stringify({ success: true, data: { serverConfirmed: true } }), { status: 200 })

beforeEach(async () => {
  localStorage.clear()
  await db.stores.clear()
  setTenantScope({ parishId: user.parishId, userId: user.id })
  snapshotKey = scopedStorageKey(AUTH_SNAPSHOT_KEY)!
  await dexieStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(user))
  expect((await db.stores.get(snapshotKey))!.value).not.toContain(user.fullName)
  localStorage.setItem('parish_current_user', JSON.stringify({ id: user.id, parishId: user.parishId, role: user.role }))
  setTokens('outgoing-access')
  useAuthStore.setState({ user, isAuthenticated: true, isLoading: false, authReady: true, error: null })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setTenantScope(null)
  clearTokens()
})

describe('AUTH-P2-001 / AUTH-P3-001 logout across real transport, scope and encrypted Dexie', () => {
  it('clears local authority immediately and acknowledges server only after response', async () => {
    let reply!: (response: Response) => void
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(resolve => { reply = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    await db.stores.put({ key: `${AUTH_SNAPSHOT_KEY}:P-OTHER:U-OTHER`, value: 'untouched-other-scope' })
    const result = useAuthStore.getState().logout()
    expect(getAccessToken()).toBeNull()
    expect(localStorage.getItem('parish_current_user')).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(useAuthStore.getState().isLoading).toBe(true)
    reply(ok())
    expect(await result).toEqual({ serverConfirmed: true, snapshotCleared: true })
    expect(await db.stores.get(snapshotKey)).toBeUndefined()
    expect(await db.stores.get(`${AUTH_SNAPSHOT_KEY}:P-OTHER:U-OTHER`)).toBeDefined()
    expect(getTenantScope()).toBeNull()
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' })
  })

  it('network failure clears local authority and displays an explicit warning on the logout destination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await useAuthStore.getState().logout()).toEqual({ serverConfirmed: false, snapshotCleared: true })
    expect(getAccessToken()).toBeNull()
    expect(await db.stores.get(snapshotKey)).toBeUndefined()
    render(<LoginPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('chưa xác nhận được thu hồi phiên trên máy chủ')
    await useAuthStore.getState().loadFromStorage()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('snapshot deletion failure is explicit and cannot reactivate the session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()))
    vi.spyOn(db.stores, 'delete').mockRejectedValueOnce(new Error('IndexedDB unavailable'))
    expect(await useAuthStore.getState().logout()).toEqual({ serverConfirmed: true, snapshotCleared: false })
    expect(await db.stores.get(snapshotKey)).toBeDefined()
    expect(localStorage.getItem('parish_current_user')).toBeNull()
    expect(getAccessToken()).toBeNull()
    await useAuthStore.getState().loadFromStorage()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('tenant cache deletion failure is surfaced on the logout destination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()))
    vi.mocked(resetAllStoresToDefault).mockRejectedValueOnce(new Error('IndexedDB unavailable'))

    expect(await useAuthStore.getState().logout()).toEqual({ serverConfirmed: true, snapshotCleared: true })
    render(<LoginPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('toàn bộ dữ liệu tenant')
  })

  it('a successful HTTP response without an acknowledgement is not reported as server logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('null', { status: 200 })))
    expect(await useAuthStore.getState().logout()).toEqual({ serverConfirmed: false, snapshotCleared: true })
    expect(useAuthStore.getState().isLoading).toBe(false)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().error).toContain('chưa xác nhận')
  })
})
