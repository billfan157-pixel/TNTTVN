/**
 * Phase 2 (policy ports): domain specs chỉ phụ thuộc interfaces này —
 * KHÔNG import middleware/services/repositories/schema. Implementations
 * concrete sống ở services/policyAdapters.ts và được bind vào executor của
 * use case trước khi inject. Domain không biết transaction/Drizzle.
 */

export interface StudentAccessRecord {
  id: string
  classId: string | null
  parentPhone: string | null
}

/** Truy vấn dữ liệu cần cho quyết định phân quyền đọc học sinh. */
export interface StudentAccessQueries {
  findStudent(parishId: string, studentId: string): Promise<StudentAccessRecord | null>
  findUserPhone(userId: string, parishId: string): Promise<string | null>
}

/** Kiểm tra user có quyền trên lớp không (thay checkUserClassAccess trực tiếp). */
export interface ClassAccessPort {
  hasAccess(userId: string, parishId: string, classId: string): Promise<boolean>
}

/** Resolve lớp của học sinh (thay getStudentClassId trực tiếp). */
export interface StudentClassPort {
  getClassId(studentId: string, parishId: string): Promise<string | null>
}

/** Đọc trạng thái khóa sổ (thay DrizzleSemesterLockRepository trực tiếp). */
export interface LockStatePort {
  isLocked(academicYear: string, semester: number, parishId: string): Promise<boolean>
}
