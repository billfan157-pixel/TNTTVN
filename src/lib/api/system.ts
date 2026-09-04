import { request, API_BASE, withDeadline, bootstrapAccessToken, refreshAccessToken, getAccessToken } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const systemApi = {
  purgeAllData: (password: string, confirmKey: string) =>
    request<{ success: boolean; message: string; purgeVersion: number; countsBefore: Record<string, number> }>('POST', '/system/purge', { password, confirmKey }),
  probePurgeVersion: async (timeoutMs = 2000): Promise<number | null> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      if (!getAccessToken()) {
        const bootstrapped = await withDeadline(bootstrapAccessToken().catch(() => false), timeoutMs, false)
        if (!bootstrapped || !getAccessToken()) return null
      }

      const fetchProbe = async (): Promise<number | null | 'UNAUTHORIZED'> => {
        try {
          const res = await fetch(`${API_BASE}/system/purge-version`, {
            headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : undefined,
            credentials: 'include',
            signal: controller.signal,
          })
          if (res.status === 401) return 'UNAUTHORIZED'
          if (!res.ok) return null
          const json = (await res.json()) as { data?: { purgeVersion?: number } }
          const v = json?.data?.purgeVersion
          return typeof v === 'number' ? v : null
        } catch {
          return null
        }
      }

      let result = await fetchProbe()
      if (result === 'UNAUTHORIZED') {
        const refreshed = await withDeadline(refreshAccessToken().catch(() => false), timeoutMs, false)
        if (refreshed && getAccessToken()) {
          const retry = await fetchProbe()
          if (retry !== 'UNAUTHORIZED') result = retry
        } else {
          result = null
        }
      }
      return result === 'UNAUTHORIZED' ? null : result
    } finally {
      clearTimeout(timer)
    }
  },
}
