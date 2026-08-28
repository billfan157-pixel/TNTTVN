import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, setTokens } from '../../lib/api'

// A12 (2026-08-10): retry tự động chỉ áp cho method idempotent (GET/HEAD/PUT/DELETE)
// hoặc mutation có Idempotency-Key. POST/PATCH không key → KHÔNG bao giờ retry mù:
// server đã commit mà response mất là không thể phát hiện từ client.

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

describe('A12 — method-aware retry (api request)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    setTokens('access-retry-test')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('GET: network error → retry (2 lần) rồi thành công', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down')).mockResolvedValueOnce(fakeResponse(200, { success: true, data: [] }))
    const p = api.getStudents()
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toEqual({ data: [], total: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('POST không có Idempotency-Key: network error → KHÔNG retry (1 lần)', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'))
    const p = api.createNotice({ title: 'Thông báo' })
    await expect(p).rejects.toMatchObject({ status: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('POST createStudent: auto Idempotency-Key → retry, key GIỮ NGUYÊN giữa 2 lần', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down')).mockResolvedValueOnce(fakeResponse(201, { success: true, data: { id: 'ST-123' } }))
    const p = api.createStudent({ fullName: 'Nguyễn Văn A' })
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toEqual({ id: 'ST-123' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const key1 = JSON.parse(fetchMock.mock.calls[0][1].body).idempotencyKey
    const key2 = JSON.parse(fetchMock.mock.calls[1][1].body).idempotencyKey
    expect(key1).toBeTruthy()
    expect(key1).toBe(key2)
  })

  it('EXAM-CONTINUOUS-P0: save result retry giữ nguyên header và per-item mutation', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValueOnce(fakeResponse(200, {
        success: true,
        data: { saved: 1, upserted: 0, total: 1, items: [] },
      }))

    const promise = api.saveExamResults('EXS-1', [{
      studentId: 'ST-1', score: 8, source: 'qr_scan',
      clientMutationId: 'MUT-CONT-API-1', capturedAt: '2026-08-28T03:00:00.000Z',
    }])
    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).resolves.toMatchObject({ saved: 1, total: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstOptions = fetchMock.mock.calls[0][1]
    const secondOptions = fetchMock.mock.calls[1][1]
    expect(firstOptions.headers['Idempotency-Key']).toBe('MUT-CONT-API-1')
    expect(secondOptions.headers['Idempotency-Key']).toBe('MUT-CONT-API-1')
    expect(JSON.parse(firstOptions.body)).toEqual(JSON.parse(secondOptions.body))
  })

  it('POST createUser: 5xx → KHÔNG retry', async () => {
    fetchMock.mockResolvedValue(fakeResponse(500, { success: false, error: { code: 'INTERNAL_ERROR' } }))
    const p = api.createUser({ username: 'hoc-sinh-test', fullName: 'Test User', role: 'admin' })
    await expect(p).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('PUT: 5xx → retry rồi thành công (idempotent)', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(503, { success: false })).mockResolvedValueOnce(fakeResponse(200, { success: true, data: { ok: true } }))
    const p = api.updateUserStatus('USR-2', 'ACTIVE')
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('PATCH overrideGrade KHÔNG key: 5xx → không retry', async () => {
    fetchMock.mockResolvedValue(fakeResponse(500, { success: false }))
    const p = api.overrideGrade('G-1', { scoreField: 'Score1', manualValue: 9 })
    await expect(p).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('PATCH overrideGrade CÓ key: retry + Idempotency-Key header giữ nguyên 2 lần (A12, sửa lỗi retry rơi header)', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(503, { success: false })).mockResolvedValueOnce(fakeResponse(200, { success: true, data: { ok: true } }))
    const _p = api.overrideGrade('G-1', { scoreField: 'Score1', manualValue: 9 }, 'KEY-ABC')
    await vi.advanceTimersByTimeAsync(1000)
    const headers1 = fetchMock.mock.calls[0][1].headers as Record<string, string>
    const headers2 = fetchMock.mock.calls[1][1].headers as Record<string, string>
    expect(headers1['Idempotency-Key']).toBe('KEY-ABC')
    expect(headers2['Idempotency-Key']).toBe('KEY-ABC')
  })

  it('POST /auth/login 401: KHÔNG gọi refreshAccessToken và KHÔNG gọi redirectToLogin — ném thẳng ApiError(401) về cho UI', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(401, { success: false, error: { message: 'Tên đăng nhập hoặc mật khẩu không chính xác' } }))
    const p = api.login('wronguser', 'wrongpass')
    await expect(p).rejects.toMatchObject({ status: 401, message: 'Tên đăng nhập hoặc mật khẩu không chính xác' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/login')
  })
})
