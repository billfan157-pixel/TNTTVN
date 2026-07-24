import { useSyncStore } from '../stores/syncStore'
import type { Student, GradeRecord, AttendanceRecord } from '../types'

type Entity = 'student' | 'grade' | 'attendance'
type Operation = 'CREATE' | 'UPDATE' | 'DELETE'

function enqueue(entity: Entity, operation: Operation, entityId: string, payload: Record<string, unknown>) {
  useSyncStore.getState().addOp({
    entity,
    entityId,
    operation,
    payload: JSON.stringify(payload),
  })
}

// ─── Student ───
export function syncCreateStudent(data: Record<string, unknown>) {
  enqueue('student', 'CREATE', data.id as string, data)
}

export function syncUpdateStudent(id: string, data: Record<string, unknown>) {
  enqueue('student', 'UPDATE', id, data)
}

export function syncDeleteStudent(id: string) {
  enqueue('student', 'DELETE', id, {})
}

// ─── Grade ───
export function syncUpsertGrade(data: Record<string, unknown>) {
  enqueue('grade', 'UPDATE', data.id as string || data.studentId as string, data)
}

export function syncBatchUpsertGrades(dataList: Record<string, unknown>[]) {
  for (const data of dataList) {
    syncUpsertGrade(data)
  }
}

// ─── Attendance ───
export function syncSaveAttendance(data: Record<string, unknown>) {
  const entityId = data.id as string || `${data.studentId}-${data.date}-${data.type}`
  enqueue('attendance', 'UPDATE', entityId, data)
}

export function syncBatchSaveAttendance(
  date: string,
  type: string,
  records: { studentId: string; status: string; note?: string }[],
) {
  for (const r of records) {
    syncSaveAttendance({ studentId: r.studentId, date, type, status: r.status, note: r.note })
  }
}
