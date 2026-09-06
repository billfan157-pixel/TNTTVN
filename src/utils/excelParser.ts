import type { Student, BranchType } from '../types'

export interface ImportRow {
  rowIndex: number
  holyName: string
  fullName: string
  gender: string
  dateOfBirth: string
  parentName: string
  parentPhone: string
  address: string
  branch: string
  className: string
  service?: string
}

const COLUMN_KEYWORDS: Record<string, string[]> = {
  holyName: ['tên thánh', 'ten thanh', 'thánh', 'thanh', 'holy name', 'holy'],
  fullName: ['họ và tên', 'ho va ten', 'họ tên', 'ho ten', 'full name', 'fullname', 'student name', 'name'],
  lastName: ['họ', 'ho', 'last name', 'surname', 'family name'],
  firstName: ['tên', 'ten', 'first name', 'given name'],
  gender: ['giới tính', 'gioi tinh', 'phái', 'phai', 'gender', 'sex'],
  dateOfBirth: ['ngày sinh', 'ngay sinh', 'năm sinh', 'nam sinh', 'date of birth', 'dob', 'birthday'],
  parentPhone: ['số điện thoại', 'so dien thoai', 'điện thoại', 'dien thoai', 'sđt', 'phone', 'mobile', 'parent phone', 'số đt', 'so dt', 'tel', 'telephone', 'phone number'],
  parentName: ['phụ huynh', 'phu huynh', 'cha mẹ', 'cha me', 'bố mẹ', 'bo me', 'parent name', 'parent'],
  address: ['địa chỉ', 'dia chi', 'address', 'địa chỉ liên lạc', 'dia chi lien lac'],
  branch: ['phân ngành', 'phan nganh', 'ngành', 'nganh', 'chi nhánh', 'chi nhanh', 'branch'],
  className: ['lớp', 'lop', 'class', 'tên lớp', 'ten lop', 'class name', 'lớp học', 'lop hoc'],
  service: ['phục vụ', 'phuc vu', 'lễ phục vụ', 'le phuc vu', 'service', 'altar server', 'phụ vụ'],
}

function normalizeKeyword(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s-]+/g, ' ')
}

type SupportedDelimiter = '\t' | ',' | ';'

function detectDelimiter(text: string): SupportedDelimiter {
  const counts: Record<SupportedDelimiter, number> = { '\t': 0, ',': 0, ';': 0 }
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1
      else quoted = !quoted
      continue
    }
    if (!quoted && (character === '\r' || character === '\n')) break
    if (!quoted && (character === '\t' || character === ',' || character === ';')) counts[character] += 1
  }
  if (counts['\t'] >= counts[','] && counts['\t'] >= counts[';'] && counts['\t'] > 0) return '\t'
  if (counts[','] >= counts[';'] && counts[','] > 0) return ','
  return ';'
}

/** Parse CSV/TSV/semicolon text without losing quoted delimiters or embedded newlines. */
export function parseDelimitedRows(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  if (!source.trim()) return []
  const delimiter = detectDelimiter(source)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const finishField = () => {
    row.push(field.trim())
    field = ''
  }
  const finishRow = () => {
    finishField()
    if (row.some(cell => cell.length > 0)) rows.push(row)
    row = []
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (!quoted && character === delimiter) {
      finishField()
    } else if (!quoted && (character === '\r' || character === '\n')) {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      finishRow()
    } else {
      field += character
    }
  }

  if (quoted) throw new Error('Dấu ngoặc kép chưa đóng trong dữ liệu import')
  if (field.length > 0 || row.length > 0) finishRow()
  return rows
}

export function scoreColumn(header: string, field: string): number {
  const normalized = normalizeKeyword(header)
  const keywords = COLUMN_KEYWORDS[field]
  for (const kw of keywords) {
    const normKw = normalizeKeyword(kw)
    if (normalized === normKw) return 100
    if (normalized.includes(normKw)) {
      // Longer keyword match = higher score
      return 80 + Math.round((normKw.length / normalized.length) * 15)
    }
  }
  return 0
}

