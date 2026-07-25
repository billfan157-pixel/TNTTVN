import * as XLSX from 'xlsx'
import type { Student, GradeRecord } from '../types'

export interface ParsedGradeRow {
  rowIndex: number
  studentCode?: string
  holyName?: string
  fullName: string
  scoreOral: number | null
  score15m: number | null
  score1Period: number | null
  scoreMidterm: number | null
  scoreFinal: number | null
  scoreDaoDuc: number | null
  comments: string
  matchedStudent?: Student
  isValid: boolean
  warnings: string[]
  errors: string[]
}

export interface ParsedGradeImportResult {
  rows: ParsedGradeRow[]
  matchedCount: number
  unmatchedCount: number
  validCount: number
  errorCount: number
}

function parseScore(val: any): { value: number | null; error?: string } {
  if (val === null || val === undefined || val === '') return { value: null }
  let str = String(val).trim().replace(',', '.')
  if (str === '' || str === '-') return { value: null }

  const num = Number(str)
  if (isNaN(num)) {
    return { value: null, error: `Điểm không phải là số: "${val}"` }
  }
  if (num < 0 || num > 10) {
    return { value: null, error: `Điểm ngoài khoảng 0-10: ${num}` }
  }
  return { value: Math.round(num * 10) / 10 }
}

