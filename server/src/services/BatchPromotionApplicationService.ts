import { runDbTransaction, type DbTransaction } from '../db/index.js'
import { students } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { promotionApplicationService, PromotionApplicationService } from './PromotionApplicationService.js'
import type { ApprovePromotionCommand } from './PromotionApplicationService.js'
import type { PromotionRecordDTO } from '../repositories/DrizzlePromotionRepository.js'
import { resolveMembershipBranch } from './studentMembershipPolicy.js'

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

/**
 * F1 (audit 2026-08-21): item batch có thể kèm chuyển lớp/ngành — `nextClassId`
 * (đã có trong command, được PRM-03 verify thuộc parish) và `newBranch`. Việc
 * chuyển được thực hiện TRONG CÙNG transaction với snapshot promotion_record
 * nên không thể có snapshot mà mất move hoặc ngược lại. Semester-lock vẫn được
 * enforce bên trong approvePromotion (403 nếu HK2 chưa khóa).
 */
export type BatchApproveItem = ApprovePromotionCommand & { newBranch?: string | null }
export type BatchTransactionRunner = <T>(operation: (tx: DbTransaction) => Promise<T>) => Promise<T>

export class BatchPromotionApplicationService {
  private promotionAppService: PromotionApplicationService
  private runTransaction: BatchTransactionRunner

  constructor(
    promotionAppService: PromotionApplicationService = promotionApplicationService,
    runTransaction: BatchTransactionRunner = runDbTransaction,
  ) {
    this.promotionAppService = promotionAppService
    this.runTransaction = runTransaction
  }

  public async approveBatch(
    items: BatchApproveItem[],
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
          // The retryable transaction callback must not mutate response state.
          // runDbTransaction can replay this callback after commit-time BUSY;
          // only account for the item after the wrapper has returned once.
          const itemResult = await this.runTransaction(async (tx): Promise<BatchItemResult> => {
            const snapshot = await this.promotionAppService.approvePromotion(item, tx)
            const approvedTime = new Date(snapshot.approvedAt).getTime()

            // F1: áp move cho cả 'saved' lẫn 'skipped' (idempotent re-run phải
            // hội tụ về cùng trạng thái — move trước đó có thể đã đứt giữa chừng).
            if (item.nextClassId || item.newBranch) {
              const update: Record<string, unknown> = { updatedAt: new Date().toISOString(), updatedBy: item.userId }
              if (item.nextClassId) update.classId = item.nextClassId
              if (item.nextClassId) {
                update.branch = await resolveMembershipBranch(tx, item.parishId, item.nextClassId, item.newBranch)
              } else if (item.newBranch) {
                throw Object.assign(new Error('Không thể đổi phân ngành khi không có lớp chuyển đến'), { code: 'PROMOTION_CLASS_REQUIRED' })
              }
              await tx
                .update(students)
                .set(update)
                .where(and(eq(students.id, item.studentId), eq(students.parishId, item.parishId)))
            }

            // If approvedAt was generated prior to this batch execution, it was an idempotent skip
            if (approvedTime < batchStartTime) {
              return {
                studentId: item.studentId,
                status: 'skipped',
                reason: 'Already approved with identical decision and snapshot data',
                snapshot,
              }
            }
            return {
              studentId: item.studentId,
              status: 'saved',
              snapshot,
            }
          })
          results.push(itemResult)
          if (itemResult.status === 'saved') successCount++
          else skippedCount++
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
