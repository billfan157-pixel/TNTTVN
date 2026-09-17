import { request } from './core'
import type { ClassSummaryDTO, ReportClassDTO } from '../../types'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const reportsApi = {
  getReportClasses: (academicYear: string) =>
    request<ReportClassDTO[]>('GET', `/reports/classes?academicYear=${encodeURIComponent(academicYear)}`),
  getClassSummary: (classId: string, academicYear: string) =>
    request<ClassSummaryDTO>('GET', `/reports/class-summary/${classId}?academicYear=${encodeURIComponent(academicYear)}`),
  generatePDF: (htmlContent: string, options?: { format?: 'A4' | 'A3' | 'Letter'; landscape?: boolean; margin?: Record<string, string> }) =>
    request<Blob>('POST', '/reports/generate-pdf', { htmlContent, options }, 0, undefined, false, 'blob'),
}
