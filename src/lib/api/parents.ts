import { request } from './core'
import type { ReportCardDTO } from '../../types'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const parentsApi = {
  getMyChildren: () => request<any[]>('GET', '/parents/my-children'),
  getStudentReportCard: (studentId: string, academicYear: string) =>
    request<ReportCardDTO>('GET', `/reports/report-card/${studentId}?academicYear=${encodeURIComponent(academicYear)}`),

}
