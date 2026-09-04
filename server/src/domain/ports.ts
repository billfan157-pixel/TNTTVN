import type { DbExecutor } from '../db/index.js'

/**
 * Phase 2 (policy ports): domain specs chỉ phụ thuộc interfaces này —
 * KHÔNG import middleware/services/repositories/schema. Implementations
 * concrete sống ở services/policyAdapters.ts (infrastructure) và được inject
 * qua constructor. `DbExecutor` là type-only (xóa lúc compile), không tạo
 * runtime edge.
 */

export interface StudentAccessRecord {
  id: string
  classId: string | null
  parentPhone: string | null
}

/** Truy vấn dữ liệu cần cho quyết định phân quyền đọc học sinh. */
export interface StudentAccessQueries {
  findStudent(parishId: string, studentId: string, executor?: DbExecutor): Promise<StudentAccessRecord | null>
  findUserPhone(userId: string, parishId: string, executor?: DbExecutor): Promise<string | null>
}

/** Kiểm tra user có quyền trên lớp không (thay checkUserClassAccess trực tiếp). */
export interface ClassAccessPort {
  hasAccess(userId: string, parishId: string, classId: string, executor?: DbExecutor): Promise<boolean>
}

/** Resolve lớp của học sinh (thay getStudentClassId trực tiếp). */
export interface StudentClassPort {
  getClassId(studentId: string, parishId: string, executor?: DbExecutor): Promise<string | null>
}

/** Đọc trạng thái khóa sổ (thay DrizzleSemesterLockRepository trực tiếp). */
export interface LockStatePort {
  isLocked(academicYear: string, semester: number, parishId: string, executor?: DbExecutor): Promise<boolean>
}
