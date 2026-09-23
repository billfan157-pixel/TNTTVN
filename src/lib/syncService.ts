import { useSyncStore } from '../stores/syncStore'

type Entity = 'student' | 'grade' | 'attendance' | 'class' | 'notice' | 'exam' | 'exam_result' | 'daily_entry'
type Operation = 'CREATE' | 'UPDATE' | 'DELETE'

export interface ExamResultSyncScore {
  studentId: string
  score: number
  essayScore?: number
  source?: string
  answers?: string
  scanMetadata?: string
  examVersion?: string
  clientMutationId?: string
  attemptFingerprint?: string
  capturedAt?: string
  expectedResultVersion?: number
  afterMutationId?: string
}

export interface QueuedExamResultMutation {
  queueOpId: string
  clientMutationId: string
  studentId: string
}

function newMutationId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `EXM-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * Exam result mutations intentionally have a per-student queue identity.
 * Using only the session id makes syncStore dedupe/compaction replace the whole
 * scores[] payload and silently lose previously scanned students.
 */
export function examResultQueueEntityId(sessionId: string, studentId: string): string {
  return `${sessionId}::result::${studentId}`
}

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
  records: { studentId: string; status: string; note?: string; version?: number }[],
): Promise<string[]> {
  return Promise.all(records.map(r => syncSaveAttendance({ studentId: r.studentId, date, type, status: r.status, note: r.note, version: r.version ?? 0 })))
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

export async function syncSaveExamResults(
  sessionId: string,
  scores: ExamResultSyncScore[],
): Promise<QueuedExamResultMutation[]> {
  const queued: QueuedExamResultMutation[] = []
  // Sequential enqueue preserves input order even when multiple items share the
  // same millisecond timestamp; complete/reopen barriers are queued afterwards.
  for (const input of scores) {
    const clientMutationId = input.clientMutationId || newMutationId()
    const score = { ...input, clientMutationId, capturedAt: input.capturedAt || new Date().toISOString() }
    const queueOpId = await enqueue(
      'exam_result',
      'UPDATE',
      examResultQueueEntityId(sessionId, input.studentId),
      { action: 'save_result', sessionId, score },
    )
    queued.push({ queueOpId, clientMutationId, studentId: input.studentId })
  }
  return queued
}

export interface ExamResultDeleteIntent {
  clientMutationId: string
  expectedResultId?: string
  expectedResultVersion?: number
  afterMutationId?: string
}

export function syncRemoveExamResult(sessionId: string, studentId: string, deletion: ExamResultDeleteIntent): Promise<string> {
  return enqueue(
    'exam_result',
    'UPDATE',
    examResultQueueEntityId(sessionId, studentId),
    { action: 'remove_result', sessionId, studentId, deletion },
  )
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

// ─── Daily entry (Tier 2) ───
// id client-stable (DG-...) → server idempotent qua PK (parish_id,id).
// CREATE (không UPDATE): add-then-remove khi offline được compact hủy cả cặp;
// retry sau khi đã gửi trả `duplicate`, không nhân đôi.
export function syncUpsertDailyEntry(data: {
  id: string; studentId: string; academicYear: string; semester: number; scoreType: string; value: number; date?: string
}): Promise<string> {
  return enqueue('daily_entry', 'CREATE', data.id, data)
}

export function syncDeleteDailyEntry(id: string): Promise<string> {
  return enqueue('daily_entry', 'DELETE', id, { id })
}
