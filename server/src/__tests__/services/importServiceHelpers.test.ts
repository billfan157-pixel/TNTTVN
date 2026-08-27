import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'

// Copy of the pure helper functions from importService.ts for testing
function levenshtein(a: string, b: string): number {
  const an = a.length
  const bn = b.length
  const matrix: number[] = []
  for (let i = 0; i <= bn; i++) matrix[i] = i
  for (let i = 1; i <= an; i++) {
    let prev = i
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const val = Math.min(matrix[j - 1] + cost, matrix[j] + 1, prev + 1)
      matrix[j - 1] = prev
      prev = val
    }
    matrix[bn] = prev
  }
  return matrix[bn]
}

function normalizeName(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripForMatch(str: string): string {
  return normalizeName(str).replace(/\s/g, '')
}

function isPlaceholder(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim() === 'Chưa cập nhật'
}

function detectService(raw: string | undefined | null, branch: string): 'yes' | 'no' {
  if (raw) {
    const v = raw.trim().toLowerCase()
    if (['x', 'có', 'co', 'yes', '1', 'true', 'phục vụ', 'phuc vu', 'le phuc vu', 'lễ phục vụ'].includes(v)) return 'yes'
    if (['không', 'khong', 'no', '0', 'false'].includes(v)) return 'no'
    return 'no'
  }
  if (['NghiaSi', 'HiepSi'].includes(branch)) return 'yes'
  return 'no'
}

const VALID_BRANCHES = ['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi'] as const
const PHONE_RE = /^(\+84|0)\d{9,10}$/

function validateRow(row: { holyName?: string; fullName?: string; gender?: string; dateOfBirth?: string; parentPhone?: string; branch?: string; className?: string }): string[] {
  const errors: string[] = []
  // holyName optional 2026-08-28: thiếu tên thánh vẫn cho import bình thường
  if (row.holyName?.trim() && row.holyName.trim().length > 100) errors.push('Tên Thánh quá dài (tối đa 100 ký tự)')
  if (!row.fullName?.trim()) errors.push('Thiếu Họ và Tên')
  if (row.gender && !['Nam', 'Nữ'].includes(row.gender)) errors.push('Giới tính không hợp lệ (phải là Nam hoặc Nữ)')
  if (row.dateOfBirth && !isPlaceholder(row.dateOfBirth) && !/^\d{4}-\d{2}-\d{2}$/.test(row.dateOfBirth)) errors.push('Ngày sinh không đúng định dạng (YYYY-MM-DD)')
  if (row.parentPhone?.trim() && !isPlaceholder(row.parentPhone) && !PHONE_RE.test(row.parentPhone.trim())) errors.push('Số điện thoại không hợp lệ (phải là số Việt Nam)')
  if (row.branch && !isPlaceholder(row.branch) && !VALID_BRANCHES.includes(row.branch as any)) errors.push(`Phân ngành không hợp lệ: ${row.branch}`)
  if (!row.className?.trim()) errors.push('Thiếu Tên Lớp')
  return errors
}

const BRANCH_KEYWORDS: Record<string, string[]> = {
  ChienCon: ['chien con', 'chiên con', 'cc', 'chien'],
  AuNhi: ['au nhi', 'ấu nhi', 'an', 'au'],
  ThieuNhi: ['thieu nhi', 'thiếu nhi', 'tn', 'thieu'],
  NghiaSi: ['nghia si', 'nghĩa sĩ', 'ns', 'nghia'],
  HiepSi: ['hiep si', 'hiệp sĩ', 'hs', 'hiep'],
}

function inferBranch(className: string): string | null {
  const lower = className.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [branch, keywords] of Object.entries(BRANCH_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return branch
    }
  }
  return null
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

function toBranchId(value: string | undefined | null): string | undefined {
  if (!value) return undefined
  const v = value.trim()
  if (['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi'].includes(v)) return v
  const lower = v.toLowerCase()
  if (lower.includes('chiên') || lower.includes('chien')) return 'ChienCon'
  if (lower.includes('ấu') || lower.includes('au')) return 'AuNhi'
  if (lower.includes('thiếu') || lower.includes('thieu')) return 'ThieuNhi'
  if (lower.includes('nghĩa') || lower.includes('nghia')) return 'NghiaSi'
  if (lower.includes('hiệp') || lower.includes('hiep')) return 'HiepSi'
  return undefined
}

function computeContentHash(rows: { fullName?: string; dateOfBirth?: string; parentPhone?: string }[]): string {
  const sorted = rows
    .map(r => `${r.fullName?.trim() || ''}|${r.dateOfBirth?.trim() || ''}|${r.parentPhone?.trim() || ''}`)
    .sort()
    .join('\n')
  return createHash('sha256').update(sorted).digest('hex').substring(0, 16)
}

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => expect(levenshtein('abc', 'abc')).toBe(0))
  it('returns length for empty string', () => expect(levenshtein('', 'abc')).toBe(3))
  it('calculates edit distance', () => expect(levenshtein('kitten', 'sitting')).toBe(3))
  it('handles Vietnamese text', () => expect(levenshtein('Nguyễn', 'Nguyen')).toBeGreaterThan(0))
})

