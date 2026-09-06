import { and, eq, isNull, or } from 'drizzle-orm'
import type { DbExecutor } from '../db/index.js'
import {
  attendanceSessions,
  catechistAssignments,
  examSessions,
  financialTransactions,
  gradeImportHashes,
  leaveRequests,
  promotionRecords,
  studentFeeRecords,
  students,
} from '../db/schema.js'

/** Direct class references that make hiding/decommissioning a class unsafe. */
export async function getClassDependencyBlockers(executor: DbExecutor, classId: string, parishId: string): Promise<string[]> {
  const checks: Array<[string, () => Promise<unknown[]>]> = [
    ['học viên đang hoạt động', () => executor.select({ id: students.id }).from(students).where(and(eq(students.classId, classId), eq(students.parishId, parishId), isNull(students.deletedAt))).limit(1)],
    ['phân công nhân sự', () => executor.select({ id: catechistAssignments.id }).from(catechistAssignments).where(and(eq(catechistAssignments.classId, classId), eq(catechistAssignments.parishId, parishId))).limit(1)],
    ['buổi điểm danh', () => executor.select({ id: attendanceSessions.id }).from(attendanceSessions).where(and(eq(attendanceSessions.classId, classId), eq(attendanceSessions.parishId, parishId))).limit(1)],
    ['phiên thi', () => executor.select({ id: examSessions.id }).from(examSessions).where(and(eq(examSessions.classId, classId), eq(examSessions.parishId, parishId))).limit(1)],
    ['đơn xin nghỉ', () => executor.select({ id: leaveRequests.id }).from(leaveRequests).where(and(eq(leaveRequests.classId, classId), eq(leaveRequests.parishId, parishId))).limit(1)],
    ['học phí', () => executor.select({ id: studentFeeRecords.id }).from(studentFeeRecords).where(and(eq(studentFeeRecords.classId, classId), eq(studentFeeRecords.parishId, parishId))).limit(1)],
    ['giao dịch tài chính', () => executor.select({ id: financialTransactions.id }).from(financialTransactions).where(and(eq(financialTransactions.classId, classId), eq(financialTransactions.parishId, parishId))).limit(1)],
    ['dấu vết import điểm', () => executor.select({ id: gradeImportHashes.id }).from(gradeImportHashes).where(and(eq(gradeImportHashes.classId, classId), eq(gradeImportHashes.parishId, parishId))).limit(1)],
    ['quyết định lên lớp', () => executor.select({ id: promotionRecords.id }).from(promotionRecords).where(and(
      eq(promotionRecords.parishId, parishId),
      or(eq(promotionRecords.targetClassId, classId), eq(promotionRecords.nextClassId, classId)),
    )).limit(1)],
  ]
  const blockers: string[] = []
  for (const [label, check] of checks) {
    if ((await check()).length > 0) blockers.push(label)
  }
  return blockers
}
