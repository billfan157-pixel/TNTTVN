import { request } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const syncApi = {
  getSyncWatermark: () => request<{ serverTime: string; cursorVersion: number }>('GET', '/sync/watermark'),
}
