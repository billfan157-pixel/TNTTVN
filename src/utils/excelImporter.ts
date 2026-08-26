import type { Student, GradeRecord } from '../types'
import { matchStudentWithConfidence, normalizeHolyName, explainMatchFailure } from './excelGradeParser'
import { loadXlsx } from '../lib/xlsxLoader'

export interface ParsedGradeRow {
  rowNum: number
  studentCode: string
  studentName: string
  matchedStudent: Student | null
  scoreOral: number | null
  score15m: number | null
  score1Period: number | null
  scoreMidterm: number | null
  scoreFinal: number | null
  scoreDaoDuc: number | null
  comments: string
  isValid: boolean
  errors: string[]
  warnings: string[]
}

const COLUMN_KEYWORDS: Record<string, { keywords: string[]; priority: number }> = {
  studentCode: { keywords: ['mã tn', 'ma tn', 'mã thiếu nhi', 'ma thieu nhi', 'student code', 'code', 'mã s', 'ma s', 'mã số', 'ma so'], priority: 1 },
  studentName: { keywords: ['họ và tên', 'ho va ten', 'họ tên', 'ho ten', 'full name', 'fullname', 'student name', 'name', 'tên học sinh', 'ten hoc sinh', 'thiếu nhi', 'thieu nhi'], priority: 1 },
  holyName: { keywords: ['tên thánh', 'ten thanh', 'holy name', 'tên thá', 'ten tha', 'thánh', 'thanh', 'tên bổn mạng', 'ten bon mang', 'bổn mạng', 'bon mang'], priority: 1 },
  lastName: { keywords: ['họ', 'ho', 'h', 'họ đệm', 'ho dem', 'last name', 'surname', 'family name'], priority: 2 },
  firstName: { keywords: ['tên', 'ten', 'tê', 't', 'first name', 'given name'], priority: 2 },
  scoreOral: { keywords: ['miệng', 'mieng', 'oral', 'm', 'kt miệng', 'kt mieng', 'kiểm tra miệng', 'kiem tra mieng', 'điểm miệng', 'diem mieng', 'ktra miệng', 'ktra mieng', 'đ.miệng', 'đ miệng'], priority: 1 },
  score15m: { keywords: ['15 phút', '15 phut', '15p', '15 minutes', 'kiểm tra 15 phút', 'kiem tra 15 phut', 'kt 15p', 'kt 15', 'điểm 15 phút', 'diem 15 phut', 'ktra 15p'], priority: 1 },
  score1Period: { keywords: ['1 tiết', '1 tiet', '1 period', '1tiết', '1t', 'kt 1 tiết', 'kt 1 tiet', 'kiểm tra 1 tiết', 'kiem tra 1 tiet', 'viết', 'viet', 'điểm 1 tiết', 'diem 1 tiet', 'ktra 1 tiết', 'ktra 1 tiet'], priority: 1 },
  scoreMidterm: { keywords: ['giữa kỳ', 'giua ky', 'giữa kì', 'midterm', 'giữa', 'gk', 'giữa hk', 'giữa học kỳ', 'giua hoc ky', 'thi giữa kỳ', 'thi giua ky', 'thi gk', 'điểm giữa kỳ', 'diem giua ky'], priority: 1 },
  scoreFinal: { keywords: ['cuối kỳ', 'cuoi ky', 'cuối kì', 'cuối', 'final', 'thi cuối', 'ck', 'thi cuối kỳ', 'thi cuoi ky', 'thi ck', 'cuối hk', 'cuối học kỳ', 'cuoi hoc ky', 'thi hk', 'điểm cuối kỳ', 'diem cuoi ky', 'điểm thi', 'diem thi', 'kiểm tra cuối kỳ', 'kiem tra cuoi ky'], priority: 1 },
  scoreDaoDuc: { keywords: ['đạo đức', 'dao duc', 'đức', 'duc', 'đạo', 'dao', 'hạnh kiểm', 'hanh kiem', 'điểm đạo đức', 'diem dao duc', 'đđ', 'dd', 'đ.đ', 'đạo đ', 'dao d'], priority: 1 },
  comments: { keywords: ['ghi chú', 'ghi chu', 'nhận xét', 'nhan xet', 'comments', 'note', 'lưu ý', 'luu y', 'remark', 'remarks', 'comment'], priority: 1 },
}

