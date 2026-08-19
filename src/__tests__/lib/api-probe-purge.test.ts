import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, setTokens, clearTokens, getAccessToken } from '../../lib/api'

// PROD FIX (2026-08-12): `probePurgeVersion` trước đây fetch thô KHÔNG bootstrap
// access token khi memory rỗng (sau reload — A-NEW-10 memory-only) và KHÔNG
// refresh-on-401, khác `request()` → `/system/purge-version` trả 401 ở cycle sync
// đầu sau reload (race với authStore.loadFromStorage bootstrap fire-and-forget),
// ghost-data check (A-NEW-02) bị silent skip + log network đầy 401.
// Giờ probe đồng bộ hành vi với request(): bootstrap trước khi fetch, 401 →
// refresh 1 lần → thử lại 1 lần. KHÔNG backoff/retry mù (giữ nguyên tắc cũ:
// offline không được treo sync chu kỳ).

const fetchMock = vi.fn()

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

interface ProbeRoutes {
  refreshOk: boolean
  refreshToken?: string
  purgeStatus: (call: number) => number
  purgeBody?: unknown
}

function routeProbe(routes: ProbeRoutes) {
  let purgeCalls = 0
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url)
    if (u.includes('/auth/refresh')) {
      if (!routes.refreshOk) return fakeResponse(401, {})
      return fakeResponse(200, { success: true, data: { accessToken: routes.refreshToken || 'access-new' } })
    }
    if (u.includes('/system/purge-version')) {
      purgeCalls += 1
      const status = routes.purgeStatus(purgeCalls)
      return fakeResponse(status, routes.purgeBody ?? { success: true, data: { purgeVersion: 3 } })
    }
    return fakeResponse(404, {})
  })
  return () => purgeCalls
}

describe('probePurgeVersion — ghost-data guard (A-NEW-02) prod fix', () => {
  beforeEach(() => {
    localStorage.clear()
    clearTokens()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('memory rỗng (sau reload) → bootstrap /auth/refresh TRƯỚC, rồi probe có Bearer token mới', async () => {
    routeProbe({ refreshOk: true, refreshToken: 'access-new', purgeStatus: () => 200 })
    const v = await api.probePurgeVersion(500)
    expect(v).toBe(3)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/refresh')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/system/purge-version')
    const headers = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer access-new')
  })

  it('memory rỗng + bootstrap fail (cookie hết hạn) → null, KHÔNG gọi purge-version', async () => {
    const count = routeProbe({ refreshOk: false, purgeStatus: () => 200 })
    const v = await api.probePurgeVersion(500)
    expect(v).toBeNull()
    expect(count()).toBe(0)
    expect(getAccessToken()).toBeNull()
  })

  it('có token + purge-version 401 (token hết hạn giữa phiên) → refresh 1 lần → retry thành công', async () => {
    setTokens('access-old')
    routeProbe({ refreshOk: true, refreshToken: 'access-new', purgeStatus: call => (call === 1 ? 401 : 200) })
    const v = await api.probePurgeVersion(500)
    expect(v).toBe(3)
    expect(fetchMock.mock.calls.length).toBe(3)
    const headers = (fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer access-new')
  })

  it('có token + 200 → trả purgeVersion với Bearer token hiện tại', async () => {
    setTokens('access-ok')
    routeProbe({ refreshOk: false, purgeStatus: () => 200 })
    const v = await api.probePurgeVersion(500)
    expect(v).toBe(3)
    expect(fetchMock.mock.calls.length).toBe(1)
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer access-ok')
  })

  it('401 + refresh fail → null, KHÔNG redirect login (probe best-effort, không đá user ra)', async () => {
    setTokens('access-expired')
    routeProbe({ refreshOk: false, purgeStatus: () => 401 })
    const v = await api.probePurgeVersion(500)
    expect(v).toBeNull()
    expect(getAccessToken()).toBeNull()
  })

  it('server 5xx → null (bỏ qua check, pull delta vẫn chạy)', async () => {
    setTokens('access-ok')
    routeProbe({ refreshOk: false, purgeStatus: () => 503 })
    const v = await api.probePurgeVersion(500)
    expect(v).toBeNull()
  })

  it('offline (fetch reject) → null, KHÔNG throw (không treo sync chu kỳ)', async () => {
    setTokens('access-ok')
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const v = await api.probePurgeVersion(500)
    expect(v).toBeNull()
  })
})
