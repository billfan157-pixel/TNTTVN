import { describe, it, expect } from 'vitest'
import { isBackendUnavailableResponse, BACKEND_UNAVAILABLE_MESSAGE } from '../api'

// API-DIAG (2026-08-25): chữ ký platform fallback của Railway khi backend offline
// (service pause/xóa/deploy fail) — phải được phân loại thành 'backend không khả dụng' thay vì lỗi nghiệp vụ 404 thường.
describe('isBackendUnavailableResponse — Railway fallback signature', () => {
  const makeRes = (status: number, headers: Record<string, string> = {}): Pick<Response, 'status' | 'headers'> => ({
    status,
    headers: new Headers(headers),
  })

  it('nhận diện 404 + x-railway-fallback: true', () => {
    expect(isBackendUnavailableResponse(makeRes(404, { 'x-railway-fallback': 'true' }))).toBe(true)
  })

  it('nhận diện 502/503 + header fallback', () => {
    expect(isBackendUnavailableResponse(makeRes(502, { 'X-Railway-Fallback': 'True' }))).toBe(true)
    expect(isBackendUnavailableResponse(makeRes(503, { 'x-railway-fallback': 'TRUE' }))).toBe(true)
  })

  it('không nhận diện khi thiếu header fallback', () => {
    expect(isBackendUnavailableResponse(makeRes(404))).toBe(false)
    expect(isBackendUnavailableResponse(makeRes(502))).toBe(false)
  })

  it('không nhận diện status ngoài whitelist (kể cả có header)', () => {
    expect(isBackendUnavailableResponse(makeRes(400, { 'x-railway-fallback': 'true' }))).toBe(false)
    expect(isBackendUnavailableResponse(makeRes(500, { 'x-railway-fallback': 'true' }))).toBe(false)
  })

  it('404 nghiệp vụ từ chính app Hono (không header fallback) → false', () => {
    // Server app trả 404 NOT_FOUND cho route lạ — KHÔNG có x-railway-fallback.
    expect(isBackendUnavailableResponse(makeRes(404, { 'content-type': 'application/json' }))).toBe(false)
  })

  it('message hướng dẫn bằng tiếng Việt, không chứa JSON nền tảng', () => {
    expect(BACKEND_UNAVAILABLE_MESSAGE).toContain('Máy chủ API')
    expect(BACKEND_UNAVAILABLE_MESSAGE).not.toContain('Application not found')
  })
})