// Cột tính toán / metadata — bỏ qua khi detect, tránh map sai vào score fields.
// Matching dùng token-boundary (exact word) để tránh bỏ nhầm header hợp lệ
// (ví dụ: "TB 15 Phút" không bị nhận nhầm là ĐTB).
const IGNORED_COLUMN_PATTERNS: string[] = [
  'đtb', 'điểm trung bình', 'diem trung binh', 'trung bình', 'trung binh', 'average', 'avg',
  'tb', 't.b', 't.b - cả n', 't.b - ca n',
  'xếp loại', 'xep loai', 'hạng', 'hang', 'rank', 'xếp hạng', 'xep hang',
  'stt', 'no', '#', 'số thứ tự', 'so thu tu',
  'phái', 'giới tính', 'gioi tinh', 'gender',
  'ngày sinh', 'ngay sinh', 'dob', 'date of birth', 'năm sinh', 'nam sinh',
]

export function isIgnoredColumn(header: string): boolean {
  const normalized = header.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\s-]+/g, ' ').trim()
  // Token-boundary matching: header phải khớp CHÍNH XÁC với pattern,
  // không dùng includes() để tránh bỏ nhầm (ví dụ: "TB 15 Phút" ≠ "TB")
  for (const pattern of IGNORED_COLUMN_PATTERNS) {
    const normPattern = pattern.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\s-]+/g, ' ').trim()
    if (normalized === normPattern) return true
  }
  return false
}

export interface GradeColumnDetection {
  field: string
  score: number
  reason: string
}

export function normalizeKeyword(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\s-]+/g, ' ')
}

/**
 * Scoring-based column detection. Returns best match with confidence score.
 * Returns null for ignored columns (ĐTB, Xếp Loại, etc.)
 */
export function detectGradeColumn(header: string): GradeColumnDetection | null {
  if (isIgnoredColumn(header)) return null

  const normalized = normalizeKeyword(header)
  if (!normalized) return null

  let best: GradeColumnDetection | null = null

  for (const [field, { keywords, priority }] of Object.entries(COLUMN_KEYWORDS)) {
    for (const kw of keywords) {
      const normKw = normalizeKeyword(kw)
      let score = 0
      let reason = ''

      if (normalized === normKw) {
        // Exact match
        score = 100
        reason = `Exact match "${kw}"`
      } else if (normalized.length <= 2 || normKw.length <= 2) {
        // Short strings: exact match only (guard against false positives)
        continue
      } else if (normalized.includes(normKw)) {
        // Header contains keyword
        score = 80 + Math.round((normKw.length / normalized.length) * 15)
        reason = `Header contains "${kw}"`
      } else if (normKw.includes(normalized)) {
        // Keyword contains header (header is abbreviation)
        score = 70 + Math.round((normalized.length / normKw.length) * 15)
        reason = `Abbreviation of "${kw}"`
      }

      if (score > 0) {
        // Apply priority modifier: priority 2 fields (lastName, firstName) get slight penalty
        // to prefer fullName/holyName when ambiguous
        if (priority === 2) score = Math.max(1, score - 5)

        if (!best || score > best.score) {
          best = { field, score, reason }
        }
      }
    }
  }

  return best
}

/**
 * Backward-compatible wrapper for detectColumn.
 * Used by excelGradeParser.ts — returns field name only.
 */
export function detectColumn(header: string): string | null {
  return detectGradeColumn(header)?.field ?? null
}

