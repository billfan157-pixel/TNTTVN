import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTokens, request, setTokens } from '../../lib/api'
import { getBackendActivityCount, resetBackendActivity } from '../../lib/backendActivity'

// UX-FEEDBACK-1: `request()` là choke point của mọi hoạt động backend. Các test này
// chứng minh mọi kết cục (thành công, lỗi, abort, retry) đều nhả bộ đếm — chỉ báo
// toàn cục không thể kẹt ở trạng thái "đang xử lý…".

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('request() — tín hiệu backend activity', () => {
  beforeEach(() => {
    resetBackendActivity()
    localStorage.clear()
    setTokens('test-access')
  })

  afterEach(() => {
    resetBackendActivity()
    clearTokens()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('báo đang chờ máy chủ trong lúc request bay và nhả khi xong', async () => {
    let release: (response: Response) => void = () => {}
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = request<{ ok: boolean }>('GET', '/operations/tasks')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(getBackendActivityCount()).toBe(1)

    release(jsonResponse({ success: true, data: { ok: true }, error: null }))
    await expect(pending).resolves.toEqual({ ok: true })
    expect(getBackendActivityCount()).toBe(0)
  })

  it('nhả bộ đếm khi request thất bại (POST không retry mù)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ success: false, error: { message: 'Không thể gửi' } }, 500)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(request('POST', '/notices', { title: 'x' })).rejects.toMatchObject({ status: 500 })
    expect(getBackendActivityCount()).toBe(0)
  })

  it('nhả bộ đếm khi request bị caller huỷ (superseded)', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (signal?.aborted) {
        reject(new DOMException('aborted', 'AbortError'))
        return
      }
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const pending = request('GET', '/operations/events/E', undefined, 0, undefined, false, 'json', false, controller.signal)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(getBackendActivityCount()).toBe(1)

    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
    expect(getBackendActivityCount()).toBe(0)
  })

  it('giữ nguyên một lượt đếm qua retry nội bộ (không nhấp nháy giữa backoff)', async () => {
    let calls = 0
    const fetchMock = vi.fn(() => {
      calls += 1
      if (calls === 1) return Promise.reject(new TypeError('network down'))
      return Promise.resolve(jsonResponse({ success: true, data: { ok: true }, error: null }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const pending = request<{ ok: boolean }>('GET', '/operations/tasks')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    // Đang trong backoff của lần retry: vẫn phải là "đang chờ máy chủ".
    expect(getBackendActivityCount()).toBe(1)

    await expect(pending).resolves.toEqual({ ok: true })
    expect(getBackendActivityCount()).toBe(0)
  })
})
