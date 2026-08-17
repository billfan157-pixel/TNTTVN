import { describe, it, expect, beforeEach } from 'vitest'
import { setTokens, loadTokensFromStorage, clearTokens, getAccessToken } from '../../lib/api'

// SECURITY_AUDIT_A01 + A-NEW-01/10 — client KHÔNG giữ refresh token ở BẤT KỲ ĐÂU trong JS
// (không memory, không localStorage) — nguồn duy nhất là HttpOnly cookie.
// A-NEW-10 hardening (2026-08-11): access token cũng MEMORY-ONLY — không persist
// localStorage; sau reload lấy lại qua POST /auth/refresh (bootstrapAccessToken).

describe('A01 + A-NEW-01 — token storage (client, cookie-only)', () => {
  beforeEach(() => {
    localStorage.clear()
    clearTokens()
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
})