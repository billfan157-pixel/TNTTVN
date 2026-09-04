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
export interface ServerFinalizationItem {
  studentId: string
  examResultId: string
  gradeId: string | null
  scoreField: string
  status: 'committed' | 'conflict'
  existingSource: string | null
  rawScore: number
  finalScore: number | null
}

export interface ServerFinalizationReceipt {
  session?: unknown
  finalizationId?: string | null
  items?: ServerFinalizationItem[]
  committed?: number
  conflicts?: number
  legacy?: boolean
}

export interface ServerFinalizeMapDeps {
  receipt: ServerFinalizationReceipt
  scoreType: string
  semester: 1 | 2
  results: ExamResult[]
  readGrade: ExamFinalizeDeps['readGrade']
  studentNameResolver?: ExamFinalizeDeps['studentNameResolver']
}

/**
 * P0-01 (Phase 0 containment): project server finalization receipt thành
 * ExamFinalizeResult HIỂN THỊ — thuần, không side-effect, không ghi grade.
 * Server là sole writer của grades/ledger; client không được gọi addDailyEntry
 * hay upsertGrade sau complete. existingScore đọc local chỉ để hiển thị.
 */
export function mapServerFinalizationToResult(deps: ServerFinalizeMapDeps): ExamFinalizeResult {
  const { receipt, scoreType, semester, results, readGrade, studentNameResolver } = deps
  const items = Array.isArray(receipt.items) ? receipt.items : []
  const fieldMap = SCORE_FIELD_MAP[scoreType]
  const conflicts: ExamConflict[] = []
  let committedCount = 0

  for (const item of items) {
    if (item.status === 'conflict') {
      const grade = readGrade(item.studentId, semester)
      const rawExisting = fieldMap && grade
        ? (grade as Record<string, unknown>)[fieldMap.field]
        : null
      conflicts.push({
        studentId: item.studentId,
        studentName: formatStudentName(item.studentId, results, studentNameResolver),
        existingSource: (item.existingSource === 'manual' || item.existingSource === 'override' || item.existingSource === 'excel_import')
          ? item.existingSource
          : 'manual',
        existingScore: typeof rawExisting === 'number' ? rawExisting : null,
        scannedScore: item.rawScore,
      })
      continue
    }
    committedCount++
  }

  const isDaily = (DAILY_TYPES as readonly string[]).includes(scoreType)
  return {
    dailyCount: isDaily ? committedCount : 0,
    directCount: isDaily ? 0 : committedCount,
    conflicts,
    skipped: conflicts.length,
  }
}
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
