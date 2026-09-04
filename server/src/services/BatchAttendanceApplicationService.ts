import { attendanceApplicationService, AttendanceApplicationService } from './AttendanceApplicationService.js'
import type { MarkAttendanceCommand } from './AttendanceApplicationService.js'
import type { AttendanceRecord } from '../domain/AttendanceRecord.js'
import { VersionConflictError } from '../domain/errors.js'

export interface BatchAttendanceItemResult {
  studentId: string
  status: 'saved' | 'skipped' | 'conflict' | 'error'
  reason?: string
  record?: AttendanceRecord
}

export interface BatchAttendanceResponse {
  total: number
  successCount: number
  skippedCount: number
  conflictCount: number
  errorCount: number
  results: BatchAttendanceItemResult[]
}

export class BatchAttendanceApplicationService {
  private attendanceAppService: AttendanceApplicationService

  constructor(
    attendanceAppService: AttendanceApplicationService = attendanceApplicationService
  ) {
    this.attendanceAppService = attendanceAppService
  }

  public async markAttendanceBatch(
    items: MarkAttendanceCommand[],
    chunkSize = 10,
    allowedClassIds?: string[] | null
  ): Promise<BatchAttendanceResponse> {
    const results: BatchAttendanceItemResult[] = []
    let successCount = 0
    let skippedCount = 0
    let conflictCount = 0
    let errorCount = 0

    // Process items in chunks to prevent DB lock contention and ensure partial-success semantics (ADR-008)
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize)

      for (const item of chunk) {
        try {
          const record = await this.attendanceAppService.markAttendance({
            ...item,
            allowedClassIds: item.allowedClassIds ?? allowedClassIds,
          })

          // ADR-016 (S22): Phân biệt 'saved' vs 'skipped' (idempotent no-op) bằng
          // version client gửi lên. Trước đây cả 2 nhánh đều push 'saved' — nhánh
          // 'skipped' là dead code, skippedCount luôn bằng 0.
          const unchanged = item.version !== undefined && record.version === item.version
          results.push({
            studentId: item.studentId,
            status: unchanged ? 'skipped' : 'saved',
            record,
          })
          if (unchanged) {
            skippedCount++
          } else {
            successCount++
          }
        } catch (err: any) {
          if (err instanceof VersionConflictError) {
            conflictCount++
            results.push({
              studentId: item.studentId,
              status: 'conflict',
              reason: err.message || 'Bản ghi điểm danh đã bị chỉnh sửa bởi người dùng khác.',
              record: err.currentGrade,
            })
          } else {
            errorCount++
            results.push({
              studentId: item.studentId,
              status: 'error',
              reason: err.message || 'Lỗi không xác định khi điểm danh',
            })
          }
        }
      }
    }

    return {
      total: items.length,
      successCount,
      skippedCount,
      conflictCount,
      errorCount,
      results,
    }
  }
}

export const batchAttendanceApplicationService = new BatchAttendanceApplicationService()