/**
 * Multi-column assignment: detect all columns using scoring, resolving conflicts.
 * No two headers map to the same field; no header maps to two fields.
 * Similar to detectColumnsWithConfidence in excelParser.ts.
 */
export interface GradeColumnsResult {
  colMap: Record<string, number>
  detections: { field: string; headerName: string; colIndex: number; score: number; reason: string }[]
  ignoredColumns: { headerName: string; colIndex: number }[]
  unmappedColumns: { headerName: string; colIndex: number }[]
}

export function detectGradeColumns(headers: string[]): GradeColumnsResult {
  const scored: { colIdx: number; field: string; score: number; reason: string; headerName: string }[] = []
  const ignoredColumns: { headerName: string; colIndex: number }[] = []
  const unmappedColumns: { headerName: string; colIndex: number }[] = []

  for (let i = 0; i < headers.length; i++) {
    const header = (headers[i] || '').trim()
    if (!header) continue

    if (isIgnoredColumn(header)) {
      ignoredColumns.push({ headerName: header, colIndex: i })
      continue
    }

    const detection = detectGradeColumn(header)
    if (detection) {
      scored.push({ colIdx: i, field: detection.field, score: detection.score, reason: detection.reason, headerName: header })
    } else {
      unmappedColumns.push({ headerName: header, colIndex: i })
    }
  }

  // Hungarian-style assignment: highest scores first, no duplicate fields or columns
  scored.sort((a, b) => b.score - a.score)
  const colMap: Record<string, number> = {}
  const detections: GradeColumnsResult['detections'] = []
  const usedCols = new Set<number>()
  const usedFields = new Set<string>()

  for (const item of scored) {
    if (!usedFields.has(item.field) && !usedCols.has(item.colIdx)) {
      colMap[item.field] = item.colIdx
      detections.push({ field: item.field, headerName: item.headerName, colIndex: item.colIdx, score: item.score, reason: item.reason })
      usedCols.add(item.colIdx)
      usedFields.add(item.field)
    }
  }

  // Move unused headers (those in scored but not assigned) to unmapped
  for (let i = 0; i < headers.length; i++) {
    const header = (headers[i] || '').trim()
    if (!header) continue
    if (usedCols.has(i) || ignoredColumns.some(ic => ic.colIndex === i) || unmappedColumns.some(uc => uc.colIndex === i)) continue
    unmappedColumns.push({ headerName: header, colIndex: i })
  }

  return { colMap, detections, ignoredColumns, unmappedColumns }
}

// Các giá trị đặc biệt — null nhưng CẦN warning (vắng thi, không xếp loại, ...)
export const SPECIAL_NULL_VALUES: Record<string, string> = {
  'v': 'Vắng (V)',
  'vắng': 'Vắng',
  'vang': 'Vắng',
  'x': 'Không xếp loại (X)',
  'kxl': 'Không xếp loại (KXL)',
  'đ': 'Đạt (Đ) — không phải điểm số',
  'dat': 'Đạt — không phải điểm số',
  'kđ': 'Không đạt (KĐ)',
  'khong dat': 'Không đạt',
}

export interface ParseScoreResult {
  value: number | null
  error?: string
  warning?: string
}

// Exported cho regression test (sync-fix: clamp số 0-10).
export function parseScore(value: unknown): ParseScoreResult {
  if (value === null || value === undefined || value === '') return { value: null }

  // Check special null values FIRST
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '' || trimmed === '-' || trimmed === '—') return { value: null }
    const lower = trimmed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const specialMsg = SPECIAL_NULL_VALUES[lower]
    if (specialMsg) {
      return { value: null, warning: `Giá trị "${trimmed}" → bỏ qua (${specialMsg}). Điểm cũ sẽ được giữ nguyên.` }
    }
  }

  if (typeof value === 'number') {
    if (value < 0 || value > 10) return { value: null, error: `Điểm ngoài khoảng 0-10: ${value}` }
    return { value: Math.round(value * 10) / 10 }
  }

  const str = String(value).trim().replace(/,/g, '.').replace(/\s+/g, '')
  const num = parseFloat(str)
  if (isNaN(num)) return { value: null, error: `Điểm không phải là số: "${value}"` }
  if (num < 0 || num > 10) return { value: null, error: `Điểm ngoài khoảng 0-10: ${num}` }
  return { value: Math.round(num * 10) / 10 }
}

