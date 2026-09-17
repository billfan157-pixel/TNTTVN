import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setTokens, loadTokensFromStorage, clearTokens, getAccessToken, bootstrapAccessToken, setNavigateToLogin } from '../../lib/api'
import { setTenantScope } from '../../lib/tenantScope'

// SECURITY_AUDIT_A01 + A-NEW-01/10 — client KHÔNG giữ refresh token ở BẤT KỲ ĐÂU trong JS
// (không memory, không localStorage) — nguồn duy nhất là HttpOnly cookie.
// A-NEW-10 hardening (2026-08-11): access token cũng MEMORY-ONLY — không persist
// localStorage; sau reload lấy lại qua POST /auth/refresh (bootstrapAccessToken).

describe('A01 + A-NEW-01 — token storage (client, cookie-only)', () => {
  beforeEach(() => {
    localStorage.clear()
    clearTokens()
    setNavigateToLogin(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setTenantScope(null)
  })

  it('setTokens CHỈ giữ access token trong memory — KHÔNG ghi localStorage, KHÔNG có kênh nào để JS giữ refresh token', () => {
    setTokens('access-abc')
    expect(localStorage.getItem('parish_access_token')).toBeNull()
    expect(localStorage.getItem('parish_refresh_token')).toBeNull()
    expect(getAccessToken()).toBe('access-abc')
  })

  it('setTokens dọn key access/refresh cũ còn sót từ phiên bản trước', () => {
    localStorage.setItem('parish_access_token', 'old-access')
    localStorage.setItem('parish_refresh_token', 'legacy-refresh')
    setTokens('access-abc')
    expect(localStorage.getItem('parish_access_token')).toBeNull()
    expect(localStorage.getItem('parish_refresh_token')).toBeNull()
    expect(getAccessToken()).toBe('access-abc')
  })

  it('loadTokensFromStorage KHÔNG đọc access từ localStorage (memory-only) — chỉ dọn legacy', () => {
    localStorage.setItem('parish_access_token', 'persisted-access')
    localStorage.setItem('parish_refresh_token', 'old-refresh')
    loadTokensFromStorage()
    expect(getAccessToken()).toBeNull()
    expect(localStorage.getItem('parish_access_token')).toBeNull()
    expect(localStorage.getItem('parish_refresh_token')).toBeNull()
  })

  it('clearTokens xóa access lẫn mọi key refresh legacy', () => {
    localStorage.setItem('parish_access_token', 'a')
    localStorage.setItem('parish_refresh_token', 'r')
    clearTokens()
    expect(getAccessToken()).toBeNull()
    expect(localStorage.getItem('parish_access_token')).toBeNull()
    expect(localStorage.getItem('parish_refresh_token')).toBeNull()
  })

  it('bootstrap refresh luôn có AbortSignal để cold start không treo vô hạn', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return Promise.reject(new DOMException('network unavailable', 'AbortError'))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(bootstrapAccessToken()).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('không phục hồi phiên từ refresh response cũ sau khi logout', async () => {
    let resolveRefresh!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { resolveRefresh = resolve }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = bootstrapAccessToken()
    expect(fetchMock).toHaveBeenCalledOnce()
    clearTokens()
    resolveRefresh(new Response(JSON.stringify({ data: { accessToken: 'stale-access' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(pending).resolves.toBe(false)
    expect(getAccessToken()).toBeNull()
  })

  it('accepts same-owner refresh but rejects a shared-cookie response for another tab account', async () => {
    setTenantScope({ parishId: 'PARISH-A', userId: 'USER-A' })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
        accessToken: 'same-owner', userId: 'USER-A', parishId: 'PARISH-A',
      } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
        accessToken: 'other-owner', userId: 'USER-B', parishId: 'PARISH-B',
      } }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await expect(bootstrapAccessToken()).resolves.toBe(true)
    expect(getAccessToken()).toBe('same-owner')
    clearTokens()
    await expect(bootstrapAccessToken()).resolves.toBe(false)
    expect(getAccessToken()).toBeNull()
  })
})
