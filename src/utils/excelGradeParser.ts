
import type { Student } from '../types'
import { detectGradeColumns, parseScore, type GradeColumnsResult } from './excelImporter'

export interface MatchResult {
  student: Student
  confidence: number
  reasons: string[]
}

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
  matchConfidence?: number
  matchReasons?: string[]
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
  // Diagnostic info — NEW
  detectedColumns: { field: string; headerName: string; colIndex: number; score: number }[]
  headerRowIndex: number
  diagnosticWarnings: string[]
  // True khi cột điểm được suy luận từ dữ liệu (file thiếu header row) — buộc xác nhận trước khi import
  inferred: boolean
}

const HOLY_NAME_CORRECTIONS: Record<string, string> = {
  'anto': 'Antôn',
  'pher': 'Phêrô',
  'tere': 'Têrêsa',
  'daminh': 'Đaminh',
  'augustin': 'Augustinô',
  'gioankim': 'Gioan Kim',
  'maria': 'Maria',
  'giuse': 'Giuse',
  'anna': 'Anna',
  'gioan': 'Gioan',
  'simon': 'Simon',
  'mattheu': 'Matthêu',
  'phanxico': 'Phanxicô',
  'toma': 'Tôma',
}

export function normalizeHolyName(name: string | undefined | null): string {
  if (!name) return ''
  const trimmed = name.trim().replace(/^[^\w\u00C0-\u024F\u1EA0-\u1EFF]+/g, '')
  const normKey = trimmed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (HOLY_NAME_CORRECTIONS[normKey]) {
    return HOLY_NAME_CORRECTIONS[normKey]
  }
  return trimmed
}

function normalizeName(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  if (a.length < b.length) [a, b] = [b, a]
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 0; i < a.length; i++) {
    const curr = [i + 1]
    for (let j = 0; j < b.length; j++) {
      curr.push(a[i] === b[j] ? prev[j] : Math.min(prev[j], prev[j + 1], curr[j]) + 1)
    }
    prev = curr
  }
  return prev[b.length]
}

function computeNameSimilarity(name1: string, name2: string): { score: number; reason: string } {
  const n1 = normalizeName(name1)
  const n2 = normalizeName(name2)
  if (n1 === n2) return { score: 100, reason: 'Tên khớp chính xác sau chuẩn hóa' }

  const tokens1 = n1.split(/\s+/).filter(Boolean)
  const tokens2 = n2.split(/\s+/).filter(Boolean)

  let overlapCount = 0
  const usedT2 = new Set<number>()

  for (const t1 of tokens1) {
    const matchedIdx = tokens2.findIndex((t2, idx) => !usedT2.has(idx) && (t1 === t2 || (t1.length === 1 && t2.startsWith(t1)) || (t2.length === 1 && t1.startsWith(t2))))
    if (matchedIdx !== -1) {
      overlapCount++
      usedT2.add(matchedIdx)
    }
  }

  const maxTokens = Math.max(tokens1.length, tokens2.length)
  const overlapScore = maxTokens > 0 ? Math.round((overlapCount / maxTokens) * 100) : 0

  const levDist = levenshtein(n1, n2)
  const maxLen = Math.max(n1.length, n2.length)
  const levSimilarity = maxLen > 0 ? Math.round((1 - levDist / maxLen) * 100) : 100

  const final = Math.min(100, Math.round(overlapScore * 0.6 + levSimilarity * 0.4))

  const reason = overlapScore >= 90
    ? `Token overlap ${overlapScore}%`
    : levSimilarity >= 90
    ? `Tên tương đồng ${levSimilarity}%`
    : `Độ tương đồng tên ${final}%`

  return { score: final, reason: `✓ ${reason}` }
}

