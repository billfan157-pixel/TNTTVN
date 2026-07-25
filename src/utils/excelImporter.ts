import * as XLSX from 'xlsx'
import type { Student, GradeRecord } from '../types'

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
}

const COLUMN_KEYWORDS: Record<string, string[]> = {
  studentCode: ['mã tn', 'ma tn', 'mã thiếu nhi', 'ma thieu nhi', 'student code', 'code'],
  studentName: ['họ và tên', 'ho va ten', 'họ tên', 'ho ten', 'full name', 'fullname', 'name'],
  holyName: ['tên thánh', 'ten thanh', 'holy name'],
  scoreOral: ['miệng', 'mieng', 'oral', 'mieng'],
  score15m: ['15 phút', '15 phut', '15p', '15 minutes'],
  score1Period: ['1 tiết', '1 tiet', '1 period', '1tiết'],
  scoreMidterm: ['giữa kỳ', 'giua ky', 'giữa kì', 'midterm', 'giữa'],
  scoreFinal: ['cuối kỳ', 'cuoi ky', 'cuối kì', 'cuối', 'final', 'thi cuối'],
  scoreDaoDuc: ['đạo đức', 'dao duc', 'đức', 'duc', 'dao'],
  comments: ['ghi chú', 'ghi chu', 'nhận xét', 'nhan xet', 'comments', 'note'],
}

function detectColumn(header: string): string | null {
  const normalized = header.trim().toLowerCase().replace(/[_\s-]+/g, ' ')
  for (const [key, keywords] of Object.entries(COLUMN_KEYWORDS)) {
    if (keywords.some(kw => normalized.includes(kw) || kw.includes(normalized))) {
      return key
    }
  }
  return null
}

function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Math.round(value * 10) / 10
  const str = String(value).trim().replace(',', '.')
  const num = parseFloat(str)
  if (isNaN(num)) return null
  if (num < 0 || num > 10) return null
  return Math.round(num * 10) / 10
}

export function parseGradeFile(
  arrayBuffer: ArrayBuffer,
  students: Student[]
): ParsedGradeRow[] {
  const data = new Uint8Array(arrayBuffer)
  const workbook = XLSX.read(data, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  if (rawRows.length === 0) return []

  const headers = Object.keys(rawRows[0])
  const colMap = new Map<string, string>()
  for (const header of headers) {
    const detected = detectColumn(header)
    if (detected) colMap.set(detected, header)
  }

  const studentByCode = new Map<string, Student>()
  for (const s of students) {
    if (s.code) studentByCode.set(s.code.trim().toLowerCase(), s)
  }

  const results: ParsedGradeRow[] = []

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    const rowNum = i + 2
    const errors: string[] = []

    const rawCode = colMap.has('studentCode') ? String(row[colMap.get('studentCode')!] ?? '').trim() : ''
    const rawName = colMap.has('studentName') ? String(row[colMap.get('studentName')!] ?? '').trim() : ''
    const rawHolyName = colMap.has('holyName') ? String(row[colMap.get('holyName')!] ?? '').trim() : ''

    const studentCode = rawCode || rawName
    const matchedStudent = studentByCode.get(studentCode.trim().toLowerCase()) || studentByCode.get(rawCode.trim().toLowerCase())

    if (!matchedStudent) {
      errors.push('Không tìm thấy học sinh')
    }

    const scoreOral = colMap.has('scoreOral') ? parseScore(row[colMap.get('scoreOral')!]) : null
    const score15m = colMap.has('score15m') ? parseScore(row[colMap.get('score15m')!]) : null
    const score1Period = colMap.has('score1Period') ? parseScore(row[colMap.get('score1Period')!]) : null
    const scoreMidterm = colMap.has('scoreMidterm') ? parseScore(row[colMap.get('scoreMidterm')!]) : null
    const scoreFinal = colMap.has('scoreFinal') ? parseScore(row[colMap.get('scoreFinal')!]) : null
    const scoreDaoDuc = colMap.has('scoreDaoDuc') ? parseScore(row[colMap.get('scoreDaoDuc')!]) : null

    if (errors.length === 0 && scoreOral === null && score15m === null && score1Period === null &&
        scoreMidterm === null && scoreFinal === null && scoreDaoDuc === null) {
      errors.push('Không có điểm nào để nhập')
    }

    const comments = colMap.has('comments') ? String(row[colMap.get('comments')!] ?? '') : ''

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
    })
  }

  return results
}

export function buildGradeRecords(
  parsedRows: ParsedGradeRow[],
  semester: 1 | 2,
  academicYear: string
): (Partial<GradeRecord> & { studentId: string; semester: 1 | 2 })[] {
  const records: (Partial<GradeRecord> & { studentId: string; semester: 1 | 2 })[] = []

  for (const row of parsedRows) {
    if (!row.isValid || !row.matchedStudent) continue

    records.push({
      studentId: row.matchedStudent.id,
      semester,
      academicYear,
      scoreOral: row.scoreOral,
      score15m: row.score15m,
      score1Period: row.score1Period,
      scoreMidterm: row.scoreMidterm,
      scoreFinal: row.scoreFinal,
      scoreDaoDuc: row.scoreDaoDuc,
      comments: row.comments,
    })
  }

  return records
}
