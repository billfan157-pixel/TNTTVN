import { request } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const reportsApi = {
  generatePDF: (htmlContent: string, options?: { format?: 'A4' | 'A3' | 'Letter'; landscape?: boolean; margin?: Record<string, string> }) =>
    request<Blob>('POST', '/reports/generate-pdf', { htmlContent, options }, 0, undefined, false, 'blob'),
}