export function matchStudentWithConfidence(
  code: string | undefined,
  holyName: string | undefined,
  fullName: string,
  classStudents: Student[],
  studentMappings?: Map<string, string>,
): MatchResult | null {
  const candidates: MatchResult[] = []

  // Exact Mã số fallback: chỉ dùng khi matching theo tên KHÔNG ra kết quả
  // (file thiếu cột tên, hoặc tên trong file sai chính tả so với DB).
  const cleanCode = code?.trim().toLowerCase()
  let codeMatchedStudent: Student | undefined
  if (cleanCode) {
    for (const s of classStudents) {
      if (s.code && s.code.trim().toLowerCase() === cleanCode) {
        codeMatchedStudent = s
        break
      }
    }
  }

  // 0. Check mapping memory
  if (studentMappings && studentMappings.size > 0) {
    const alias = normalizeName(`${holyName || ''} ${fullName}`)
    const mappedId = studentMappings.get(alias)
    if (mappedId) {
      const student = classStudents.find(s => s.id === mappedId)
      if (student) {
        return { student, confidence: 100, reasons: ['✓ Đã học từ mapping trước đó'] }
      }
    }
    if (fullName) {
      const nameAlias = normalizeName(fullName)
      const mappedByName = studentMappings.get(nameAlias)
      if (mappedByName) {
        const student = classStudents.find(s => s.id === mappedByName)
        if (student) {
          return { student, confidence: 100, reasons: ['✓ Đã học từ mapping trước đó (theo tên)'] }
        }
      }
    }
  }

  // Name matching is primary: holyName + fullName with >= 90% precision.
  // Exact Mã số matching is used ONLY as a fallback when the name pass finds
  // no candidate (e.g. file has scores + Mã số but no name columns).
  // Date of Birth matching remains disabled.

  const cleanHolyName = normalizeHolyName(holyName)
  const normFull = normalizeName(fullName)
  const normHoly = cleanHolyName ? normalizeName(cleanHolyName) : ''

  for (const student of classStudents) {
    const sCleanHoly = normalizeHolyName(student.holyName)
    const sNormFull = normalizeName(student.fullName)
    const sNormHoly = sCleanHoly ? normalizeName(sCleanHoly) : ''
    const reasons: string[] = []
    let confidence = 0

    if (normHoly && sNormHoly === normHoly && sNormFull === normFull) {
      confidence = 100
      reasons.push('✓ Tên thánh + Họ tên khớp chính xác')
      candidates.push({ student, confidence, reasons })
      continue
    }

    if (sNormFull === normFull && (!normHoly || sNormHoly === normHoly)) {
      confidence = 100
      reasons.push('✓ Họ tên khớp chính xác')
      candidates.push({ student, confidence, reasons })
      continue
    }

    const combinedNorm = normalizeName(`${cleanHolyName || ''} ${fullName}`)
    const sCombinedNorm = normalizeName(`${sCleanHoly || ''} ${student.fullName}`)
    if (sCombinedNorm === combinedNorm) {
      confidence = 100
      reasons.push('✓ Tên đầy đủ khớp chính xác')
      candidates.push({ student, confidence, reasons })
      continue
    }

    if (sNormFull && normFull) {
      const fullSearchInput = normHoly ? `${cleanHolyName} ${fullName}` : fullName
      const fullTarget = sNormHoly ? `${sCleanHoly} ${student.fullName}` : student.fullName
      const { score: simScore, reason: simReason } = computeNameSimilarity(fullSearchInput, fullTarget)

      if (simScore >= 90) {
        confidence = simScore
        reasons.push(simReason)
        candidates.push({ student, confidence, reasons })
      }
    }
  }

  if (candidates.length === 0) {
    // Fallback: exact Mã số match khi tên không tìm ra ứng viên nào.
    if (codeMatchedStudent) {
      return { student: codeMatchedStudent, confidence: 100, reasons: ['✓ Khớp Mã số chính xác'] }
    }
    return null
  }

  candidates.sort((a, b) => b.confidence - a.confidence)
  return candidates[0]
}

export function matchStudentInRoster(
  code: string | undefined,
  holyName: string | undefined,
  fullName: string,
  classStudents: Student[]
): Student | undefined {
  return matchStudentWithConfidence(code, holyName, fullName, classStudents)?.student
}

