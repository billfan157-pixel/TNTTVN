import { runDbTransaction } from '../db/index.js'
import { auditLogs, students } from '../db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'
import { drizzleAttendanceRepository, DrizzleAttendanceRepository } from '../repositories/DrizzleAttendanceRepository.js'
import { createSemesterLockSpecification } from './policyAdapters.js'
import { AttendanceRecord } from '../domain/AttendanceRecord.js'
import type { AttendanceStatus, AttendanceSessionType } from '../domain/AttendanceRecord.js'
import { generateId } from '../utils/id.js'
import { resolveAcademicYear, resolveSemester } from '../utils/academicYear.js'
import { VersionConflictError } from '../domain/errors.js'
import { isValidIsoDate } from '../utils/date.js'

export interface MarkAttendanceCommand {
  studentId: string
  date: string // YYYY-MM-DD
  type: AttendanceSessionType
  status: AttendanceStatus
  note?: string | null
  academicYear?: string
  semester?: number
  /** ADR-016 (S21): Version bản ghi mà client đang có — bắt buộc cho offline sync multi-device. */
  version?: number
  userId: string
  parishId: string
  /** ADR-016 (S24): Class IDs mà user được phân công — check trong tx để đóng TOCTOU (audit #12). */
  allowedClassIds?: string[] | null
  ip?: string
  userAgent?: string
  auditAction?: 'MARK_ATTENDANCE' | 'BATCH_MARK_ATTENDANCE_ITEM'
}

export class AttendanceApplicationService {
  private attendanceRepo: DrizzleAttendanceRepository
  constructor(
    attendanceRepo: DrizzleAttendanceRepository = drizzleAttendanceRepository,
  ) {
    this.attendanceRepo = attendanceRepo
  }

  /**
   * Single-use case: Mark or correct attendance status for a student session.
   */
  public async markAttendance(cmd: MarkAttendanceCommand): Promise<AttendanceRecord> {
    if (!isValidIsoDate(cmd.date)) {
      const err = new Error('Ngày điểm danh phải là ngày YYYY-MM-DD có thật') as any
      err.status = 400
      throw err
    }
    const todayStr = new Date().toISOString().substring(0, 10)
    if (cmd.date > todayStr) {
      const err = new Error(`Không thể điểm danh cho ngày trong tương lai (${cmd.date}).`) as any
      err.status = 400
      throw err
    }

    const academicYear = cmd.academicYear || resolveAcademicYear(cmd.date)
    const semester = cmd.semester || resolveSemester(cmd.date)

    return runDbTransaction(async (tx) => {
      // 1. Verify student exists and is active
      const [student] = await tx
        .select({ id: students.id, classId: students.classId })
        .from(students)
        .where(and(eq(students.id, cmd.studentId), eq(students.parishId, cmd.parishId), isNull(students.deletedAt)))
        .limit(1)

      if (!student) {
        const err = new Error('Không tìm thấy thiếu nhi hoặc thiếu nhi đã bị xóa') as any
        err.status = 404
        throw err
      }

      // ADR-016 (S24): Access check trong cùng transaction với write → đóng
      // TOCTOU "check từng item trước khi chạy batch" (audit finding #12).
      if (cmd.allowedClassIds && !cmd.allowedClassIds.includes(student.classId)) {
        const err = new Error('Bạn không có quyền điểm danh thiếu nhi này') as any
        err.status = 403
        throw err
      }

      // 2. Check Semester Lock Specification
      const isSemesterUnlocked = await createSemesterLockSpecification(tx).isSatisfiedBy(academicYear, semester, cmd.parishId)
      if (!isSemesterUnlocked) {
        const err = new Error(`Học kỳ ${semester} năm học ${academicYear} đã bị khóa sổ điểm. Không thể điểm danh.`) as any
        err.status = 403
        throw err
      }

      // 2. Load existing AttendanceRecord Entity or create new
      const existing = await this.attendanceRepo.findByStudentAndSession(
        cmd.studentId,
        cmd.date,
        cmd.type,
        cmd.parishId,
        tx
      )
      const oldValue = existing ? existing.toJSON() : null

      // ADR-016 (S21): Client-version conflict detection. Trước đây client không
      // gửi version → hai thiết bị sửa cùng bản ghi offline = last-write-wins im
      // lặng, không bao giờ báo conflict.
      if (existing && cmd.version !== undefined && cmd.version !== null && existing.version !== cmd.version) {
        throw new VersionConflictError(
          'Bản ghi điểm danh đã bị thay đổi bởi người dùng khác. Vui lòng tải lại trang.',
          existing.toJSON()
        )
      }

      let record: AttendanceRecord
      if (existing) {
        record = existing
        record.updateStatus(cmd.status, cmd.note, cmd.userId)
      } else {
        record = new AttendanceRecord({
          id: generateId('ATT'),
          studentId: cmd.studentId,
          parishId: cmd.parishId,
          date: cmd.date,
          type: cmd.type,
          status: cmd.status,
          note: cmd.note,
          version: 1,
          createdBy: cmd.userId,
          updatedBy: cmd.userId,
        })
      }

      // 3. Save Entity via Repository with SQL Optimistic Locking
      await this.attendanceRepo.save(record, cmd.userId, cmd.parishId, tx)
      const current = record.toJSON()
      await tx.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: cmd.userId,
        action: cmd.auditAction ?? 'MARK_ATTENDANCE',
        entityType: 'attendance',
        entityId: record.id,
        oldValue: oldValue ? JSON.stringify({
          studentId: oldValue.studentId, date: oldValue.date, type: oldValue.type,
          status: oldValue.status, version: oldValue.version,
        }) : null,
        newValue: JSON.stringify({
          studentId: current.studentId, date: current.date, type: current.type,
          status: current.status, version: current.version,
        }),
        ip: cmd.ip ?? '',
        userAgent: cmd.userAgent ?? '',
        parishId: cmd.parishId,
        createdAt: new Date().toISOString(),
      })
      return record
    })
  }
}

export const attendanceApplicationService = new AttendanceApplicationService()
