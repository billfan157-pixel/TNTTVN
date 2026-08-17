import { db } from '../db/index.js'
import { promotionApplicationService, PromotionApplicationService } from './PromotionApplicationService.js'
import type { ApprovePromotionCommand } from './PromotionApplicationService.js'
import type { PromotionRecordDTO } from '../repositories/DrizzlePromotionRepository.js'

export interface BatchItemResult {
  studentId: string
  status: 'saved' | 'skipped' | 'error'
  reason?: string
  snapshot?: PromotionRecordDTO
}

export interface BatchPromotionResponse {
  total: number
  successCount: number
  skippedCount: number
  errorCount: number
  results: BatchItemResult[]
}

export class BatchPromotionApplicationService {
  private promotionAppService: PromotionApplicationService

  constructor(
    promotionAppService: PromotionApplicationService = promotionApplicationService
  ) {
    this.promotionAppService = promotionAppService
  }

  public async approveBatch(
    items: ApprovePromotionCommand[],
    chunkSize = 10
  ): Promise<BatchPromotionResponse> {
    const results: BatchItemResult[] = []
    let successCount = 0
    let skippedCount = 0
    let errorCount = 0

    const batchStartTime = Date.now() - 1000

    // PRM-05 (audit 2026-08-08): tx từng item thay vì 1 tx cho cả chunk — lỗi SQL-level
    // (constraint) của 1 item abort đúng item đó, không thả chunk (partial-success thật).
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize)

      for (const item of chunk) {
        try {
          await db.transaction(async (tx) => {
            const snapshot = await this.promotionAppService.approvePromotion(item, tx)
            const approvedTime = new Date(snapshot.approvedAt).getTime()

            // If approvedAt was generated prior to this batch execution, it was an idempotent skip
            if (approvedTime < batchStartTime) {
              results.push({
                studentId: item.studentId,
                status: 'skipped',
                reason: 'Already approved with identical decision and snapshot data',
                snapshot,
              })
              skippedCount++
            } else {
              results.push({
                studentId: item.studentId,
                status: 'saved',
                snapshot,
              })
              successCount++
            }
          })
        } catch (err: any) {
          errorCount++
          results.push({
            studentId: item.studentId,
            status: 'error',
            reason: err.message || 'Lỗi không xác định khi duyệt xét lên lớp',
          })
        }
      }
    }

    return {
      total: items.length,
      successCount,
      skippedCount,
      errorCount,
      results,
    }
  }
}

export const batchPromotionApplicationService = new BatchPromotionApplicationService()
