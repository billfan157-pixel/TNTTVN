import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request, setTokens, clearTokens } from '../../lib/api'

// P1-4: caller-supplied abort signals let superseded detail loads die early
// instead of running to the transport timeout. An aborted request must never
// retry and must never masquerade as an offline failure.

function abortAwareFetch() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'))
      return
    }
    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  }))
}

describe('P1-4 request abort signal', () => {
  beforeEach(() => {
    localStorage.clear()
    setTokens('test-access')
  })

  afterEach(() => {
    clearTokens()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends a timeout-backed signal when no caller signal is given', async () => {
    let seen: AbortSignal | undefined
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      seen = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    void request('GET', '/operations/events/E', undefined, 0, undefined, false, 'json', false, controller.signal).catch(() => undefined)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(seen).toBeInstanceOf(AbortSignal)
    controller.abort()
  })

  it('rejects with REQUEST_ABORTED exactly once when the caller aborts', async () => {
    const fetchMock = abortAwareFetch()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const pending = request('GET', '/operations/events/E', undefined, 0, undefined, false, 'json', false, controller.signal)
    const assertion = expect(pending).rejects.toMatchObject({ status: 0, code: 'REQUEST_ABORTED' })
    controller.abort()
    await assertion
    // GET would normally retry up to 3 times — a superseded request retries never.
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('treats a pre-aborted signal as superseded without hitting the network twice', async () => {
    const fetchMock = abortAwareFetch()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()
    await expect(
      request('GET', '/operations/tasks/T', undefined, 0, undefined, false, 'json', false, controller.signal),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('still retries idempotent requests on genuine network errors without a signal', async () => {
    let calls = 0
    const fetchMock = vi.fn(() => {
      calls++
      if (calls === 1) return Promise.reject(new TypeError('network down'))
      return Promise.resolve(new Response(JSON.stringify({ success: true, data: { ok: true }, error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(request('GET', '/operations/events/E')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('exposes the abort code through ApiError for the offline-failure guard', () => {
    const error = new ApiError(0, 'Request superseded', '/x', 'REQUEST_ABORTED')
    expect(error).toMatchObject({ status: 0, code: 'REQUEST_ABORTED' })
    expect(error instanceof ApiError && error.status === 0 && error.code !== 'REQUEST_ABORTED').toBe(false)
  })
})
