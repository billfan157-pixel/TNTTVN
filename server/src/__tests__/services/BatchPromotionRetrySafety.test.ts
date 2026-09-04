import { describe, expect, it, vi } from 'vitest'
import { BatchPromotionApplicationService, type BatchTransactionRunner } from '../../services/BatchPromotionApplicationService.js'
import type { PromotionApplicationService } from '../../services/PromotionApplicationService.js'
import type { DbTransaction } from '../../db/index.js'

describe('BatchPromotionApplicationService retry safety', () => {
  it('D6: a replayed transaction callback contributes exactly one response item', async () => {
    const approvePromotion = vi.fn(async (item: any) => ({
      id: 'PRM-retry-safe',
      studentId: item.studentId,
      parishId: item.parishId,
      academicYear: item.academicYear,
      targetClassId: item.targetClassId,
      autoDecision: 'PROMOTED' as const,
      finalDecision: 'PROMOTED' as const,
      isOverridden: false,
      gpaSnapshot: item.gpa,
      attendanceSnapshot: item.attendanceRate,
      rulesVersion: 'v1.0',
      approvedBy: item.userId,
      approvedAt: new Date(Date.now() + 1000).toISOString(),
      status: 'ACTIVE' as const,
      version: 1,
    }))
    const replayingRunner: BatchTransactionRunner = async (operation) => {
      await operation({} as DbTransaction)
      return operation({} as DbTransaction)
    }
    const service = new BatchPromotionApplicationService(
      { approvePromotion } as unknown as PromotionApplicationService,
      replayingRunner,
    )

    const result = await service.approveBatch([{
      studentId: 'ST-retry-safe',
      parishId: 'parish-retry-safe',
      academicYear: '2025-2026',
      targetClassId: 'CLASS-retry-safe',
      gpa: 8,
      attendanceRate: 90,
      userId: 'USR-retry-safe',
    }])

    expect(approvePromotion).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ total: 1, successCount: 1, skippedCount: 0, errorCount: 0 })
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({ studentId: 'ST-retry-safe', status: 'saved' })
  })
})