export interface ParseGradeFileResult {
  rows: ParsedGradeRow[]
  diagnostics: GradeColumnsResult | null
}

export async function parseGradeFile(
  arrayBuffer: ArrayBuffer,
  students: Student[]
): Promise<ParseGradeFileResult> {
  const XLSX = await loadXlsx()
  const data = new Uint8Array(arrayBuffer)
  const workbook = XLSX.read(data, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  if (rawRows.length === 0) return { rows: [], diagnostics: null }

  const headers = Object.keys(rawRows[0])
  const diagnostics = detectGradeColumns(headers)
  const { colMap } = diagnostics

  // Convert colMap from field→colIndex to field→headerName for key-value row access
  const fieldToHeader = new Map<string, string>()
  for (const [field, colIdx] of Object.entries(colMap)) {
    if (colIdx < headers.length) fieldToHeader.set(field, headers[colIdx])
  }

  const results: ParsedGradeRow[] = []

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    const rowNum = i + 2
    const errors: string[] = []
    const warnings: string[] = []

    const rawCode = fieldToHeader.has('studentCode') ? String(row[fieldToHeader.get('studentCode')!] ?? '').trim() : ''
    let rawName = fieldToHeader.has('studentName') ? String(row[fieldToHeader.get('studentName')!] ?? '').trim() : ''
    let rawHolyName = fieldToHeader.has('holyName') ? String(row[fieldToHeader.get('holyName')!] ?? '').trim() : ''
    const rawLastName = fieldToHeader.has('lastName') ? String(row[fieldToHeader.get('lastName')!] ?? '').trim() : ''
    const rawFirstName = fieldToHeader.has('firstName') ? String(row[fieldToHeader.get('firstName')!] ?? '').trim() : ''

    if (rawLastName || rawFirstName) {
      const combined = `${rawLastName} ${rawFirstName}`.trim()
      if (!rawName || (rawLastName && !rawName.includes(rawLastName))) {
        rawName = combined
      }
    }

    rawHolyName = normalizeHolyName(rawHolyName)

    const studentCode = (rawCode || rawName).trim().toUpperCase()
    const matchResult = matchStudentWithConfidence(rawCode, rawHolyName, rawName, students)
    const matchedStudent = matchResult?.student

    if (!matchedStudent) {
      errors.push(explainMatchFailure(rawCode, rawHolyName, rawName, students))
    }

    const getScoreField = (field: string): ParseScoreResult => {
      if (!fieldToHeader.has(field)) return { value: null }
      return parseScore(row[fieldToHeader.get(field)!])
    }

    const oralResult = getScoreField('scoreOral')
    const s15mResult = getScoreField('score15m')
    const s1PResult = getScoreField('score1Period')
    const midResult = getScoreField('scoreMidterm')
    const finResult = getScoreField('scoreFinal')
    const ddResult = getScoreField('scoreDaoDuc')

    // Collect errors from score parsing
    if (oralResult.error) errors.push(`Điểm Miệng: ${oralResult.error}`)
    if (s15mResult.error) errors.push(`Điểm 15P: ${s15mResult.error}`)
    if (s1PResult.error) errors.push(`Điểm 1 Tiết: ${s1PResult.error}`)
    if (midResult.error) errors.push(`Điểm Giữa Kỳ: ${midResult.error}`)
    if (finResult.error) errors.push(`Điểm Cuối Kỳ: ${finResult.error}`)
    if (ddResult.error) errors.push(`Điểm Đạo Đức: ${ddResult.error}`)

    // Collect warnings from special values (V, X, KXL)
    if (oralResult.warning) warnings.push(`Miệng: ${oralResult.warning}`)
    if (s15mResult.warning) warnings.push(`15P: ${s15mResult.warning}`)
    if (s1PResult.warning) warnings.push(`1 Tiết: ${s1PResult.warning}`)
    if (midResult.warning) warnings.push(`Giữa Kỳ: ${midResult.warning}`)
    if (finResult.warning) warnings.push(`Cuối Kỳ: ${finResult.warning}`)
    if (ddResult.warning) warnings.push(`Đạo Đức: ${ddResult.warning}`)

    const scoreOral = oralResult.value
    const score15m = s15mResult.value
    const score1Period = s1PResult.value
    const scoreMidterm = midResult.value
    const scoreFinal = finResult.value
    const scoreDaoDuc = ddResult.value

    if (errors.length === 0 && scoreOral === null && score15m === null && score1Period === null &&
        scoreMidterm === null && scoreFinal === null && scoreDaoDuc === null && warnings.length === 0) {
      errors.push('Không nhận diện được cột điểm nào. Vui lòng kiểm tra tên cột trong file (cần có: Miệng, 15P, 1 Tiết, Giữa Kỳ, Cuối Kỳ, Đạo Đức)')
    }

    // ADR-016 (sync-fix): Cap comments 500 ký tự — khớp server schema max(500)
    const comments = (fieldToHeader.has('comments') ? String(row[fieldToHeader.get('comments')!] ?? '') : '').slice(0, 500)

    results.push({
      rowNum,
      studentCode: studentCode,
      studentName: rawHolyName ? `${rawHolyName} ${rawName}` : rawName,
      matchedStudent: matchedStudent || null,
      scoreOral,
      score15m,
      score1Period,
      scoreMidterm,
      scoreFinal,
      scoreDaoDuc,
      comments,
      isValid: errors.length === 0,
      errors,
      warnings,
    })
  }

  return { rows: results, diagnostics }
}