describe('normalizeName', () => {
  it('removes diacritics and lowercases', () => {
    expect(normalizeName('Nguyễn Văn A')).toBe('nguyen van a')
  })
  it('collapses whitespace', () => {
    expect(normalizeName('  Nguyễn   Văn  ')).toBe('nguyen van')
  })
  it('removes non-alphanumeric characters', () => {
    expect(normalizeName("Trần Thị Bích")).toBe('tran thi bich')
  })
})

describe('stripForMatch', () => {
  it('removes all spaces after normalization', () => {
    expect(stripForMatch('Nguyễn Văn A')).toBe('nguyenvana')
  })
})

describe('isPlaceholder', () => {
  it('detects "Chưa cập nhật"', () => expect(isPlaceholder('Chưa cập nhật')).toBe(true))
  it('returns false for real values', () => expect(isPlaceholder('2025-01-01')).toBe(false))
  it('handles null/undefined', () => expect(isPlaceholder(null)).toBe(false))
})

describe('detectService', () => {
  it('detects "yes" for positive values', () => {
    expect(detectService('x', 'AuNhi')).toBe('yes')
    expect(detectService('có', 'AuNhi')).toBe('yes')
    expect(detectService('1', 'AuNhi')).toBe('yes')
  })
  it('detects "no" for negative values', () => {
    expect(detectService('không', 'AuNhi')).toBe('no')
    expect(detectService('0', 'AuNhi')).toBe('no')
  })
  it('defaults to "yes" for NghiaSi/HiepSi when no service column', () => {
    expect(detectService('', 'NghiaSi')).toBe('yes')
    expect(detectService(undefined, 'HiepSi')).toBe('yes')
  })
  it('defaults to "no" for younger branches', () => {
    expect(detectService('', 'AuNhi')).toBe('no')
  })
})

describe('validateRow', () => {
  it('returns errors for missing required fields', () => {
    const errs = validateRow({})
    // holyName optional 2026-08-28: không còn bắt buộc
    expect(errs).not.toContain('Thiếu Tên Thánh')
    expect(errs).toContain('Thiếu Họ và Tên')
    expect(errs).toContain('Thiếu Tên Lớp')
  })

  it('validates phone number format', () => {
    const errs = validateRow({ holyName: 'A', fullName: 'B', className: 'C', parentPhone: '123' })
    expect(errs).toContain('Số điện thoại không hợp lệ (phải là số Việt Nam)')
  })

  it('accepts valid Vietnamese phone numbers', () => {
    const errs = validateRow({ holyName: 'A', fullName: 'B', className: 'C', parentPhone: '0901234567' })
    expect(errs).not.toContain('Số điện thoại không hợp lệ')
  })

  it('validates gender', () => {
    const errs = validateRow({ holyName: 'A', fullName: 'B', className: 'C', gender: 'Không xác định' })
    expect(errs.some(e => e.includes('Giới tính không hợp lệ'))).toBe(true)
  })

  it('validates date format', () => {
    const errs = validateRow({ holyName: 'A', fullName: 'B', className: 'C', dateOfBirth: '01/01/2025' })
    expect(errs).toContain('Ngày sinh không đúng định dạng (YYYY-MM-DD)')
  })

  it('passes valid row', () => {
    const errs = validateRow({
      holyName: 'Giuse', fullName: 'Nguyễn Văn A', gender: 'Nam',
      dateOfBirth: '2015-01-01', parentPhone: '0901234567', branch: 'ThieuNhi', className: 'TN1',
    })
    expect(errs).toHaveLength(0)
  })
})

describe('inferBranch', () => {
  it('infers branch from class name', () => {
    expect(inferBranch('Lớp Thiếu Nhi 1')).toBe('ThieuNhi')
    expect(inferBranch('TN1')).toBe('ThieuNhi')
    expect(inferBranch('Ấu Nhi A')).toBe('AuNhi')
    expect(inferBranch('CC1')).toBe('ChienCon')
    expect(inferBranch('Nghĩa Sĩ 2')).toBe('NghiaSi')
    expect(inferBranch('Hiệp Sĩ 1')).toBe('HiepSi')
  })

  it('returns null for unknown branch', () => {
    expect(inferBranch('Lớp XYZ')).toBeNull()
  })
})

describe('inferGenderFromName', () => {
  it('detects female names', () => {
    expect(inferGenderFromName('Nguyễn Thị Lan')).toBe('Nữ')
    expect(inferGenderFromName('Phạm Thị Hoa')).toBe('Nữ')
  })
  it('returns null for non-female names', () => {
    expect(inferGenderFromName('Nguyễn Văn A')).toBeNull()
  })
})

describe('toBranchId', () => {
  it('converts valid branch names', () => {
    expect(toBranchId('Chiên Con')).toBe('ChienCon')
    expect(toBranchId('thiếu nhi')).toBe('ThieuNhi')
  })
  it('passes through exact IDs', () => {
    expect(toBranchId('AuNhi')).toBe('AuNhi')
  })
  it('returns undefined for invalid input', () => {
    expect(toBranchId('XYZ')).toBeUndefined()
  })
})

describe('computeContentHash', () => {
  it('returns deterministic hash for same rows', () => {
    const rows = [
      { fullName: 'Nguyễn Văn A', dateOfBirth: '2015-01-01', parentPhone: '0901234567' },
    ]
    const h1 = computeContentHash(rows)
    const h2 = computeContentHash(rows)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[a-f0-9]{16}$/)
  })
})
