import { request } from './core'

export interface AuditLogQueryParams {
  page?: number
  limit?: number
  userId?: string
  action?: string
  entityType?: string
  startDate?: string
  endDate?: string
  search?: string
  severity?: string
}

export interface AuditMetricsSummary {
  total24h: number
  securityAlerts24h: number
  criticalMutations24h: number
  destructiveActions24h: number
  activeUsers24h: number
  total7d: number
  asOf: string
}

export interface AuditIntegrityResult {
  status: 'VERIFIED' | 'EMPTY' | 'TAMPERED'
  verifiedCount: number
  chainRoot?: string
  range?: {
    from: string
    to: string
  }
  message: string
}

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const auditLogsApi = {
  getAuditLogs: (params?: AuditLogQueryParams) => {
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.userId) qs.set('userId', params.userId)
    if (params?.action) qs.set('action', params.action)
    if (params?.entityType) qs.set('entityType', params.entityType)
    if (params?.startDate) qs.set('startDate', params.startDate)
    if (params?.endDate) qs.set('endDate', params.endDate)
    if (params?.search) qs.set('search', params.search)
    if (params?.severity) qs.set('severity', params.severity)
    const q = qs.toString()
    // keepEnvelope=true — cần meta (total/totalPages) cho phân trang
    return request<{ success: boolean; data: any[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('GET', `/audit-logs${q ? `?${q}` : ''}`, undefined, 0, undefined, false, 'json', true)
  },

  getAuditMetrics: () => {
    return request<AuditMetricsSummary>('GET', '/audit-logs/metrics')
  },

  verifyAuditIntegrity: (limit = 100) => {
    return request<AuditIntegrityResult>('GET', `/audit-logs/verify-integrity?limit=${limit}`)
  },

  // ADR-047 / P3 — Policy Visualization Dashboard. Returns policy-related audit
  // entries enriched with studentId/studentName (for grade overrides & promotion
  // decisions) and `meta.summary` stats for the dashboard header.
  getPolicyHistory: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    const q = qs.toString()
    // keepEnvelope=true — cần meta (total/totalPages/summary) cho phân trang + KPI
    return request<{
      success: boolean
      data: any[]
      meta: {
        page: number
        limit: number
        total: number
        totalPages: number
        summary?: { policyUpdates: number; gradeOverrides: number; promotionDecisions: number; semesterLocks: number; total: number }
      }
    }>('GET', `/audit-logs/policy-history${q ? `?${q}` : ''}`, undefined, 0, undefined, false, 'json', true)
  },
}

