/**
 * Server-side PDF contract (2026-08-12 — nhánh PDF export).
 * MIRROR types của `src/utils/pdfGenerator.ts` (client, SSOT nội dung HTML).
 * Server chỉ dùng loại + các option khi render PDF qua Puppeteer
 * (`server/src/services/pdfService.ts`).
 */
export type ReportType =
  | 'CLASS_GRADEBOOK'
  | 'STUDENT_REPORT_CARD'
  | 'SACRAMENT_CERTIFICATE'
  | 'BATCH_STUDENT_REPORT_CARDS'
  | 'BATCH_PHOTO_CARDS'

export interface ReportOptions {
  title?: string
  academicYear?: string
  parishName?: string
  dioceseName?: string
}