/**
 * Phân tích lý do cụ thể khi không tìm thấy học sinh — thay cho thông báo
 * chung chung "Không tìm thấy học sinh". Trả về chuỗi giải thích rõ nguyên nhân
 * để user biết cần sửa gì (lớp rỗng, thiếu cột tên, tên lệch, mã không dùng...).
 */
export function explainMatchFailure(
  code: string | undefined,
  holyName: string | undefined,
  fullName: string,
  classStudents: Student[],
): string {
  // 1. Lớp hiện tại không có học sinh nào
  if (classStudents.length === 0) {
    return 'Lớp hiện tại chưa có học sinh nào — vui lòng kiểm tra danh sách lớp trước khi import điểm'
  }

  // 2. Không có tên để match (thiếu cột tên hoặc cột tên không detect được)
  const cleanHoly = normalizeHolyName(holyName)
  const normFull = normalizeName(fullName)
  if (!normFull && !cleanHoly) {
    return 'Không tìm thấy cột tên học sinh (Họ và Tên / Tên Thánh) — kiểm tra header file có đúng tên cột không'
  }

  // 3. Có tên nhưng không match — tìm học sinh gần nhất để gợi ý
  let bestSim = 0
  let bestStudent: Student | null = null
  for (const student of classStudents) {
    const sCleanHoly = normalizeHolyName(student.holyName)
    const searchInput = cleanHoly ? `${cleanHoly} ${fullName}` : fullName
    const target = sCleanHoly ? `${sCleanHoly} ${student.fullName}` : student.fullName
    const { score } = computeNameSimilarity(searchInput, target)
    if (score > bestSim) {
      bestSim = score
      bestStudent = student
    }
  }

  if (bestStudent && bestSim < 90) {
    const studentName = `${bestStudent.holyName || ''} ${bestStudent.fullName}`.trim()
    return `Không tìm thấy học sinh "${fullName}" — học sinh gần nhất là "${studentName}" (độ tương đồng ${bestSim}%, cần ≥ 90%). Kiểm tra chính tả, tên đệm, hoặc tên thánh trong file`
  }

  // 4. Có Mã TN nhưng không khớp học sinh nào trong lớp (code fallback đã chạy trước đó)
  if (code) {
    return `Không tìm thấy học sinh "${fullName}" — Mã TN "${code}" không khớp học sinh nào trong lớp. Kiểm tra lại Mã TN hoặc tên trong file`
  }

  // 5. Trường hợp còn lại
  return `Không tìm thấy học sinh "${fullName}" trong lớp hiện tại — kiểm tra học sinh đã được thêm vào lớp chưa`
}