function normalizeName(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchStudentInRoster(
  code: string | undefined,
  holyName: string | undefined,
  fullName: string,
  classStudents: Student[]
): Student | undefined {
  if (code) {
    const cleanCode = code.trim().toLowerCase()
    const byCode = classStudents.find((s) => s.code?.trim().toLowerCase() === cleanCode)
    if (byCode) return byCode
  }

  const normFull = normalizeName(fullName)
  const normHoly = holyName ? normalizeName(holyName) : ''

  if (normHoly) {
    const exactBoth = classStudents.find(
      (s) => normalizeName(s.fullName) === normFull && normalizeName(s.holyName || '') === normHoly
    )
    if (exactBoth) return exactBoth
  }

  const exactFull = classStudents.find((s) => normalizeName(s.fullName) === normFull)
  if (exactFull) return exactFull

  // Fallback: full name matching with holy name included in name string
  const combinedNorm = normalizeName(`${holyName || ''} ${fullName}`)
  const matchCombined = classStudents.find((s) => {
    const sCombined = normalizeName(`${s.holyName || ''} ${s.fullName}`)
    return sCombined === combinedNorm
  })
  return matchCombined
}

function processRawDataRows(rawRows: any[][], classStudents: Student[]): ParsedGradeImportResult {
  if (rawRows.length === 0) {
    return { rows: [], matchedCount: 0, unmatchedCount: 0, validCount: 0, errorCount: 0 }
  }

  // Find header row
  let headerIndex = -1
  let colMap: Record<string, number> = {}

  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const rowStr = rawRows[i].map((c) => String(c || '').toLowerCase()).join(' ')
    if (
      rowStr.includes('họ') ||
      rowStr.includes('tên') ||
      rowStr.includes('miệng') ||
      rowStr.includes('15') ||
      rowStr.includes('cuối kỳ') ||
      rowStr.includes('đtb')
    ) {
      headerIndex = i
      break
    }
  }

  if (headerIndex !== -1) {
    const headers = rawRows[headerIndex].map((c) => String(c || '').trim().toLowerCase())
    headers.forEach((h, idx) => {
      if (h.includes('mã')) colMap.code = idx
      else if (h.includes('thánh') || h.includes('holy')) colMap.holyName = idx
      else if (h.includes('họ') || h.includes('tên') || h.includes('name')) {
        if (!colMap.fullName && !h.includes('thánh')) colMap.fullName = idx
      } else if (h.includes('miệng') || h.includes('oral')) colMap.scoreOral = idx
      else if (h.includes('15') || h.includes('15p')) colMap.score15m = idx
      else if (h.includes('1 tiết') || h.includes('1t') || h.includes('45p')) colMap.score1Period = idx
      else if (h.includes('giữa kỳ') || h.includes('gk') || h.includes('mid')) colMap.scoreMidterm = idx
      else if (h.includes('cuối kỳ') || h.includes('ck') || h.includes('final')) colMap.scoreFinal = idx
      else if (h.includes('đạo đức') || h.includes('hạnh kiểm')) colMap.scoreDaoDuc = idx
      else if (h.includes('ghi chú') || h.includes('nhận xét') || h.includes('comment')) colMap.comments = idx
    })
  }

  const dataStart = headerIndex !== -1 ? headerIndex + 1 : 0
  const parsedRows: ParsedGradeRow[] = []

  let matchedCount = 0
  let unmatchedCount = 0
  let validCount = 0
  let errorCount = 0

  for (let i = dataStart; i < rawRows.length; i++) {
    const row = rawRows[i]
    if (!row || row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '')) {
      continue
    }

    let code: string | undefined
    let holyName: string | undefined
    let fullName = ''
    let scoreOralRaw: any
    let score15mRaw: any
    let score1PeriodRaw: any
    let scoreMidtermRaw: any
    let scoreFinalRaw: any
    let scoreDaoDucRaw: any
    let comments = ''

    if (Object.keys(colMap).length > 0) {
      if (colMap.code !== undefined) code = String(row[colMap.code] || '').trim()
      if (colMap.holyName !== undefined) holyName = String(row[colMap.holyName] || '').trim()
      if (colMap.fullName !== undefined) fullName = String(row[colMap.fullName] || '').trim()
      if (colMap.scoreOral !== undefined) scoreOralRaw = row[colMap.scoreOral]
      if (colMap.score15m !== undefined) score15mRaw = row[colMap.score15m]
      if (colMap.score1Period !== undefined) score1PeriodRaw = row[colMap.score1Period]
      if (colMap.scoreMidterm !== undefined) scoreMidtermRaw = row[colMap.scoreMidterm]
      if (colMap.scoreFinal !== undefined) scoreFinalRaw = row[colMap.scoreFinal]
      if (colMap.scoreDaoDuc !== undefined) scoreDaoDucRaw = row[colMap.scoreDaoDuc]
      if (colMap.comments !== undefined) comments = String(row[colMap.comments] || '').trim()
    } else {
      // Positional fallback: STT, Code, HolyName, FullName, Gender, DOB, Oral, 15m, 1Period, Midterm, Final, DaoDuc, AVG, Rank, Comments
      let offset = 0
      if (/^\d+$/.test(String(row[0] || '').trim())) offset = 1

      if (row.length >= offset + 3) {
        code = String(row[offset] || '').trim()
        holyName = String(row[offset + 1] || '').trim()
        fullName = String(row[offset + 2] || '').trim()

        // Scores are typically starting from index offset + 5 or 6 (skipping Gender/DOB)
        let scoreIdx = offset + 5
        if (row.length > scoreIdx) scoreOralRaw = row[scoreIdx]
        if (row.length > scoreIdx + 1) score15mRaw = row[scoreIdx + 1]
        if (row.length > scoreIdx + 2) score1PeriodRaw = row[scoreIdx + 2]
        if (row.length > scoreIdx + 3) scoreMidtermRaw = row[scoreIdx + 3]
        if (row.length > scoreIdx + 4) scoreFinalRaw = row[scoreIdx + 4]
        if (row.length > scoreIdx + 5) scoreDaoDucRaw = row[scoreIdx + 5]
        if (row.length > scoreIdx + 8) comments = String(row[scoreIdx + 8] || '').trim()
      }
    }

    if (!fullName && !code && !holyName) continue

    const errors: string[] = []
    const warnings: string[] = []

    const oral = parseScore(scoreOralRaw)
    if (oral.error) errors.push(`Điểm Miệng: ${oral.error}`)

    const s15m = parseScore(score15mRaw)
    if (s15m.error) errors.push(`Điểm 15P: ${s15m.error}`)

    const s1P = parseScore(score1PeriodRaw)
    if (s1P.error) errors.push(`Điểm 1 Tiết: ${s1P.error}`)

    const mid = parseScore(scoreMidtermRaw)
    if (mid.error) errors.push(`Điểm Giữa Kỳ: ${mid.error}`)

    const fin = parseScore(scoreFinalRaw)
    if (fin.error) errors.push(`Điểm Cuối Kỳ: ${fin.error}`)

    const daoDuc = parseScore(scoreDaoDucRaw)
    if (daoDuc.error) errors.push(`Điểm Đạo Đức: ${daoDuc.error}`)

    const matched = matchStudentInRoster(code, holyName, fullName, classStudents)
    if (matched) {
      matchedCount++
    } else {
      unmatchedCount++
      warnings.push(`Không tìm thấy thiếu nhi "${holyName ? holyName + ' ' : ''}${fullName}" trong lớp`)
    }

    const isValid = errors.length === 0 && !!matched
    if (isValid) validCount++
    else errorCount++

    parsedRows.push({
      rowIndex: i + 1,
      studentCode: code,
      holyName,
      fullName: fullName || matched?.fullName || 'Không rõ',
      scoreOral: oral.value,
      score15m: s15m.value,
      score1Period: s1P.value,
      scoreMidterm: mid.value,
      scoreFinal: fin.value,
      scoreDaoDuc: daoDuc.value,
      comments,
      matchedStudent: matched,
      isValid,
      warnings,
      errors,
    })
  }

  return {
    rows: parsedRows,
    matchedCount,
    unmatchedCount,
    validCount,
    errorCount,
  }
}

export function parseGradeText(rawText: string, classStudents: Student[]): ParsedGradeImportResult {
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const rawRows = lines.map((line) => {
    const delimiter = line.includes('\t') ? '\t' : line.includes(',') ? ',' : ';'
    return line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''))
  })
  return processRawDataRows(rawRows, classStudents)
}

export async function parseGradeExcelFile(file: File, classStudents: Student[]): Promise<ParsedGradeImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 })
        const result = processRawDataRows(rawRows, classStudents)
        resolve(result)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = (error) => reject(error)
    reader.readAsArrayBuffer(file)
  })
}
