import type { ParishPersonInput, ParishPersonStatus } from '../types/parishProfile'

export const MAX_PARISH_PERSON_IMPORT_ROWS = 100

export interface ParsedParishPersonRow {
  lineNumber: number
  raw: string
  valid: boolean
  error?: string
  data?: ParishPersonInput
}

function splitDelimitedLine(line: string, delimiter: ',' | '\t'): string[] | null {
  const fields: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === delimiter && !quoted) {
      fields.push(field.trim())
      field = ''
    } else {
      field += character
    }
  }

  if (quoted) return null
  fields.push(field.trim())
  return fields
}

function normalizeStatus(value: string): ParishPersonStatus | null {
  if (!value.trim()) return 'ACTIVE'
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim()
    .toLowerCase()
  if (['dang phuc vu', 'duong nhiem', 'active'].includes(normalized)) return 'ACTIVE'
  if (['man nhiem', 'da man nhiem', 'cuu', 'former'].includes(normalized)) return 'FORMER'
  if (['qua doi', 'da qua doi', 'chet', 'deceased'].includes(normalized)) return 'DECEASED'
  return null
}

export function parseParishPersonImport(text: string, currentYear = new Date().getUTCFullYear()): ParsedParishPersonRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), lineNumber: index + 1 }))
    .filter(row => row.raw.length > 0)

  if (lines.length > MAX_PARISH_PERSON_IMPORT_ROWS) {
    return [{
      lineNumber: MAX_PARISH_PERSON_IMPORT_ROWS + 1,
      raw: `${lines.length} dòng`,
      valid: false,
      error: `Tối đa ${MAX_PARISH_PERSON_IMPORT_ROWS} hồ sơ mỗi lần nhập`,
    }]
  }

  return lines.map(({ raw, lineNumber }) => {
    const delimiter = raw.includes('\t') ? '\t' : ','
    const columns = splitDelimitedLine(raw, delimiter)
    if (!columns) return { lineNumber, raw, valid: false, error: 'Dấu ngoặc kép chưa đóng' }
    if (columns.length > 5) return { lineNumber, raw, valid: false, error: 'Dòng có quá 5 cột' }

    const [first = '', second, birthYearRaw = '', statusRaw = '', biographyRaw = ''] = columns
    const holyName = second === undefined ? null : first || null
    const fullName = second === undefined ? first : second
    if (!fullName) return { lineNumber, raw, valid: false, error: 'Thiếu họ và tên' }
    if (holyName && holyName.length > 100) return { lineNumber, raw, valid: false, error: 'Tên thánh vượt quá 100 ký tự' }
    if (fullName.length > 200) return { lineNumber, raw, valid: false, error: 'Họ và tên vượt quá 200 ký tự' }
    if (biographyRaw.length > 5000) return { lineNumber, raw, valid: false, error: 'Tiểu sử vượt quá 5.000 ký tự' }

    let birthYear: number | null = null
    if (birthYearRaw) {
      if (!/^\d{4}$/.test(birthYearRaw)) return { lineNumber, raw, valid: false, error: 'Năm sinh phải gồm 4 chữ số' }
      birthYear = Number(birthYearRaw)
      if (birthYear < 1900 || birthYear > currentYear) {
        return { lineNumber, raw, valid: false, error: `Năm sinh phải từ 1900 đến ${currentYear}` }
      }
    }

    const serviceStatus = normalizeStatus(statusRaw)
    if (!serviceStatus) return { lineNumber, raw, valid: false, error: 'Trạng thái không hợp lệ' }

    return {
      lineNumber,
      raw,
      valid: true,
      data: {
        linkedUserId: null,
        holyName,
        fullName,
        birthYear,
        biography: biographyRaw || null,
        serviceStatus,
        visibility: 'STAFF',
      },
    }
  })
}