export interface ColumnDetectionResult {
  colIdx: number
  field: string
  score: number
  reason: string
}

export function detectColumns(headers: string[]): Record<string, number> {
  const colMap: Record<string, number> = {}
  for (const item of detectColumnsWithConfidence(headers)) {
    colMap[item.field] = item.colIdx
  }
  return colMap
}

export function detectColumnsWithConfidence(headers: string[]): ColumnDetectionResult[] {
  const scored: { colIdx: number; field: string; score: number; reason: string }[] = []
  for (let i = 0; i < headers.length; i++) {
    for (const field of Object.keys(COLUMN_KEYWORDS)) {
      const { score, reason } = scoreColumnWithReason(headers[i], field)
      if (score > 0) scored.push({ colIdx: i, field, score, reason })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  const result: ColumnDetectionResult[] = []
  const usedCols = new Set<number>()
  const usedFields = new Set<string>()
  for (const item of scored) {
    if (!usedFields.has(item.field) && !usedCols.has(item.colIdx)) {
      result.push(item)
      usedCols.add(item.colIdx)
      usedFields.add(item.field)
    }
  }
  return result
}

function scoreColumnWithReason(header: string, field: string): { score: number; reason: string } {
  const normalized = normalizeKeyword(header)
  const keywords = COLUMN_KEYWORDS[field]
  for (const kw of keywords) {
    const normKw = normalizeKeyword(kw)
    if (normalized === normKw) return { score: 100, reason: 'Exact keyword match' }
    if (normalized.includes(normKw)) {
      const pct = Math.round((normKw.length / normalized.length) * 15)
      return { score: 80 + pct, reason: `Partial keyword "${normKw}"` }
    }
  }
  return { score: 0, reason: '' }
}

export function findHeaderRow(rawRows: string[][]): { headerIndex: number; colMap: Record<string, number> } {
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const rowStr = rawRows[i].map(c => (c || '').toLowerCase()).join(' ')
    const normRow = normalizeKeyword(rowStr)
    if (rowStr.includes('tên') || rowStr.includes('thánh') || rowStr.includes('họ') ||
        rowStr.includes('lớp') || rowStr.includes('ngày sinh') || rowStr.includes('phụ huynh') ||
        normRow.includes('ten') || normRow.includes('ho') || normRow.includes('lop') ||
        normRow.includes('ngay sinh') || normRow.includes('phu huynh')) {
      const colMap = detectColumns(rawRows[i])
      if (Object.keys(colMap).length >= 3) return { headerIndex: i, colMap }
    }
  }
  return { headerIndex: -1, colMap: {} }
}

function inferBranchFromClass(className: string): string {
  const lower = className.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (lower.includes('chien') || lower.includes('chiên')) return 'ChienCon'
  if (lower.includes('au') || lower.includes('ấu')) return 'AuNhi'
  if (lower.includes('thieu') || lower.includes('thiếu')) return 'ThieuNhi'
  if (lower.includes('nghia') || lower.includes('nghĩa')) return 'NghiaSi'
  if (lower.includes('hiep') || lower.includes('hiệp')) return 'HiepSi'
  return ''
}

const FEMALE_GENDER_KEYWORDS = [
  'thị', 'ngọc', 'mai', 'ánh', 'loan', 'hương', 'lan', 'hoa', 'thủy', 'ly', 'trang', 'vy', 'bích', 'diễm', 'khánh', 'ngân', 'phượng', 'trâm', 'tuyết', 'yến', 'hạnh', 'thảo', 'quỳnh', 'như', 'thu', 'giang', 'nguyệt', 'băng', 'châu', 'thúy', 'kiều', 'xinh',
]

function inferGenderFromName(fullName: string): 'Nam' | 'Nữ' | null {
  const normalized = fullName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const kw of FEMALE_GENDER_KEYWORDS) {
    if (normalized.includes(kw)) return 'Nữ'
  }
  return null
}

