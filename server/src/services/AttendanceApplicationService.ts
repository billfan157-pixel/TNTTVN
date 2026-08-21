import { db } from '../db/index.js'
import { auditLogs, students } from '../db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'
import { drizzleAttendanceRepository, DrizzleAttendanceRepository } from '../repositories/DrizzleAttendanceRepository.js'
import { semesterLockSpecification, SemesterLockSpecification } from '../domain/SemesterLockSpecification.js'
import { AttendanceRecord } from '../domain/AttendanceRecord.js'
import type { AttendanceStatus, AttendanceSessionType } from '../domain/AttendanceRecord.js'
import { generateId } from '../utils/id.js'
import { resolveAcademicYear, resolveSemester } from '../utils/academicYear.js'
import { VersionConflictError } from './gradeService.js'

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
  /** Audit metadata is carried into the application transaction. */
  ip?: string
  userAgent?: string
}

export class AttendanceApplicationService {
  private attendanceRepo: DrizzleAttendanceRepository
  private semesterLockSpec: SemesterLockSpecification

  constructor(
    attendanceRepo: DrizzleAttendanceRepository = drizzleAttendanceRepository,
    semesterLockSpec: SemesterLockSpecification = semesterLockSpecification
  ) {
    this.attendanceRepo = attendanceRepo
    this.semesterLockSpec = semesterLockSpec
  }

  /**
   * Single-use case: Mark or correct attendance status for a student session.
   * The semester-lock read, attendance mutation and audit log share one database
   * transaction so callers never receive a failure after the business write has
   * already committed without its audit evidence.
   */
  public async markAttendance(cmd: MarkAttendanceCommand): Promise<AttendanceRecord> {
    const todayStr = new Date().toISOString().substring(0, 10)
    if (cmd.date > todayStr) {
      const err = new Error(`Không thể điểm danh cho ngày trong tương lai (${cmd.date}).`) as any
      err.status = 400
      throw err
    }

    const academicYear = cmd.academicYear || resolveAcademicYear(cmd.date)
    const semester = cmd.semester || resolveSemester(cmd.date)

    return db.transaction(async (tx) => {
      // 1. Verify student exists and is active.
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

      if (cmd.allowedClassIds && !cmd.allowedClassIds.includes(student.classId)) {
        const err = new Error('Bạn không có quyền điểm danh thiếu nhi này') as any
        err.status = 403
        throw err
      }

      // 2. Check the semester lock using the SAME transaction snapshot.
      const isSemesterUnlocked = await this.semesterLockSpec.isSatisfiedBy(academicYear, semester, cmd.parishId, tx)
      if (!isSemesterUnlocked) {
        const err = new Error(`Học kỳ ${semester} năm học ${academicYear} đã bị khóa sổ điểm. Không thể điểm danh.`) as any
        err.status = 403
        throw err
      }

      // 3. Load existing AttendanceRecord Entity or create new.
      const existing = await this.attendanceRepo.findByStudentAndSession(
        cmd.studentId,
        cmd.date,
        cmd.type,
        cmd.parishId,
        tx
      )

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

      // 4. Save + audit atomically. Idempotent no-op requests intentionally do
      // not write a duplicate audit record because the persisted state is unchanged.
      const beforeVersion = existing?.version ?? 0
      await this.attendanceRepo.save(record, cmd.userId, cmd.parishId, tx)
      if (!existing || record.version !== beforeVersion) {
        await tx.insert(auditLogs).values({
          id: generateId('AUD'),
          userId: cmd.userId,
          action: 'MARK_ATTENDANCE',
          entityType: 'attendance',
          entityId: record.id,
          oldValue: existing ? JSON.stringify(existing.toJSON()) : null,
          newValue: JSON.stringify(record.toJSON()),
          ip: cmd.ip || null,
          userAgent: cmd.userAgent || null,
          parishId: cmd.parishId,
          createdAt: new Date().toISOString(),
        })
      }
      return record
    })
  }
}

export const attendanceApplicationService = new AttendanceApplicationService()
