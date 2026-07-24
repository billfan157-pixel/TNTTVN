import type { Student, BranchType } from '../types'

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

const VALID_BRANCHES: BranchType[] = ['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi']

/**
 * Parses raw text from a CSV file or Excel clipboard (tab-separated)
 */
export function parseRosterText(rawText: string, defaultClassId: string = 'AU1'): ParsedStudentRow[] {
  const lines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return []

  const results: ParsedStudentRow[] = []

  // Check if first line is a header
  let startIdx = 0
  const firstLine = lines[0].toLowerCase()
  if (firstLine.includes('tên thánh') || firstLine.includes('họ') || firstLine.includes('holy') || firstLine.includes('stt')) {
    startIdx = 1
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    // Support tab, comma, or semicolon delimited values
    const delimiter = line.includes('\t') ? '\t' : line.includes(',') ? ',' : ';'
    const columns = line.split(delimiter).map((col) => col.trim().replace(/^["']|["']$/g, ''))

    if (columns.length < 2) continue

    // Expecting columns: [STT], HolyName, FullName, Gender, DateOfBirth, ParentName, ParentPhone, Address, Branch
    let offset = 0
    // If first column is numeric STT, skip offset
    if (/^\d+$/.test(columns[0])) offset = 1

    const holyName = columns[offset] || ''
    const fullName = columns[offset + 1] || ''
    const genderRaw = columns[offset + 2] || 'Nam'
    const gender = genderRaw.toLowerCase().includes('nữ') || genderRaw.toLowerCase() === 'f' ? 'Nữ' : 'Nam'
    const dateOfBirth = columns[offset + 3] || '2015-01-01'
    const parentName = columns[offset + 4] || 'Chưa cập nhật'
    const parentPhone = columns[offset + 5] || '0900000000'
    const address = columns[offset + 6] || 'Giáo Xứ Thánh Gia'
    const branchRaw = columns[offset + 7] || 'AuNhi'

    let branch: BranchType = 'AuNhi'
    if (VALID_BRANCHES.includes(branchRaw as BranchType)) {
      branch = branchRaw as BranchType
    }

    const errors: string[] = []
    if (!holyName) errors.push('Thiếu Tên Thánh')
    if (!fullName) errors.push('Thiếu Họ và Tên')
    if (!parentPhone || parentPhone.length < 8) errors.push('SĐT không hợp lệ')

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
