import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePromotionStore } from '../../stores/promotionStore'
import { promotionApiClient } from '../../lib/api/promotion'
import { ApiError } from '../../lib/api'

vi.mock('../../lib/api/promotion', () => ({
  promotionApiClient: {
    evaluateStudent: vi.fn(),
    approveStudent: vi.fn(),
    batchApproveStudents: vi.fn(),
  },
}))

describe('Promotion Zustand Store F2 Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePromotionStore.setState({
      evaluationMap: {},
      activeSnapshotMap: {},
      isEvaluating: false,
      isApproving: false,
      isBatchApproving: false,
      batchResult: null,
      error: null,
      lockError: null,
    })
  })

  it('1. evaluateStudent updates evaluationMap on success', async () => {
    const mockDecision = {
      status: 'PROMOTED' as const,
      gpa: 8.5,
      attendanceRate: 95,
      isEligible: true,
    }
    vi.mocked(promotionApiClient.evaluateStudent).mockResolvedValue(mockDecision)

    const res = await usePromotionStore.getState().evaluateStudent('st-01')

    expect(res).toEqual(mockDecision)
    expect(usePromotionStore.getState().evaluationMap['st-01']).toEqual(mockDecision)
    expect(usePromotionStore.getState().isEvaluating).toBe(false)
  })

  it('2. approveStudent updates activeSnapshotMap on success', async () => {
    const mockSnapshot = {
      id: 'prm-01',
      studentId: 'st-01',
      academicYear: '2025-2026',
      targetClassId: 'cl-01',
      autoDecision: 'PROMOTED',
      finalDecision: 'PROMOTED',
      isOverridden: false,
      gpaSnapshot: 8.5,
      attendanceSnapshot: 95,
      version: 1,
      status: 'ACTIVE' as const,
      createdAt: '2026-07-30T10:00:00Z',
    }
    vi.mocked(promotionApiClient.approveStudent).mockResolvedValue(mockSnapshot)

    const res = await usePromotionStore.getState().approveStudent({
      studentId: 'st-01',
      academicYear: '2025-2026',
      targetClassId: 'cl-01',
      gpa: 8.5,
      attendanceRate: 95,
    })

    expect(res).toEqual(mockSnapshot)
    expect(usePromotionStore.getState().activeSnapshotMap['st-01']).toEqual(mockSnapshot)
    expect(usePromotionStore.getState().isApproving).toBe(false)
  })

  it('3. Sets lockError on 403 Forbidden Semester Lock response (ADR-005)', async () => {
    vi.mocked(promotionApiClient.approveStudent).mockRejectedValue(
      new ApiError(403, 'Học kỳ 2 chưa bị khóa sổ điểm', '/promotion/approve')
    )

    const res = await usePromotionStore.getState().approveStudent({
      studentId: 'st-01',
      academicYear: '2025-2026',
      targetClassId: 'cl-01',
      gpa: 8.5,
      attendanceRate: 95,
    })

    expect(res).toBeNull()
    expect(usePromotionStore.getState().lockError).toContain('Học kỳ 2 chưa bị khóa sổ điểm')
  })

  it('4. Handles batchApproveStudents with Partial Success payload (ADR-008)', async () => {
    const mockBatchRes = {
      total: 2,
      successCount: 1,
      skippedCount: 1,
      conflictCount: 0,
      errorCount: 0,
      results: [
        {
          studentId: 'st-01',
          status: 'saved' as const,
          snapshot: {
            id: 'prm-01',
            studentId: 'st-01',
            academicYear: '2025-2026',
            targetClassId: 'cl-01',
            autoDecision: 'PROMOTED',
            finalDecision: 'PROMOTED',
            isOverridden: false,
            gpaSnapshot: 8.5,
            attendanceSnapshot: 95,
            version: 1,
            status: 'ACTIVE' as const,
            createdAt: '2026-07-30T10:00:00Z',
          },
        },
        {
          studentId: 'st-02',
          status: 'skipped' as const,
          reason: 'Already approved',
        },
      ],
    }
    vi.mocked(promotionApiClient.batchApproveStudents).mockResolvedValue(mockBatchRes)

    const res = await usePromotionStore.getState().batchApproveStudents([
      { studentId: 'st-01', academicYear: '2025-2026', targetClassId: 'cl-01', gpa: 8.5, attendanceRate: 95 },
      { studentId: 'st-02', academicYear: '2025-2026', targetClassId: 'cl-01', gpa: 9.0, attendanceRate: 98 },
    ])

    expect(res).toEqual(mockBatchRes)
    expect(usePromotionStore.getState().batchResult).toEqual(mockBatchRes)
    expect(usePromotionStore.getState().activeSnapshotMap['st-01']).not.toBeUndefined()
  })
})