export function parseToImportRows(rawRows: string[][], colMap: Record<string, number>, startIndex: number = 0): ImportRow[] {
  const validBranch = (v: string): string => {
    const normalized = v.trim().toLowerCase()
    if (normalized === 'chiên con' || normalized === 'chiencon' || normalized === 'cc') return 'ChienCon'
    if (normalized === 'ấu nhi' || normalized === 'aunhi' || normalized === 'an') return 'AuNhi'
    if (normalized === 'thiếu nhi' || normalized === 'thieunhi' || normalized === 'tn') return 'ThieuNhi'
    if (normalized === 'nghĩa sĩ' || normalized === 'nghiasi' || normalized === 'ns') return 'NghiaSi'
    if (normalized === 'hiệp sĩ' || normalized === 'hiepsi' || normalized === 'hs') return 'HiepSi'
    return v.trim()
  }

  const getCol = (row: string[], field: string): string => {
    const idx = colMap[field]
    if (idx === undefined) return ''
    return (row[idx] || '').trim().replace(/^["']|["']$/g, '')
  }

  const results: ImportRow[] = []
  for (let i = startIndex; i < rawRows.length; i++) {
    const row = rawRows[i]
    if (!row || row.every(c => !c || String(c).trim() === '')) continue

    let holyName = getCol(row, 'holyName')
    let fullName = getCol(row, 'fullName')
    const lastName = getCol(row, 'lastName')
    const firstName = getCol(row, 'firstName')
    const genderRaw = getCol(row, 'gender')
    const dateOfBirth = getCol(row, 'dateOfBirth')
    const parentName = getCol(row, 'parentName')
    const parentPhone = getCol(row, 'parentPhone')
    const address = getCol(row, 'address')
    const branchRaw = getCol(row, 'branch')
    const className = getCol(row, 'className')
    const service = getCol(row, 'service')

    if (!fullName && lastName && firstName) {
      fullName = (lastName + ' ' + firstName).trim()
    } else if (!fullName && lastName) {
      fullName = lastName
    }

    if (!holyName && !fullName) continue

    const normalizedGender = genderRaw.trim().toLowerCase()
    const gender = normalizedGender === 'nữ' || normalizedGender === 'nu' || normalizedGender === 'f' || normalizedGender === 'female'
      ? 'Nữ'
      : normalizedGender === 'nam' || normalizedGender === 'm' || normalizedGender === 'male'
        ? 'Nam'
        : genderRaw.trim()

    if (holyName && fullName && fullName.startsWith(holyName)) {
      fullName = fullName.slice(holyName.length).trim()
    }

    results.push({
      rowIndex: i + 1,
      holyName: holyName || '',
      fullName: fullName || '',
      gender,
      dateOfBirth: dateOfBirth || '',
      parentName: parentName || '',
      parentPhone: parentPhone || '',
      address: address || '',
      branch: branchRaw ? validBranch(branchRaw) : inferBranchFromClass(className),
      className: className || '',
      service: service || '',
    })
  }
  return results
}

export function rowsToRawStrings(rawRows: any[][]): string[][] {
  return rawRows.map(row =>
    row.map(cell => {
      if (cell === null || cell === undefined) return ''
      return String(cell).trim()
    })
  )
}

export function normalizeDate(value: string): string {
  const cleaned = value.trim()
  if (!cleaned || cleaned === 'Chưa cập nhật') return cleaned
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned
  // Excel serial date (e.g., 44927) — happens when Excel stores date as number and sheet_to_json with header:1 + String conversion
  if (/^\d{5,6}$/.test(cleaned)) {
    const serial = Number(cleaned)
    if (serial >= 20000 && serial <= 60000) {
      const epoch = Date.UTC(1899, 11, 30)
      const d = new Date(epoch + serial * 86400000)
      const yyyy = d.getUTCFullYear()
      if (yyyy >= 1990 && yyyy <= 2060) {
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(d.getUTCDate()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}`
      }
    }
  }
  const parts = cleaned.split(/[/\-.]/)
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    return `${parts[2].padStart(4, '20')}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return cleaned
}

export function normalizePhone(value: string): string {
  let s = value.trim().replace(/[\s\-.]/g, '')
  if (!s || s === 'Chưa cập nhật') return s
  if (/^\d{9}$/.test(s) && /^[35789]/.test(s)) s = `0${s}`
  if (s.includes('E') || s.includes('e')) {
    const n = Number(s)
    if (!Number.isNaN(n)) s = String(Math.round(n))
    if (/^\d{9}$/.test(s) && /^[35789]/.test(s)) s = `0${s}`
  }
  return s
}

export const VALID_BRANCHES: BranchType[] = ['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi']

export interface ParsedStudentRow {
  rowIndex: number
  holyName: string
  fullName: string
  gender: 'Nam' | 'Nữ'
  dateOfBirth: string
  parentName: string
  parentPhone: string
  address: string
  branch: BranchType
  classId: string
  isValid: boolean
  errors: string[]
}

/**
 * Parses raw text from a CSV file or Excel clipboard (tab-separated)
 */
export function parseRosterText(rawText: string, defaultClassId: string = 'AU1'): ParsedStudentRow[] {
  const rows = parseDelimitedRows(rawText)
  if (rows.length === 0) return []

  const results: ParsedStudentRow[] = []

  let startIdx = 0
  const firstLine = rows[0].join(' ').toLowerCase()
  if (firstLine.includes('tên thánh') || firstLine.includes('họ') || firstLine.includes('holy') || firstLine.includes('stt')) {
    startIdx = 1
  }

  for (let i = startIdx; i < rows.length; i++) {
    const columns = rows[i]
    if (columns.length < 2) continue

    let offset = 0
    if (/^\d+$/.test(columns[0])) offset = 1

    const holyName = columns[offset] || ''
    const fullName = columns[offset + 1] || ''
    const genderRaw = columns[offset + 2] || ''
    const gender = genderRaw.toLowerCase().includes('nữ') || genderRaw.toLowerCase() === 'f' ? 'Nữ' : inferGenderFromName(fullName) || 'Nam'
    const dateOfBirth = columns[offset + 3] || 'Chưa cập nhật'
    const parentName = columns[offset + 4] || 'Chưa cập nhật'
    const parentPhone = columns[offset + 5] || 'Chưa cập nhật'
    const address = columns[offset + 6] || 'Chưa cập nhật'
    const branchCandidate = columns[offset + 7] || 'AuNhi'

    // Safe branch type mapping without unsafe cast
    const branch: BranchType = VALID_BRANCHES.includes(branchCandidate as BranchType)
      ? (branchCandidate as BranchType)
      : 'AuNhi'

    const errors: string[] = []
    // holyName optional 2026-08-28: thiếu vẫn cho import bình thường (để trống)
    if (holyName && holyName.length > 100) errors.push('Tên Thánh quá dài (tối đa 100 ký tự)')
    if (!fullName) errors.push('Thiếu Họ và Tên')

    results.push({
      rowIndex: i + 1,
      holyName,
      fullName,
      gender,
      dateOfBirth,
      parentName,
      parentPhone,
      address,
      branch,
      classId: defaultClassId,
      isValid: errors.length === 0,
      errors,
    })
  }

  return results
}

/**
 * Converts parsed student rows into full Student models ready for store insertion
 */
export function convertToStudentModels(rows: ParsedStudentRow[]): Student[] {
  return rows
    .filter((r) => r.isValid)
    .map((r, idx) => ({
      id: `ST-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      code: `TN-${String(Math.floor(1000 + Math.random() * 9000))}`,
      holyName: r.holyName,
      fullName: r.fullName,
      gender: r.gender,
      dateOfBirth: r.dateOfBirth,
      parentName: r.parentName,
      parentPhone: r.parentPhone,
      address: r.address,
      branch: r.branch,
      classId: r.classId,
      status: 'Đang học',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))
}
