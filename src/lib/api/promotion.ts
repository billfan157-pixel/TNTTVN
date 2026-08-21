import { httpFetch } from '../api'

export interface ApprovePromotionPayload {
  studentId: string
  academicYear: string
  targetClassId: string
  nextClassId?: string | null
  /** F1 (audit 2026-08-21): chuyển ngành cùng transaction với snapshot (batch-approve). */
  newBranch?: 'ChienCon' | 'AuNhi' | 'ThieuNhi' | 'NghiaSi' | 'HiepSi' | null
  gpa: number
  attendanceRate: number
  conductSnapshot?: string | null
  manualDecision?: 'PROMOTED' | 'RETAINED' | 'GRADUATED' | 'CONDITIONALLY_PROMOTED' | 'TRANSFERRED'
  overrideReason?: string | null
}

export interface PromotionDecisionDTO {
  status: 'PROMOTED' | 'RETAINED' | 'GRADUATED' | 'CONDITIONALLY_PROMOTED' | 'TRANSFERRED'
  gpa: number
  attendanceRate: number
  isEligible: boolean
  reason?: string
  rejectionReasons?: string[]
}

export interface PromotionSnapshotDTO {
  id: string
  studentId: string
  academicYear: string
  targetClassId: string
  nextClassId?: string | null
  autoDecision: string
  finalDecision: string
  isOverridden: boolean
  overrideReason?: string | null
  gpaSnapshot: number
  attendanceSnapshot: number
  version: number
  status: 'ACTIVE' | 'SUPERSEDED'
  createdAt: string
}

export interface BatchItemResultDTO {
  studentId: string
  status: 'saved' | 'skipped' | 'conflict' | 'error'
  reason?: string
  snapshot?: PromotionSnapshotDTO
}

export interface BatchPromotionResponseDTO {
  total: number
  successCount: number
  skippedCount: number
  conflictCount: number
  errorCount: number
  results: BatchItemResultDTO[]
}

/**
 * Step F1: Pure Promotion API Client (Zero State, pure HTTP transport)
 */
export const promotionApiClient = {
  async evaluateStudent(studentId: string, academicYear = '2025-2026'): Promise<PromotionDecisionDTO> {
    return httpFetch.get<PromotionDecisionDTO>(`/promotion/evaluate/${studentId}?academicYear=${encodeURIComponent(academicYear)}`)
  },

  async approveStudent(payload: ApprovePromotionPayload): Promise<PromotionSnapshotDTO> {
    return httpFetch.post<PromotionSnapshotDTO>('/promotion/approve', payload)
  },

  async batchApproveStudents(items: ApprovePromotionPayload[], chunkSize = 10): Promise<BatchPromotionResponseDTO> {
    return httpFetch.post<BatchPromotionResponseDTO>('/promotion/batch-approve', { items, chunkSize })
  },
}
