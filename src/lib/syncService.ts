import React from 'react'
import { useSyncStore } from '../stores/syncStore'

type Entity = 'student' | 'grade' | 'attendance' | 'class' | 'notice' | 'exam'
type Operation = 'CREATE' | 'UPDATE' | 'DELETE'

function enqueue(entity: Entity, operation: Operation, entityId: string, payload: any): Promise<string> {
  return useSyncStore.getState().addOp({
    entity,
    entityId,
    operation,
    payload: JSON.stringify(payload),
  })
}

// ─── Student ───
export function syncCreateStudent(data: any): Promise<string> {
  return enqueue('student', 'CREATE', data.id as string, data)
}

export function syncUpdateStudent(id: string, data: any): Promise<string> {
  return enqueue('student', 'UPDATE', id, data)
}

export function syncDeleteStudent(id: string): Promise<string> {
  return enqueue('student', 'DELETE', id, {})
}

// ─── Grade ───
export function syncUpsertGrade(data: any): Promise<string> {
  const entityId = data.id || `${data.studentId}-${data.semester}-${data.academicYear}`
  return enqueue('grade', 'UPDATE', entityId as string, data)
}

export function syncBatchUpsertGrades(dataList: any[]): Promise<string[]> {
  return Promise.all(dataList.map(data => syncUpsertGrade(data)))
}

// ─── Attendance ───
export function syncSaveAttendance(data: any): Promise<string> {
  const entityId = (data.id || `${data.studentId}-${data.date}-${data.type}`) as string
  return enqueue('attendance', 'UPDATE', entityId, data)
}

export function syncBatchSaveAttendance(
  date: string,
  type: string,
  records: { studentId: string; status: string; note?: string }[],
): Promise<string[]> {
  return Promise.all(records.map(r => syncSaveAttendance({ studentId: r.studentId, date, type, status: r.status, note: r.note })))
}

// ─── Class ───
export function syncCreateClass(data: any): Promise<string> {
  return enqueue('class', 'CREATE', data.id as string, data)
}

export function syncUpdateClass(id: string, data: any): Promise<string> {
  return enqueue('class', 'UPDATE', id, data)
}

export function syncDeleteClass(id: string): Promise<string> {
  return enqueue('class', 'DELETE', id, {})
}

// ─── Notice ───
export function syncCreateNotice(data: any): Promise<string> {
  return enqueue('notice', 'CREATE', data.id as string, data)
}

export function syncUpdateNotice(id: string, data: any): Promise<string> {
  return enqueue('notice', 'UPDATE', id, data)
}

export function syncDeleteNotice(id: string): Promise<string> {
  return enqueue('notice', 'DELETE', id, {})
}

// ─── Exam ───
export function syncCreateExam(data: any): Promise<string> {
  return enqueue('exam', 'CREATE', data.id as string, data)
}

export function syncSaveExamResults(sessionId: string, scores: { studentId: string; score: number; source?: string; answers?: string }[]): Promise<string> {
  return enqueue('exam', 'UPDATE', sessionId, { action: 'save_results', sessionId, scores })
}

export function syncRemoveExamResult(sessionId: string, studentId: string): Promise<string> {
  return enqueue('exam', 'UPDATE', sessionId, { action: 'remove_result', sessionId, studentId })
}

export function syncCompleteExam(sessionId: string): Promise<string> {
  return enqueue('exam', 'UPDATE', sessionId, { action: 'complete', sessionId })
}

export function syncReopenExam(sessionId: string): Promise<string> {
  return enqueue('exam', 'UPDATE', sessionId, { action: 'reopen', sessionId })
}

export function syncDeleteExam(sessionId: string): Promise<string> {
  return enqueue('exam', 'DELETE', sessionId, { action: 'delete_session', sessionId })
}
