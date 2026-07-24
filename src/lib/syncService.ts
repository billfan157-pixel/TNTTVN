import { useSyncStore } from '../stores/syncStore'

type Entity = 'student' | 'grade' | 'attendance'
type Operation = 'CREATE' | 'UPDATE' | 'DELETE'

function enqueue(entity: Entity, operation: Operation, entityId: string, payload: any) {
  useSyncStore.getState().addOp({
    entity,
    entityId,
    operation,
    payload: JSON.stringify(payload),
  })
}

// ─── Student ───
export function syncCreateStudent(data: any) {
  enqueue('student', 'CREATE', data.id as string, data)
}

export function syncUpdateStudent(id: string, data: any) {
  enqueue('student', 'UPDATE', id, data)
}

export function syncDeleteStudent(id: string) {
  enqueue('student', 'DELETE', id, {})
}

// ─── Grade ───
export function syncUpsertGrade(data: any) {
  enqueue('grade', 'UPDATE', (data.id || data.studentId) as string, data)
}

export function syncBatchUpsertGrades(dataList: any[]) {
  for (const data of dataList) {
    syncUpsertGrade(data)
  }
}

// ─── Attendance ───
export function syncSaveAttendance(data: any) {
  const entityId = (data.id || `${data.studentId}-${data.date}-${data.type}`) as string
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