const SCORE_FIELDS = ['scoreOral','score15m','score1Period','scoreMidterm','scoreFinal','scoreDaoDuc'] as const

export function buildGradeRecords(
  parsedRows: ParsedGradeRow[],
  semester: 1 | 2,
  academicYear: string
): (Partial<GradeRecord> & { studentId: string; semester: 1 | 2 })[] {
  const records: (Partial<GradeRecord> & { studentId: string; semester: 1 | 2 })[] = []
  const now = new Date().toISOString()

  for (const row of parsedRows) {
    if (!row.isValid || !row.matchedStudent) continue

    const base: Record<string, any> = {
      studentId: row.matchedStudent.id,
      semester,
      academicYear,
    }
    // ADR-018 (import audit #1): Chỉ ghi comments khi KHÔNG rỗng — trước đây luôn
    // set comments (kể cả '' khi file thiếu cột Ghi Chú) → merge trong
    // batchSaveGrades ghi đè comments cũ bằng chuỗi rỗng, mất ghi chú im lặng.
    // Giờ comments rỗng được bỏ qua, giữ nguyên comments hiện có (khớp cam kết
    // "ô trống được giữ nguyên" của modal import).
    if (row.comments) {
      base.comments = row.comments
    }

    for (const f of SCORE_FIELDS) {
      if (row[f] !== null) {
        base[f] = row[f]
        base[`${f}_source`] = 'excel_import'
        base[`${f}_updated_at`] = now
      }
    }

    records.push(base as any)
  }

  return records
}

export function countPreservedRows(parsedRows: ParsedGradeRow[]): number {
  return parsedRows.filter(r =>
    r.isValid &&
    r.matchedStudent &&
    SCORE_FIELDS.some(f => r[f] === null)
  ).length
}
