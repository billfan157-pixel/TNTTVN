import type { ExamSession, ExamResult, ExamConflict, ExamFinalizeResult, DailyScoreType } from '../types'

/**
 * Bảng ánh xạ loại điểm thi → cột điểm + cột source + cột updated_at trên GradeRecord.
 * (Trước đây nằm trong examStore — chuyển ra service cho clean architecture, store re-export
 * để giữ API cũ cho component/test.)
 */
export const SCORE_FIELD_MAP: Record<string, { field: string; sourceField: string; updatedField: string }> = {
  oral: { field: 'scoreOral', sourceField: 'scoreOral_source', updatedField: 'scoreOral_updated_at' },
  '15m': { field: 'score15m', sourceField: 'score15m_source', updatedField: 'score15m_updated_at' },
  '1period': { field: 'score1Period', sourceField: 'score1Period_source', updatedField: 'score1Period_updated_at' },
  midterm: { field: 'scoreMidterm', sourceField: 'scoreMidterm_source', updatedField: 'scoreMidterm_updated_at' },
  final: { field: 'scoreFinal', sourceField: 'scoreFinal_source', updatedField: 'scoreFinal_updated_at' },
}

export const DAILY_TYPES: DailyScoreType[] = ['oral', '15m', '1period']

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface ExamFinalizeDeps {
  results: ExamResult[]
  session: Pick<ExamSession, 'scoreType' | 'academicYear' | 'semester'>
  readGrade: (studentId: string, semester: 1 | 2) => Record<string, unknown> | null | undefined
  addDailyEntry: (studentId: string, scoreType: DailyScoreType, score: number, semester: 1 | 2, date: string) => void
  upsertGrade: (payload: Record<string, unknown>) => void
  /** Nguồn dữ liệu học viên (vd: studentStore) — service chỉ format label, không đụng store */
  studentNameResolver?: (studentId: string) => { fullName: string; code?: string } | null | undefined
}

/** Format tên hiển thị: ưu tiên kết quả scan, sau đó resolver (store), fallback id. Single-source ở đây. */
function formatStudentName(studentId: string, results: ExamResult[], resolver?: ExamFinalizeDeps['studentNameResolver']): string {
  const hit = results.find(r => r.studentId === studentId)
  if (hit?.studentName) return `${hit.studentName}${hit.studentCode ? ` (${hit.studentCode})` : ''}`
  const resolved = resolver?.(studentId)
  if (resolved) return `${resolved.fullName}${resolved.code ? ` (${resolved.code})` : ''}`
  return studentId
}

/**
 * Đánh giá xung đột nguồn điểm (manual/override/excel_import → BLOCK, không ghi đè) và
 * phân phối điểm bài thi: oral/15m/1period → pipeline daily; midterm/final → ghi
 * trực tiếp _source='exam_scan'.
 * Khớp PROTECTED_GRADE_SOURCES bên server (examService.ts) — server là nguồn chốt cuối.
 * Thuần — mọi side-effect qua deps, unit-test được không cần mount Zustand.
 */
export function evaluateExamFinalizeConflictsAndRoute(deps: ExamFinalizeDeps): ExamFinalizeResult {
  const { results, session, readGrade, addDailyEntry, upsertGrade } = deps
  const semester = session.semester as 1 | 2
  const conflicts: ExamConflict[] = []
  let dailyCount = 0
  let directCount = 0
  let skipped = 0

  for (const r of results) {
    const fieldMap = SCORE_FIELD_MAP[session.scoreType]
    const grade = readGrade(r.studentId, semester)
    const existingSource = (grade as any)?.[fieldMap.sourceField] as string | undefined

    if (existingSource === 'manual' || existingSource === 'override' || existingSource === 'excel_import') {
      conflicts.push({
        studentId: r.studentId,
        studentName: formatStudentName(r.studentId, results, deps.studentNameResolver),
        existingSource,
        existingScore: (grade as any)?.[fieldMap.field] ?? null,
        scannedScore: r.score,
      })
      skipped++
      continue
    }

    if (DAILY_TYPES.includes(session.scoreType as DailyScoreType)) {
      addDailyEntry(r.studentId, session.scoreType as DailyScoreType, r.score, semester, toDateString(new Date()))
      dailyCount++
    } else {
      const now = new Date().toISOString()
      upsertGrade({
        studentId: r.studentId,
        semester,
        academicYear: session.academicYear,
        [fieldMap.field]: r.score,
        [fieldMap.sourceField]: 'exam_scan',
        [fieldMap.updatedField]: now,
      })
      directCount++
    }
  }

  return { dailyCount, directCount, conflicts, skipped }
}