function processRawDataRows(rawRows: any[][], classStudents: Student[], studentMappings?: Map<string, string>): ParsedGradeImportResult {
  const emptyResult: ParsedGradeImportResult = {
    rows: [], matchedCount: 0, unmatchedCount: 0, validCount: 0, errorCount: 0,
    detectedColumns: [], headerRowIndex: -1, diagnosticWarnings: [], inferred: false,
  }
  if (rawRows.length === 0) return emptyResult

  // Smart header detection: scan first 10 rows, score each with detectGradeColumns
  let headerIndex = -1
  let bestDetection: GradeColumnsResult | null = null
  let bestScore = 0

  const NAME_FIELDS = new Set(['studentName', 'holyName', 'lastName', 'firstName', 'studentCode'])
  const SCORE_FIELDS = new Set(['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc'])

  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const rowHeaders = rawRows[i].map((c: any) => String(c || '').trim())
    const detection = detectGradeColumns(rowHeaders)

    const nameFieldCount = detection.detections.filter(d => NAME_FIELDS.has(d.field)).length
    const scoreFieldCount = detection.detections.filter(d => SCORE_FIELDS.has(d.field)).length

    // Rule: ≥ 1 name field + ≥ 1 score field, OR ≥ 3 score fields, OR ≥ 2 name fields
    const isValidHeader = (nameFieldCount >= 1 && scoreFieldCount >= 1) || scoreFieldCount >= 3 || nameFieldCount >= 2
    if (!isValidHeader) continue

    const totalScore = detection.detections.reduce((sum, d) => sum + d.score, 0)
    if (totalScore > bestScore) {
      bestScore = totalScore
      bestDetection = detection
      headerIndex = i
    }
  }

  // Build colMap and diagnostic warnings
  let colMap: Record<string, number> = {}
  const diagnosticWarnings: string[] = []
  const detectedColumns: ParsedGradeImportResult['detectedColumns'] = []
  let inferred = false

  if (bestDetection) {
    colMap = bestDetection.colMap
    for (const d of bestDetection.detections) {
      detectedColumns.push({ field: d.field, headerName: d.headerName, colIndex: d.colIndex, score: d.score })
    }
    for (const ic of bestDetection.ignoredColumns) {
      diagnosticWarnings.push(`Cột "${ic.headerName}" bị bỏ qua (cột tính toán/metadata)`)
    }
    for (const uc of bestDetection.unmappedColumns) {
      diagnosticWarnings.push(`Cột "${uc.headerName}" không nhận diện được — bỏ qua`)
    }
    // Check missing common score columns
    const detectedFields = new Set(bestDetection.detections.map(d => d.field))
    const commonScores = ['scoreOral', 'score15m', 'score1Period', 'scoreFinal']
    for (const sf of commonScores) {
      if (!detectedFields.has(sf)) {
        const labels: Record<string, string> = { scoreOral: 'Miệng', score15m: '15 Phút', score1Period: '1 Tiết', scoreFinal: 'Cuối Kỳ' }
        diagnosticWarnings.push(`Không tìm thấy cột "${labels[sf] || sf}"`)
      }
    }
    // Confidence check: if max detection score < 80, add warning
    const nameCount = detectedColumns.filter(d => NAME_FIELDS.has(d.field)).length
    if (nameCount === 0) {
      diagnosticWarnings.push('Không tìm thấy cột tên — matching sẽ dùng Mã số (nếu có)')
    }
  }

  // Improved positional fallback when no header detected
  if (headerIndex === -1 && rawRows.length > 0) {
    // Data-based inference: scan first data rows to find columns with numbers 0-10
    // This is a SOFT fallback — requires preview + confirmation from user
    const sampleSize = Math.min(5, rawRows.length)
    const colScoreCounts: number[] = new Array(rawRows[0]?.length || 0).fill(0)
    const colTextCounts: number[] = new Array(rawRows[0]?.length || 0).fill(0)

    for (let i = 0; i < sampleSize; i++) {
      for (let j = 0; j < (rawRows[i]?.length || 0); j++) {
        const val = rawRows[i][j]
        if (val === null || val === undefined || String(val).trim() === '') continue
        const num = Number(String(val).trim().replace(/,/g, '.'))
        if (!isNaN(num) && num >= 0 && num <= 10) {
          colScoreCounts[j]++
        } else if (typeof val === 'string' && val.trim().length > 0) {
          colTextCounts[j]++
        }
      }
    }

    // Only use data-based inference if we find clear score columns (>= 60% numeric 0-10)
    const scoreThreshold = Math.ceil(sampleSize * 0.6)

    // STT-like columns (sequential integers 1,2,3... hoặc 0,1,2...) KHÔNG được
    // suy luận thành cột điểm — trước đây cột STT (1..N) bị map vào scoreOral
    // và làm lệch mọi cột điểm phía sau (data-corruption).
    const isSequentialColumn = (idx: number): boolean => {
      let prev: number | null = null
      let count = 0
      for (let i = 0; i < sampleSize; i++) {
        const val = rawRows[i]?.[idx]
        if (val === null || val === undefined || String(val).trim() === '') continue
        const str = String(val).trim()
        if (!/^\d+$/.test(str)) return false
        const num = Number(str)
        if (prev === null) {
          if (num !== 0 && num !== 1) return false
          prev = num
        } else {
          if (num !== prev + 1) return false
          prev = num
        }
        count++
      }
      return count >= 2
    }

    const inferredScoreCols = colScoreCounts
      .map((count, idx) => ({ idx, count }))
      .filter(c => c.count >= scoreThreshold && !isSequentialColumn(c.idx))
      .map(c => c.idx)

    if (inferredScoreCols.length >= 2) {
      // Inference triggered — flag để UI buộc người dùng xác nhận trước khi import
      inferred = true

      // Map inferred score columns to score fields in order
      const scoreFieldOrder = ['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc']
      for (let k = 0; k < Math.min(inferredScoreCols.length, scoreFieldOrder.length); k++) {
        colMap[scoreFieldOrder[k]] = inferredScoreCols[k]
        detectedColumns.push({
          field: scoreFieldOrder[k],
          headerName: `Cột ${inferredScoreCols[k] + 1} (suy luận)`,
          colIndex: inferredScoreCols[k],
          score: 50, // Low confidence — data-based inference
        })
      }

      // Find name column: first text-heavy column
      const textCols = colTextCounts
        .map((count, idx) => ({ idx, count }))
        .filter(c => c.count >= scoreThreshold && !inferredScoreCols.includes(c.idx))
        .sort((a, b) => b.count - a.count)

      if (textCols.length > 0) {
        // If there are 2+ text columns, first is likely holyName, second is fullName
        if (textCols.length >= 2) {
          colMap.holyName = textCols[0].idx
          colMap.fullName = textCols[1].idx
        } else {
          colMap.fullName = textCols[0].idx
        }
      }

      diagnosticWarnings.push('⚠ Không tìm thấy dòng header — cột điểm được suy luận từ dữ liệu. Vui lòng kiểm tra kỹ trước khi import.')
    }
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
    let matchName = ''
    let scoreOralRaw: any
    let score15mRaw: any
    let score1PeriodRaw: any
    let scoreMidtermRaw: any
    let scoreFinalRaw: any
    let scoreDaoDucRaw: any
    let comments = ''

    if (Object.keys(colMap).length > 0) {
      const codeIdx = colMap.studentCode ?? colMap.code
      if (codeIdx !== undefined) code = String(row[codeIdx] || '').trim()
      if (colMap.holyName !== undefined) holyName = String(row[colMap.holyName] || '').trim()

      const nameIdx = colMap.studentName ?? colMap.fullName
      if (nameIdx !== undefined) fullName = String(row[nameIdx] || '').trim()

      const lastNameStr = colMap.lastName !== undefined ? String(row[colMap.lastName] || '').trim() : ''
      const firstNameStr = colMap.firstName !== undefined ? String(row[colMap.firstName] || '').trim() : ''

      if (lastNameStr || firstNameStr) {
        const combined = `${lastNameStr} ${firstNameStr}`.trim()
        if (!fullName || (lastNameStr && !fullName.includes(lastNameStr))) {
          fullName = combined
        }
      }

      holyName = normalizeHolyName(holyName)

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

      if (row.length >= offset + 4) {
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

    // Save original name for matching before combining for display
    matchName = fullName
    if (holyName && fullName) {
      fullName = `${holyName} ${fullName}`.trim()
    } else if (holyName && !fullName) {
      fullName = holyName
      matchName = holyName
    }

    if (!fullName && !code && !holyName) continue

    const errors: string[] = []
    const warnings: string[] = []

    const oral = parseScore(scoreOralRaw)
    if (oral.error) errors.push(`Điểm Miệng: ${oral.error}`)
    if (oral.warning) warnings.push(`Miệng: ${oral.warning}`)

    const s15m = parseScore(score15mRaw)
    if (s15m.error) errors.push(`Điểm 15P: ${s15m.error}`)
    if (s15m.warning) warnings.push(`15P: ${s15m.warning}`)

    const s1P = parseScore(score1PeriodRaw)
    if (s1P.error) errors.push(`Điểm 1 Tiết: ${s1P.error}`)
    if (s1P.warning) warnings.push(`1 Tiết: ${s1P.warning}`)

    const mid = parseScore(scoreMidtermRaw)
    if (mid.error) errors.push(`Điểm Giữa Kỳ: ${mid.error}`)
    if (mid.warning) warnings.push(`Giữa Kỳ: ${mid.warning}`)

    const fin = parseScore(scoreFinalRaw)
    if (fin.error) errors.push(`Điểm Cuối Kỳ: ${fin.error}`)
    if (fin.warning) warnings.push(`Cuối Kỳ: ${fin.warning}`)

    const daoDuc = parseScore(scoreDaoDucRaw)
    if (daoDuc.error) errors.push(`Điểm Đạo Đức: ${daoDuc.error}`)
    if (daoDuc.warning) warnings.push(`Đạo Đức: ${daoDuc.warning}`)

    const matchResult = matchStudentWithConfidence(code, holyName, matchName, classStudents, studentMappings)
    const matched = matchResult?.student
    if (matched) {
      matchedCount++
      if (matchResult && matchResult.confidence < 85) {
        warnings.push(`Khớp với độ tin cậy ${matchResult.confidence}%: ${matchResult.reasons.join(', ')}`)
      }
      if (matchResult && matchResult.reasons[0] === '✓ Khớp Mã số chính xác') {
        warnings.push('Khớp theo Mã số (không khớp theo tên)')
      }
    } else {
      unmatchedCount++
      warnings.push(explainMatchFailure(code, holyName, matchName, classStudents))
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
      matchConfidence: matchResult?.confidence,
      matchReasons: matchResult?.reasons,
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
    detectedColumns,
    headerRowIndex: headerIndex,
    diagnosticWarnings,
    inferred,
  }
}

/**
 * ADR-018 (import/export audit): Parse một dòng CSV/TSV tôn trọng quoted fields.
 * Trước đây dùng line.split(delimiter) — cell có chứa delimiter trong cặp ngoặc
 * kép (VD: comment "Chăm ngoan, lễ phép" trong CSV) bị tách thành 2 cột → sai
 * vị trí dữ liệu. Parser này duyệt ký tự, chỉ split khi ngoài cặp quote.
 * Hỗ trợ escape `""` → `"` và quote đơn.
 */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === inQuote) {
        // Xử lý escape "" → " (chuẩn CSV)
        if (line[i + 1] === inQuote) {
          current += inQuote
          i++
        } else {
          inQuote = null
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"' || ch === "'") {
        inQuote = ch
      } else if (ch === delimiter) {
        cells.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  cells.push(current.trim())
  return cells
}

export function parseGradeText(rawText: string, classStudents: Student[], studentMappings?: Map<string, string>): ParsedGradeImportResult {
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return { rows: [], matchedCount: 0, unmatchedCount: 0, validCount: 0, errorCount: 0, detectedColumns: [], headerRowIndex: -1, diagnosticWarnings: [], inferred: false }
  }

  const countChar = (ch: string) => (rawText.split(ch).length - 1)
  const tabCount = countChar('\t')
  const semiCount = countChar(';')
  const commaCount = countChar(',')

  let globalDelimiter = '\t'
  if (tabCount > 0 && tabCount >= semiCount) {
    globalDelimiter = '\t'
  } else if (semiCount > 0 && semiCount >= commaCount) {
    globalDelimiter = ';'
  } else if (commaCount > 0) {
    globalDelimiter = ','
  }

  const rawRows = lines.map((line) => {
    const delimiter = line.includes('\t') ? '\t' : (line.includes(';') && globalDelimiter === ';') ? ';' : globalDelimiter
    return splitDelimitedLine(line, delimiter).map((c) => c.replace(/^["']|["']$/g, ''))
  })
  return processRawDataRows(rawRows, classStudents, studentMappings)
}

