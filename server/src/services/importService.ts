import { createHash } from 'node:crypto'
import { db, type DbTransaction } from '../db/index.js'
import { classes, academicYears, students, branches, users, auditLogs, importBatches, importBatchStudents, mappingMemory, serviceAssignments } from '../db/schema.js'
import { eq, and, isNull, or, sql, desc, inArray } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { redactStudentForAudit } from '../utils/auditRedact.js'
import { generateUniqueStudentCode } from './studentService.js'
import { getClasses } from './classService.js'

interface ImportRow {
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

interface ValidationRow {
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
  detectedService?: 'yes' | 'no'
  isValid: boolean
  errors: string[]
  classMatch: { id: string; name: string; confidence: string; reason: string[] } | null
  classSuggestions: { id: string; name: string; code: string; branchName: string; confidence: number; reason: string[] }[]
  classAutoCreate?: boolean
  duplicateOf: { studentId: string; fullName: string; reason: string; currentClassId?: string; currentClassName?: string } | null
}

interface ClassMatchResult {
  className: string
  matchedClass: { id: string; name: string; code: string; branchName: string } | null
  suggestions: { id: string; name: string; code: string; branchName: string; confidence: number; reason: string[] }[]
  reason: string[]
}

interface ImportInput {
  rows: ImportRow[]
  classMappings: Record<string, string | null>
  newClasses?: { name: string; branch: string; academicYearId: string }[]
  duplicateActions: Record<string, 'skip' | 'update'>
  fileName?: string
  serviceExclusions?: number[]
}

interface ImportResult {
  imported: number
  skipped: number
  errors: number
  classesCreated: string[]
  batchId: string
  contentHash?: string
  orphanClasses?: string[]
  report: { rowIndex: number; studentName: string; status: string; errors: string[] }[]
}

async function mapConcurrent<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency)
    const chunkResults = await Promise.all(chunk.map(fn))
    results.push(...chunkResults)
  }
  return results
}

function toStr(v: unknown): string {
  if (v == null) return ''
  return String(v)
}

function computeContentHash(rows: ImportRow[]): string {
  const sorted = rows
    .map(r => `${toStr(r.fullName).trim() || ''}|${toStr(r.dateOfBirth).trim() || ''}|${toStr(r.parentPhone).trim() || ''}`)
    .sort()
    .join('\n')
  return createHash('sha256').update(sorted).digest('hex').substring(0, 16)
}

function detectService(row: ImportRow): 'yes' | 'no' {
  const raw = toStr(row.service).trim().toLowerCase()
  if (raw) {
    if (['x', 'có', 'co', 'yes', '1', 'true', 'phục vụ', 'phuc vu', 'le phuc vu', 'lễ phục vụ'].includes(raw)) return 'yes'
    if (['không', 'khong', 'no', '0', 'false'].includes(raw)) return 'no'
    return 'no'
  }
  if (['NghiaSi', 'HiepSi'].includes(toStr(row.branch))) return 'yes'
  return 'no'
}

const VALID_BRANCHES = ['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi'] as const
const PHONE_RE = /^(\+84|0)\d{9,10}$/

async function getAcademicYearStart(classId: string, parishId: string, tx?: DbTransaction): Promise<string | null> {
  const conn = tx || db
  const [clsAy] = await conn
    .select({ startDate: academicYears.startDate })
    .from(classes)
    .leftJoin(academicYears, eq(classes.academicYearId, academicYears.id))
    .where(and(eq(classes.id, classId), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    .limit(1)
  if (!clsAy?.startDate) return null
  const year = clsAy.startDate.substring(0, 4)
  return year
}

async function getCurrentAcademicYearId(parishId: string): Promise<string> {
  const now = new Date()
  const [current] = await db
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(and(
      eq(academicYears.parishId, parishId),
      eq(academicYears.isLocked, 0),
      sql`${now.toISOString()} >= ${academicYears.startDate}`,
      sql`${now.toISOString()} <= ${academicYears.endDate}`,
    ))
    .limit(1)
  if (current) return current.id

  const [latest] = await db
    .select({ id: academicYears.id, startDate: academicYears.startDate })
    .from(academicYears)
    .where(and(eq(academicYears.parishId, parishId), eq(academicYears.isLocked, 0)))
    .orderBy(desc(academicYears.startDate))
    .limit(1)
  if (latest) return latest.id

  const year = now.getFullYear()
  const nextYear = year + 1
  const ayId = `${year}-${nextYear}`
  const startDate = `${year}-08-01`
  const endDate = `${nextYear}-07-31`
  try {
    await db.insert(academicYears).values({ id: ayId, startDate, endDate, parishId, createdAt: now.toISOString(), updatedAt: now.toISOString(), updatedBy: 'system' }).onConflictDoNothing()
  } catch (err: any) {
    const isDuplicate = err?.message?.includes('UNIQUE') || err?.code === 'SQLITE_CONSTRAINT_UNIQUE'
    if (!isDuplicate) throw err
  }
  return ayId
}

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
  return toStr(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripForMatch(str: string): string {
  return normalizeName(toStr(str)).replace(/\s/g, '')
}

const PLACEHOLDER = 'Chưa cập nhật'

function isPlaceholder(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim() === PLACEHOLDER
}

function canonicalClassKey(name: string): string {
  return normalizeName(name)
}

function validateRow(row: ImportRow): string[] {
  const errors: string[] = []
  // holyName optional 2026-08-28 per user: thiếu tên thánh vẫn cho import bình thường
  // Không chặn import, để trống hoặc client điền sau. Vẫn lưu như rỗng.
  const holyName = toStr(row.holyName).trim()
  const fullName = toStr(row.fullName).trim()
  const gender = toStr(row.gender).trim()
  const dateOfBirth = toStr(row.dateOfBirth).trim()
  const parentPhone = toStr(row.parentPhone).trim()
  const branch = toStr(row.branch).trim()
  const className = toStr(row.className).trim()
  if (holyName && holyName.length > 100) errors.push('Tên Thánh quá dài (tối đa 100 ký tự)')
  if (!fullName) errors.push('Thiếu Họ và Tên')
  if (gender && !['Nam', 'Nữ'].includes(gender)) errors.push('Giới tính không hợp lệ (phải là Nam hoặc Nữ)')
  if (dateOfBirth && !isPlaceholder(dateOfBirth) && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) errors.push('Ngày sinh không đúng định dạng (YYYY-MM-DD)')
  if (parentPhone && !isPlaceholder(parentPhone) && !PHONE_RE.test(parentPhone)) errors.push('Số điện thoại không hợp lệ (phải là số Việt Nam)')
  if (branch && !isPlaceholder(branch) && !VALID_BRANCHES.includes(branch as any)) errors.push(`Phân ngành không hợp lệ: ${branch}`)
  if (!className) errors.push('Thiếu Tên Lớp')
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
  const lower = toStr(className).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
  const normalized = toStr(fullName).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const kw of FEMALE_GENDER_KEYWORDS) {
    if (normalized.includes(kw)) return 'Nữ'
  }
  return null
}

function explainMatch(normInput: string, classNorm: string, classCandidate: any, branch: string, dist: number, levenshteinScore: number, tokenScore: number, substringBonus: number, branchBoost: number, confidence: number): string[] {
  const reasons: string[] = []
  if (levenshteinScore >= 90) reasons.push(`Tên gần giống (Levenshtein: ${levenshteinScore}%)`)
  else if (levenshteinScore >= 60) reasons.push(`Tên tương đồng một phần (Levenshtein: ${levenshteinScore}%)`)
  if (tokenScore >= 80) reasons.push(`Các từ khóa trùng nhau nhiều (Token: ${tokenScore}%)`)
  else if (tokenScore > 0) reasons.push(`Có ${normInput.split(' ').filter(Boolean).length} từ khớp trên ${classNorm.split(' ').filter(Boolean).length} từ`)
  if (substringBonus > 0) reasons.push('Tên lớp nằm trong tên nhập vào hoặc ngược lại')
  if (branchBoost > 0) reasons.push(`Cùng phân ngành (${classCandidate.branchName})`)
  if (confidence >= 80) reasons.push(`Độ tin cậy: ${confidence}% — Tự động khớp`)
  else reasons.push(`Độ tin cậy: ${confidence}% — Cần xác nhận`)
  return reasons
}

async function matchClass(
  className: string,
  branch: string,
  allClasses: { id: string; name: string; code: string; branchId: string; branchName: string }[],
): Promise<ClassMatchResult> {
  const trimmed = className.trim()
  const stripped = stripForMatch(trimmed)
  const normInput = canonicalClassKey(trimmed)

  // 1. Canonical exact match (case-insensitive, diacritic-insensitive) — 2026-08-28 fix: "LỚP 3A" vs "Lớp 3A" phải cùng lớp
  const exact = allClasses.find(c => canonicalClassKey(c.name) === normInput || canonicalClassKey(c.code) === normInput)
  if (exact) return { className: trimmed, matchedClass: { id: exact.id, name: exact.name, code: exact.code, branchName: exact.branchName }, suggestions: [], reason: ['Tên lớp khớp sau khi chuẩn hóa (không phân biệt hoa/thường, dấu)'] }

  // 2. Stripped code match (fallback, strip spaces)
  const byCode = allClasses.find(c => stripForMatch(c.code) === stripped)
  if (byCode) return { className: trimmed, matchedClass: { id: byCode.id, name: byCode.name, code: byCode.code, branchName: byCode.branchName }, suggestions: [], reason: ['Mã lớp khớp sau khi chuẩn hóa'] }

  // 3. Normalized name match (kept for backward compat, same as canonical)
  const byName = allClasses.find(c => canonicalClassKey(c.name) === normInput)
  if (byName) return { className: trimmed, matchedClass: { id: byName.id, name: byName.name, code: byName.code, branchName: byName.branchName }, suggestions: [], reason: ['Tên lớp khớp sau khi chuẩn hóa (bỏ dấu, viết thường)'] }

  // 4. Compute weighted scores using multiple signals
  const candidates = allClasses
    .map(c => {
      const classNorm = normalizeName(c.name)

      const dist = levenshtein(normInput, classNorm)
      const maxLen = Math.max(normInput.length, classNorm.length)
      const levenshteinScore = maxLen === 0 ? 100 : Math.round((1 - dist / maxLen) * 100)

      const inputTokens = new Set(normInput.split(' ').filter(Boolean))
      const classTokens = classNorm.split(' ').filter(Boolean)
      const matchedTokens = classTokens.filter(t => inputTokens.has(t))
      const tokenScore = classTokens.length > 0 ? Math.round((matchedTokens.length / classTokens.length) * 100) : 0

      const substringBonus = normInput.includes(classNorm) || classNorm.includes(normInput) ? 10 : 0

      const inferred = inferBranch(trimmed)
      const branchBoost = c.branchName === branch || (inferred && c.branchName === inferred) ? 8 : 0

      const confidence = Math.min(levenshteinScore * 0.5 + tokenScore * 0.3 + substringBonus + branchBoost, 100)
      const reason = explainMatch(normInput, classNorm, c, branch, dist, levenshteinScore, tokenScore, substringBonus, branchBoost, Math.round(confidence))

      return { ...c, confidence: Math.round(confidence), reason }
    })
    .filter(c => c.confidence >= 50)
    .sort((a, b) => b.confidence - a.confidence)

  if (candidates.length > 0) {
    const top = candidates[0]
    const suggestions = candidates.slice(0, 5).map(c => ({ id: c.id, name: c.name, code: c.code, branchName: c.branchName, confidence: c.confidence, reason: c.reason }))

    if (top.confidence >= 80) {
      return {
        className: trimmed,
        matchedClass: { id: top.id, name: top.name, code: top.code, branchName: top.branchName },
        suggestions,
        reason: top.reason,
      }
    }
    return {
      className: trimmed,
      matchedClass: null,
      suggestions,
      reason: [`Độ tin cậy cao nhất chỉ ${top.confidence}% — cần bạn chọn lớp phù hợp`],
    }
  }

  return { className: trimmed, matchedClass: null, suggestions: [], reason: ['Không tìm thấy lớp nào khớp'] }
}

function normalizeExcelDate(value: string): string {
  const s = toStr(value).trim()
  if (!s || isPlaceholder(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Excel serial date (e.g., 44927) — common when Excel stores date as number.
  // Detect 5-6 digit integer in plausible Excel range (1900-01-01 .. 2060).
  if (/^\d{5,6}$/.test(s)) {
    const serial = Number(s)
    if (serial >= 20000 && serial <= 60000) {
      // Excel epoch 1899-12-30 (with Lotus 1900 bug accounted for by this epoch)
      const epoch = Date.UTC(1899, 11, 30)
      const ms = epoch + serial * 86400000
      const d = new Date(ms)
      const yyyy = d.getUTCFullYear()
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(d.getUTCDate()).padStart(2, '0')
      // Validate resulting date is plausible (1990-2060) to avoid misconverting phone numbers etc.
      if (yyyy >= 1990 && yyyy <= 2060) return `${yyyy}-${mm}-${dd}`
    }
  }
  // Also handle dd/mm/yyyy with slash splits (client does similar, but server adds safety)
  const parts = s.split(/[/\-.]/)
  if (parts.length === 3) {
    const p = parts.map(x => x.trim())
    // yyyy-mm-dd already handled, but yyyy/m/d
    if (p[0].length === 4) return `${p[0].padStart(4, '0')}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`
    // dd/mm/yyyy
    const yyyy2 = p[2].length === 2 ? `20${p[2]}` : p[2].padStart(4, '20')
    return `${yyyy2}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`
  }
  return s
}

function normalizePhoneValue(value: string): string {
  let s = toStr(value).trim().replace(/[\s\-.]/g, '')
  if (!s || isPlaceholder(s)) return s
  // Excel strips leading 0 when storing phone as number: 901234567 -> "901234567"
  // Vietnamese mobile numbers are 10 digits starting 0, or 9 digits without 0.
  if (/^\d{9}$/.test(s) && /^[35789]/.test(s)) s = `0${s}`
  // Handle scientific notation or float from Excel? "9.01234567E8" unlikely but coerce
  if (s.includes('E') || s.includes('e')) {
    const n = Number(s)
    if (!Number.isNaN(n)) s = String(Math.round(n))
    if (/^\d{9}$/.test(s) && /^[35789]/.test(s)) s = `0${s}`
  }
  return s
}

export function normalizeImportRows(rows: ImportRow[]): ImportRow[] {
  const normalized: ImportRow[] = []
  for (const row of rows) {
    // Defensive coerce: Excel may produce numbers/nulls; ensure strings
    const r: ImportRow = {
      rowIndex: Number((row as any).rowIndex) || 0,
      holyName: toStr((row as any).holyName),
      fullName: toStr((row as any).fullName),
      gender: toStr((row as any).gender),
      dateOfBirth: normalizeExcelDate(toStr((row as any).dateOfBirth)),
      parentName: toStr((row as any).parentName),
      parentPhone: normalizePhoneValue(toStr((row as any).parentPhone)),
      address: toStr((row as any).address),
      branch: toStr((row as any).branch),
      className: toStr((row as any).className),
      service: (row as any).service == null ? undefined : toStr((row as any).service),
    }
    if (!r.gender.trim()) {
      const inferred = inferGenderFromName(r.fullName)
      r.gender = inferred || 'Nam'
    }
    if (!r.dateOfBirth.trim()) {
      r.dateOfBirth = PLACEHOLDER
    }
    if (!r.parentName.trim()) r.parentName = PLACEHOLDER
    if (!r.parentPhone.trim()) r.parentPhone = PLACEHOLDER
    if (!r.address.trim()) r.address = PLACEHOLDER
    if (!r.branch.trim()) r.branch = inferBranch(r.className) || 'ThieuNhi'
    normalized.push(r)
  }
  return normalized
}

export async function detectDuplicates(
  rows: ImportRow[],
  parishId: string,
  allowedClassIds?: string[] | null,
): Promise<Map<number, { studentId: string; fullName: string; reason: string; currentClassId?: string; currentClassName?: string }>> {
  const result = new Map<number, { studentId: string; fullName: string; reason: string; currentClassId?: string; currentClassName?: string }>()

  // Intra-file deduplication — defensive toStr for Excel numeric/null cells
  const intraFileMap = new Map<string, ImportRow>()
  const rowsToCheck: ImportRow[] = []
  for (const row of rows) {
    const fn = normalizeName(toStr(row.fullName))
    const dob = toStr(row.dateOfBirth).trim()
    if (fn && dob && !isPlaceholder(dob)) {
      const key = `${fn}||${dob}`
      if (intraFileMap.has(key)) {
        const first = intraFileMap.get(key)!
        result.set(row.rowIndex, {
          studentId: 'intra-file',
          fullName: first.fullName,
          reason: `Trùng lặp dữ liệu với dòng ${first.rowIndex} trong cùng file`,
        })
        continue
      }
      intraFileMap.set(key, row)
    }
    rowsToCheck.push(row)
  }

  const phones = [...new Set(rowsToCheck.map(r => toStr(r.parentPhone).trim()).filter(Boolean).filter(p => !isPlaceholder(p)))]
  const nameDobPairs = [...new Set(rowsToCheck.map(r => {
    const n = toStr(r.fullName).trim()
    const d = toStr(r.dateOfBirth).trim()
    return n && d && !isPlaceholder(d) ? `${n}||${d}` : ''
  }).filter(Boolean))]

  if (phones.length === 0 && nameDobPairs.length === 0) return result
  if (allowedClassIds !== undefined && allowedClassIds !== null && allowedClassIds.length === 0) return result

  // CHUNK size: Turso/libSQL has stricter variable/expression limits than local SQLite.
  // 100 OR terms (200 variables) hit "too many SQL variables" / "expression tree too large" on production
  // with ~120 rows (see VALIDATE_FAILED 2026-08-27). Keep chunks small + fallback per-row on failure.
  const CHUNK_PHONE = 50
  const CHUNK_NAME_DOB = 30
  const baseCond = [eq(students.parishId, parishId), isNull(students.deletedAt)]
  if (allowedClassIds) {
    baseCond.push(inArray(students.classId, allowedClassIds))
  }

  // Query phones in chunks
  let existing: any[] = []
  if (phones.length > 0) {
    for (let i = 0; i < phones.length; i += CHUNK_PHONE) {
      const chunk = phones.slice(i, i + CHUNK_PHONE)
      try {
        const rows = await db
          .select({
            id: students.id,
            fullName: students.fullName,
            parentPhone: students.parentPhone,
            dateOfBirth: students.dateOfBirth,
            classId: students.classId,
            className: classes.name,
            holyName: students.holyName,
          })
          .from(students)
          .leftJoin(classes, eq(students.classId, classes.id))
          .where(and(...baseCond, inArray(students.parentPhone, chunk)))
        existing.push(...rows)
      } catch (err) {
        console.warn('[detectDuplicates] phone chunk failed, falling back per-phone', { chunkSize: chunk.length, error: String(err).slice(0, 500) })
        // Fallback: query each phone individually (still parish-scoped)
        for (const phone of chunk) {
          try {
            const rows = await db
              .select({
                id: students.id,
                fullName: students.fullName,
                parentPhone: students.parentPhone,
                dateOfBirth: students.dateOfBirth,
                classId: students.classId,
                className: classes.name,
                holyName: students.holyName,
              })
              .from(students)
              .leftJoin(classes, eq(students.classId, classes.id))
              .where(and(...baseCond, eq(students.parentPhone, phone)))
            existing.push(...rows)
          } catch (inner) {
            console.warn('[detectDuplicates] per-phone fallback failed', { phone, error: String(inner).slice(0, 300) })
          }
        }
      }
    }
  }

  // Query nameDob pairs in chunks — small chunks to avoid Turso "too many SQL variables"
  if (nameDobPairs.length > 0) {
    for (let i = 0; i < nameDobPairs.length; i += CHUNK_NAME_DOB) {
      const chunk = nameDobPairs.slice(i, i + CHUNK_NAME_DOB)
      const conditions = chunk.map(pair => {
        const [fn, dob] = pair.split('||')
        return and(eq(students.fullName, fn), eq(students.dateOfBirth, dob))
      })
      try {
        const rows = await db
          .select({
            id: students.id,
            fullName: students.fullName,
            parentPhone: students.parentPhone,
            dateOfBirth: students.dateOfBirth,
            classId: students.classId,
            className: classes.name,
            holyName: students.holyName,
          })
          .from(students)
          .leftJoin(classes, eq(students.classId, classes.id))
          .where(and(...baseCond, or(...conditions)))
        existing.push(...rows)
      } catch (err) {
        console.warn('[detectDuplicates] nameDob chunk failed, falling back per-pair', { chunkSize: chunk.length, error: String(err).slice(0, 500) })
        for (const pair of chunk) {
          const [fn, dob] = pair.split('||')
          try {
            const rows = await db
              .select({
                id: students.id,
                fullName: students.fullName,
                parentPhone: students.parentPhone,
                dateOfBirth: students.dateOfBirth,
                classId: students.classId,
                className: classes.name,
                holyName: students.holyName,
              })
              .from(students)
              .leftJoin(classes, eq(students.classId, classes.id))
              .where(and(...baseCond, eq(students.fullName, fn), eq(students.dateOfBirth, dob)))
            existing.push(...rows)
          } catch (inner) {
            console.warn('[detectDuplicates] per-pair fallback failed', { fn, dob, error: String(inner).slice(0, 300) })
          }
        }
      }
    }
  }

  // Deduplicate existing records by id
  const existingMap = new Map<string, typeof existing[0]>()
  for (const s of existing) {
    existingMap.set(s.id, s)
  }
  const uniqueExisting = Array.from(existingMap.values())

  // Multi-value maps to properly support siblings sharing the same parentPhone (IE-01)
  const byPhone = new Map<string, typeof existing>()
  const byNameDob = new Map<string, typeof existing>()
  for (const s of uniqueExisting) {
    const p = toStr(s.parentPhone).trim()
    if (p && !isPlaceholder(p)) {
      const list = byPhone.get(p) || []
      list.push(s)
      byPhone.set(p, list)
    }
    const fn = normalizeName(toStr(s.fullName))
    const dob = toStr(s.dateOfBirth).trim()
    if (fn && dob && !isPlaceholder(dob)) {
      const key = `${fn}||${dob}`
      const list = byNameDob.get(key) || []
      list.push(s)
      byNameDob.set(key, list)
    }
  }

  for (const row of rowsToCheck) {
    const phone = toStr(row.parentPhone).trim()
    const rowNormName = normalizeName(toStr(row.fullName))
    const rowDob = toStr(row.dateOfBirth).trim()
    const hasValidDob = rowDob && !isPlaceholder(rowDob)
    const nameDobKey = `${rowNormName}||${rowDob}`

    let match: typeof existing[0] | undefined
    let reason = ''

    // 1. If phone is provided, inspect all students sharing this parent phone (IE-01 disambiguation)
    if (phone && !isPlaceholder(phone) && byPhone.has(phone)) {
      const candidates = byPhone.get(phone)!
      // Check for exact identity match (normalized name match)
      const nameMatchedCandidate = candidates.find(c => {
        const candNorm = normalizeName(c.fullName || '')
        if (candNorm !== rowNormName) return false
        // If both have DOB, ensure DOB matches or is placeholder
        if (hasValidDob && c.dateOfBirth && !isPlaceholder(c.dateOfBirth)) {
          return c.dateOfBirth === rowDob
        }
        return true
      })

      if (nameMatchedCandidate) {
        match = nameMatchedCandidate
        reason = hasValidDob && nameMatchedCandidate.dateOfBirth === rowDob ? 'phone_and_identity' : 'phone_and_name'
      } else if (candidates.length === 1 && !hasValidDob && normalizeName(candidates[0].fullName || '') === rowNormName) {
        match = candidates[0]
        reason = 'phone'
      }
      // Note: If candidates have DIFFERENT names (siblings in same family), we DO NOT match!
      // The incoming row is a distinct sibling (new student), NOT a duplicate of existing siblings!
    }

    // 2. Fallback to name + DOB match if no phone match was found
    if (!match && hasValidDob && byNameDob.has(nameDobKey)) {
      const candidates = byNameDob.get(nameDobKey)!
      match = candidates[0]
      reason = 'name_dob'
    }

    if (match) {
      result.set(row.rowIndex, {
        studentId: match.id,
        fullName: match.fullName,
        reason,
        currentClassId: match.classId || undefined,
        currentClassName: match.className || undefined,
      })
    }
  }

  return result
}

async function getExistingMappings(parishId: string, academicYearId?: string): Promise<Map<string, { classId: string; className: string }>> {
  const conditions = [eq(mappingMemory.parishId, parishId), eq(mappingMemory.scope, 'class'), eq(mappingMemory.isActive, 1)]
  if (academicYearId) conditions.push(eq(mappingMemory.academicYearId, academicYearId))

  const mappings = await db
    .select({ alias: mappingMemory.alias, entityId: mappingMemory.entityId, entityName: mappingMemory.entityName })
    .from(mappingMemory)
    .where(and(...conditions))

  const map = new Map<string, { classId: string; className: string }>()
  for (const m of mappings) {
    if (!m.entityName) continue
    map.set(m.alias, { classId: m.entityId, className: m.entityName })
  }
  return map
}

export async function validateImport(
  rows: ImportRow[],
  parishId: string,
  allClasses: { id: string; name: string; code: string; branchId: string; branchName: string }[],
  allowedClassIds?: string[] | null,
): Promise<{
  rows: ValidationRow[]
  classesNotFound: string[]
  suggestedNewClasses: { name: string; branch: string; academicYearId: string }[]
  contentHash: string
  previousImport: { batchId: string; fileName: string | null; createdAt: string; totalRows: number } | null
}> {
  const normalizedRows = normalizeImportRows(rows)
  const dupMap = await detectDuplicates(normalizedRows, parishId, allowedClassIds)
  const academicYearId = await getCurrentAcademicYearId(parishId)
  const existingMappings = await getExistingMappings(parishId, academicYearId)

  // canonical cache: key = canonicalClassKey, value = result. Deduplicate case/diacritic variants.
  const classCache = new Map<string, ClassMatchResult>()
  const canonicalToOriginal = new Map<string, string>()
  const missingCanonicalSet = new Set<string>()

  // Pre-populate cache with learned mappings
  for (const row of normalizedRows) {
    const cn = row.className?.trim()
    if (!cn) continue
    const canon = canonicalClassKey(cn)
    if (classCache.has(canon)) continue
    if (!canonicalToOriginal.has(canon)) canonicalToOriginal.set(canon, cn)
    const normKey = canon
    const learned = existingMappings.get(normKey)
    if (learned) {
      const cls = allClasses.find(c => c.id === learned.classId)
      if (cls) {
        classCache.set(canon, {
          className: cn,
          matchedClass: { id: cls.id, name: cls.name, code: cls.code, branchName: cls.branchName },
          suggestions: [],
          reason: [`Đã học từ lần import trước: "${cn}" → "${learned.className}"`],
        })
      }
    }
  }

  const validatedRows = await mapConcurrent(normalizedRows, async (row) => {
    const rowClone = { ...row }
    const errors = validateRow(rowClone)

    let classMatch: ValidationRow['classMatch'] = null
    let classSuggestions: ValidationRow['classSuggestions'] = []
    let classAutoCreate = false

    const cn = rowClone.className?.trim()
    if (cn) {
      const canon = canonicalClassKey(cn)
      if (!canonicalToOriginal.has(canon)) canonicalToOriginal.set(canon, cn)
      if (!classCache.has(canon)) {
        classCache.set(canon, await matchClass(cn, rowClone.branch, allClasses))
      }
      const result = classCache.get(canon)!
      classSuggestions = result.suggestions
      if (result.matchedClass) {
        const isExactCode = canonicalClassKey(result.matchedClass.code) === canon
        classMatch = { id: result.matchedClass.id, name: result.matchedClass.name, confidence: isExactCode ? 'exact_code' : 'exact_name', reason: result.reason }
      } else if (result.suggestions.length === 0) {
        classAutoCreate = true
        missingCanonicalSet.add(canon)
      }
    }

    const dup = dupMap.get(rowClone.rowIndex) || null

    // Auto-infer branch from className if not provided
    if (!rowClone.branch && cn) {
      rowClone.branch = inferBranch(cn) || rowClone.branch
    }

    const detectedService = detectService(rowClone)

    return {
      ...rowClone,
      isValid: errors.length === 0 && !dup,
      errors,
      detectedService,
      classMatch,
      classSuggestions,
      classAutoCreate,
      duplicateOf: dup,
    }
  }, 10)

  const suggestedNewClasses: { name: string; branch: string; academicYearId: string }[] = []
  if (missingCanonicalSet.size > 0) {
    for (const canon of missingCanonicalSet) {
      const cn = canonicalToOriginal.get(canon) || canon
      const branch = inferBranch(cn) || 'ThieuNhi'
      suggestedNewClasses.push({ name: cn, branch, academicYearId })
    }
  }

  // Dedup class names by canonical key for response
  const canonicalSeen = new Set<string>()
  const distinctCanonicals: string[] = []
  for (const r of normalizedRows) {
    const cn = r.className?.trim()
    if (!cn) continue
    const canon = canonicalClassKey(cn)
    if (!canonicalSeen.has(canon)) {
      canonicalSeen.add(canon)
      distinctCanonicals.push(canon)
    }
  }
  const classesNotFound: string[] = []
  for (const canon of distinctCanonicals) {
    const result = classCache.get(canon)
    if (result && !result.matchedClass) {
      classesNotFound.push(canonicalToOriginal.get(canon) || canon)
    }
  }

  const contentHash = computeContentHash(normalizedRows)
  const [prev] = await db
    .select({ batchId: importBatches.id, fileName: importBatches.fileName, createdAt: importBatches.createdAt, totalRows: importBatches.totalRows })
    .from(importBatches)
    .where(and(eq(importBatches.contentHash, contentHash), eq(importBatches.parishId, parishId), inArray(importBatches.status, ['completed', 'partial'])))
    .orderBy(desc(importBatches.createdAt))
    .limit(1)

  return { rows: validatedRows, classesNotFound, suggestedNewClasses, contentHash, previousImport: prev || null }
}

export async function importStudents(
  input: ImportInput,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
  allowedClassIds?: string[] | null,
): Promise<ImportResult> {
  // import_batches.user_id references users.id. Auth normally guarantees this,
  // but a stale token or a database restored without its user row otherwise
  // surfaces as an opaque SQLITE_CONSTRAINT during the INSERT below.
  const [initiator] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.parishId, parishId)))
    .limit(1)
  if (!initiator) {
    throw new Error(`Import initiator ${userId} was not found in parish ${parishId}; refresh the session or restore the referenced user before importing`)
  }

  const allowedClassSet = allowedClassIds != null ? new Set(allowedClassIds) : null
  const classesToCreate = input.newClasses || []

  if (allowedClassSet != null && classesToCreate.length > 0) {
    throw new Error('Chủ nhiệm không có quyền tạo mới lớp học')
  }

  const classMappings = input.classMappings || {}
  const duplicateActions = input.duplicateActions || {}
  const allClasses = await getClasses(parishId)

  // Canonical normalizeImportRows (IE-02)
  const normalizedRows = normalizeImportRows(input.rows)

  const batchId = generateId('IMP')
  const contentHash = computeContentHash(normalizedRows)
  const serviceExclusions = new Set(input.serviceExclusions || [])
  const result: ImportResult = { imported: 0, skipped: 0, errors: 0, classesCreated: [], batchId, contentHash, report: [] }
  // classIdMap canonical -> id, dedup case/diacritic variants. Keep original name for display via canonicalToOriginal.
  const classIdMap = new Map<string, string>()
  const canonicalToOriginalImport = new Map<string, string>()
  // Build canonical map for classMappings (raw keys may differ in case/diacritics)
  const normClassMappings = new Map<string, string | null>()
  for (const [k, v] of Object.entries(classMappings)) {
    normClassMappings.set(canonicalClassKey(k), v)
    if (!canonicalToOriginalImport.has(canonicalClassKey(k))) canonicalToOriginalImport.set(canonicalClassKey(k), k)
  }

  // Deduplicate classesToCreate by canonical key to avoid creating "LỚP 3A" and "Lop 3A" as 2 rows
  const dedupedClassesToCreate: typeof classesToCreate = []
  const seenCanonCreate = new Set<string>()
  for (const nc of classesToCreate) {
    const canon = canonicalClassKey(nc.name)
    if (seenCanonCreate.has(canon)) continue
    // Also skip if canonical already exists in DB (case-insensitive)
    if (allClasses.some(c => canonicalClassKey(c.name) === canon || canonicalClassKey(c.code) === canon)) continue
    seenCanonCreate.add(canon)
    dedupedClassesToCreate.push(nc)
    if (!canonicalToOriginalImport.has(canon)) canonicalToOriginalImport.set(canon, nc.name)
  }

  // Atomic class creation
  await db.transaction(async (tx) => {
    for (const nc of dedupedClassesToCreate) {
      const id = generateId('CLS')
      const now = new Date().toISOString()
      const [branch] = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(and(
          or(eq(branches.id, nc.branch), eq(branches.name, nc.branch)),
          eq(branches.parishId, parishId),
        ))
        .limit(1)
      if (!branch) throw new Error(`Branch "${nc.branch}" not found`)

      let ayId = nc.academicYearId
      if (ayId) {
        const [ay] = await tx
          .select({ id: academicYears.id })
          .from(academicYears)
          .where(and(eq(academicYears.id, ayId), eq(academicYears.parishId, parishId)))
          .limit(1)
        if (!ay) ayId = ''
      }
      if (!ayId) {
        ayId = await getCurrentAcademicYearId(parishId)
      }

      await tx.insert(classes).values({
        id, code: nc.name, name: nc.name, branchId: branch.id,
        academicYearId: ayId, parishId, updatedBy: userId,
        createdAt: now, updatedAt: now,
      })
      await tx.insert(auditLogs).values({
        id: generateId('AUD'), userId, action: 'CREATE', entityType: 'class',
        entityId: id, newValue: JSON.stringify(nc), ip, userAgent, parishId,
      })
      const canon = canonicalClassKey(nc.name)
      classIdMap.set(canon, id)
      if (!canonicalToOriginalImport.has(canon)) canonicalToOriginalImport.set(canon, nc.name)
      result.classesCreated.push(nc.name)
    }
  })

  // Insert import_batches BEFORE processing rows so FK on import_batch_students is satisfied
  const batchNow = new Date().toISOString()
  await db.insert(importBatches).values({
    id: batchId, userId, fileName: input.fileName || null, contentHash,
    totalRows: input.rows.length, imported: 0, skipped: 0, errorCount: 0,
    classesCreated: JSON.stringify(result.classesCreated),
    status: 'processing', parishId, createdAt: batchNow,
  })

  try {
    const dupMap = await detectDuplicates(normalizedRows, parishId)
    const ayCache = new Map<string, string>()

  async function resolveClassId(tx: DbTransaction, rowClassName: string, rowBranch: string): Promise<string | null> {
    const trimmed = rowClassName.trim()
    if (!trimmed) return null
    const canon = canonicalClassKey(trimmed)

    // Check canonical mapping first (case/diacritic-insensitive), fallback raw for compat
    const mapped = normClassMappings.get(canon) ?? classMappings[trimmed]
    // A-NEW-22 (2026-08-11): validate classId từ classMappings thuộc parish hiện tại + thuộc allowedClassSet nếu có
    if (mapped && allClasses.some(c => c.id === mapped)) {
      if (allowedClassSet != null && !allowedClassSet.has(mapped)) return null
      return mapped
    }

    const cached = classIdMap.get(canon)
    if (cached) {
      if (allowedClassSet != null && !allowedClassSet.has(cached)) return null
      return cached
    }

    const existed = allClasses.find(c => canonicalClassKey(c.name) === canon || canonicalClassKey(c.code) === canon)
    if (existed) {
      if (allowedClassSet != null && !allowedClassSet.has(existed.id)) return null
      classIdMap.set(canon, existed.id)
      if (!canonicalToOriginalImport.has(canon)) canonicalToOriginalImport.set(canon, trimmed)
      return existed.id
    }

    if (allowedClassSet != null) {
      // Non-admin cannot auto-create classes outside assigned scope
      return null
    }

    const branchCode = rowBranch || inferBranch(trimmed) || 'ThieuNhi'
    const [branch] = await tx.select({ id: branches.id }).from(branches).where(and(eq(branches.id, branchCode), eq(branches.parishId, parishId))).limit(1)
    if (!branch) return null

    let ayId = ayCache.get(parishId)
    if (!ayId) {
      ayId = await getCurrentAcademicYearId(parishId)
      ayCache.set(parishId, ayId)
    }

    const newId = generateId('CLS')
    const now = new Date().toISOString()
    await tx.insert(classes).values({ id: newId, code: trimmed, name: trimmed, branchId: branch.id, academicYearId: ayId, parishId, updatedBy: userId, createdAt: now, updatedAt: now })
    await tx.insert(auditLogs).values({ id: generateId('AUD'), userId, action: 'IMPORT_AUTO_CREATE_CLASS', entityType: 'class', entityId: newId, newValue: JSON.stringify({ name: trimmed, branch: branchCode, academicYearId: ayId }), ip, userAgent, parishId })
    classIdMap.set(canon, newId)
    if (!canonicalToOriginalImport.has(canon)) canonicalToOriginalImport.set(canon, trimmed)
    result.classesCreated.push(trimmed)
    return newId
  }

  // PERF-IMPORT-1 (2026-08-28): xử lý song song có kiểm soát thay vì tuần tự từng dòng.
  // 120 dòng × 3-4 query/tx qua Turso remote (80-120ms) = 30-40s tuần tự → còn 4-6s với concurrency 8.
  // classIdMap / ayCache dùng chung (Map) — JS đơn luồng nên an toàn khi đọc/ghi xen kẽ trong Promise.all;
  // fallback tạo lớp xử lý ON CONFLICT để tránh race khi 2 dòng cùng tạo "Lớp mới".
  const CONCURRENCY = 8
  const rowOutcomes = await mapConcurrent(normalizedRows, async (row) => {
    try {
      const errors = validateRow(row)
      if (errors.length > 0) {
        await db.insert(importBatchStudents).values({ id: generateId('IBS'), batchId, action: 'error', rowIndex: row.rowIndex, parishId })
        return { rowIndex: row.rowIndex, studentName: row.fullName, status: 'error' as const, errors }
      }

      let rowResult: 'created' | 'updated' | 'skipped' | 'class_error' = 'class_error'
      let studentId = ''

      await db.transaction(async (tx) => {
        const classId = await resolveClassId(tx, row.className || '', row.branch || '')
        if (!classId) {
          await tx.insert(importBatchStudents).values({ id: generateId('IBS'), batchId, action: 'error', rowIndex: row.rowIndex, parishId })
          rowResult = 'class_error'
          return
        }

        const dup = dupMap.get(row.rowIndex)
        const dupAction = dup ? duplicateActions[String(row.rowIndex)] : null

        if (dup && dupAction === 'skip') {
          await tx.insert(importBatchStudents).values({ id: generateId('IBS'), batchId, studentId: dup.studentId, action: 'skipped', rowIndex: row.rowIndex, parishId })
          rowResult = 'skipped'
          return
        }

        if (dup && dupAction === 'update') {
          studentId = dup.studentId
          const now = new Date().toISOString()
          const [existingStudent] = await tx
            .select()
            .from(students)
            .where(and(eq(students.id, studentId), eq(students.parishId, parishId)))
            .limit(1)

          if (allowedClassSet != null && (!existingStudent || !allowedClassSet.has(existingStudent.classId))) {
            await tx.insert(importBatchStudents).values({ id: generateId('IBS'), batchId, studentId, action: 'error', rowIndex: row.rowIndex, parishId })
            rowResult = 'class_error'
            return
          }

          await tx.update(students)
            .set({ holyName: row.holyName, fullName: row.fullName, gender: row.gender as any, dateOfBirth: row.dateOfBirth, parentName: row.parentName, parentPhone: row.parentPhone, address: row.address || '', branch: row.branch as any, classId, updatedBy: userId, updatedAt: now })
            .where(and(eq(students.id, studentId), eq(students.parishId, parishId)))
          await tx.insert(auditLogs).values({
            id: generateId('AUD'), userId, action: 'IMPORT_UPDATE', entityType: 'student',
            entityId: studentId,
            oldValue: existingStudent ? JSON.stringify(redactStudentForAudit(existingStudent)) : null,
            newValue: JSON.stringify(redactStudentForAudit(row)), ip, userAgent, parishId,
          })
          await tx.insert(importBatchStudents).values({ id: generateId('IBS'), batchId, studentId, action: 'updated', rowIndex: row.rowIndex, parishId })
          // Gộp serviceAssignments vào cùng tx để giảm 1 round-trip
          if (detectService(row) === 'yes' && !serviceExclusions.has(row.rowIndex)) {
            await tx.insert(serviceAssignments).values({ id: generateId('SA'), studentId, serviceType: 'le_phuc_vu', parishId, createdBy: userId }).onConflictDoNothing()
          } else {
            await tx.delete(serviceAssignments).where(and(eq(serviceAssignments.studentId, studentId), eq(serviceAssignments.serviceType, 'le_phuc_vu')))
          }
          rowResult = 'updated'
          return
        }

        studentId = generateId('ST')
        const year = await getAcademicYearStart(classId, parishId)
        const code = await generateUniqueStudentCode(year || String(new Date().getFullYear()), parishId)
        const now = new Date().toISOString()

        await tx.insert(students).values({
          id: studentId, code, holyName: row.holyName, fullName: row.fullName,
          gender: row.gender as any, dateOfBirth: row.dateOfBirth,
          parentName: row.parentName, parentPhone: row.parentPhone,
          address: row.address || '', branch: row.branch as any, classId,
          parishId, updatedBy: userId, createdAt: now, updatedAt: now,
        })
        await tx.insert(auditLogs).values({
          id: generateId('AUD'), userId, action: 'IMPORT_CREATE', entityType: 'student',
          entityId: studentId, newValue: JSON.stringify(redactStudentForAudit(row)), ip, userAgent, parishId,
        })
        await tx.insert(importBatchStudents).values({ id: generateId('IBS'), batchId, studentId, action: 'created', rowIndex: row.rowIndex, parishId })
        if (detectService(row) === 'yes' && !serviceExclusions.has(row.rowIndex)) {
          await tx.insert(serviceAssignments).values({ id: generateId('SA'), studentId, serviceType: 'le_phuc_vu', parishId, createdBy: userId }).onConflictDoNothing()
        }
        rowResult = 'created'
      })

      if (rowResult === 'class_error') return { rowIndex: row.rowIndex, studentName: row.fullName, status: 'error' as const, errors: [`Không xác định được lớp: ${row.className}`] }
      if (rowResult === 'skipped') return { rowIndex: row.rowIndex, studentName: row.fullName, status: 'skipped' as const, errors: [] as string[] }
      // created / updated đều là imported
      return { rowIndex: row.rowIndex, studentName: row.fullName, status: 'imported' as const, errors: [] as string[] }
    } catch (err: any) {
      try {
        await db.insert(importBatchStudents).values({ id: generateId('IBS'), batchId, action: 'error', rowIndex: row.rowIndex, parishId })
      } catch {}
      return { rowIndex: row.rowIndex, studentName: row.fullName, status: 'error' as const, errors: [err?.message || 'Lỗi không xác định'] }
    }
  }, CONCURRENCY)

  // Aggregate kết quả theo rowIndex để report có thứ tự
  rowOutcomes.sort((a, b) => a.rowIndex - b.rowIndex)
  for (const o of rowOutcomes) {
    result.report.push({ rowIndex: o.rowIndex, studentName: o.studentName, status: o.status, errors: o.errors })
    if (o.status === 'error') result.errors++
    else if (o.status === 'skipped') result.skipped++
    else if (o.status === 'imported') result.imported++
  }

  // Update import_batches with final counts and status
  let finalStatus: 'completed' | 'partial' | 'failed' = 'completed'
  if (result.errors > 0) {
    finalStatus = (result.imported > 0 || result.skipped > 0) ? 'partial' : 'failed'
  }

  await db.update(importBatches).set({
    imported: result.imported, skipped: result.skipped,
    errorCount: result.errors, classesCreated: JSON.stringify(result.classesCreated || []),
    status: finalStatus,
  }).where(and(eq(importBatches.id, batchId), eq(importBatches.parishId, parishId)))

  // Save class name mappings for learning (scope by academic year)
  const ayId = await getCurrentAcademicYearId(parishId)
  const mappingValues: (typeof mappingMemory.$inferInsert)[] = []

  // Save user-confirmed class mappings — alias canonical for case/diacritic-insensitive learning
  for (const [rawName, classId] of Object.entries(classMappings)) {
    if (!classId) continue
    const alias = canonicalClassKey(rawName)
    mappingValues.push({
      id: generateId('MM'), parishId, scope: 'class' as const,
      alias, entityId: classId, entityName: rawName,
      academicYearId: ayId, isActive: 1, createdBy: userId,
    })
  }

  // Save mappings for newly created classes — use canonical alias, original display name
  for (const [canon, classId] of classIdMap) {
    const alias = canon // already canonical
    const entityName = canonicalToOriginalImport.get(canon) || canon
    mappingValues.push({
      id: generateId('MM'), parishId, scope: 'class' as const,
      alias, entityId: classId, entityName,
      academicYearId: ayId, isActive: 1, createdBy: userId,
    })
  }

  if (mappingValues.length > 0) {
    await db.insert(mappingMemory).values(mappingValues).onConflictDoNothing()
  }

  // Detect orphan classes (created but have 0 students)
  if (classIdMap.size > 0) {
    const newClassIds = [...new Set(classIdMap.values())]
    const classCounts = await db
      .select({ classId: students.classId, count: sql<number>`count(*)` })
      .from(students)
      .where(and(
        inArray(students.classId, newClassIds),
        isNull(students.deletedAt),
        eq(students.parishId, parishId),
      ))
      .groupBy(students.classId)
    const populatedIds = new Set(classCounts.map(c => c.classId))
    const orphans = newClassIds.filter(id => !populatedIds.has(id))
    if (orphans.length > 0) {
      result.orphanClasses = orphans
    }
  }
  } catch (err: any) {
    await db.update(importBatches).set({
      errorCount: result.errors || input.rows.length,
      status: 'failed',
    }).where(and(eq(importBatches.id, batchId), eq(importBatches.parishId, parishId)))
    throw err
  }

  return result
}

export async function saveMappingMemory(params: {
  parishId: string
  scope: 'class' | 'student'
  alias: string
  entityId: string
  entityName?: string
  academicYearId?: string | null
  userId: string
}): Promise<void> {
  const normAlias = params.alias.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  // For student scope, check manually since SQLite unique index treats NULLs as distinct
  if (params.scope === 'student') {
    const existing = await db
      .select({ id: mappingMemory.id })
      .from(mappingMemory)
      .where(and(eq(mappingMemory.parishId, params.parishId), eq(mappingMemory.scope, 'student'), eq(mappingMemory.alias, normAlias), eq(mappingMemory.isActive, 1)))
      .limit(1)
    if (existing.length > 0) return
  }

  await db.insert(mappingMemory).values({
    id: generateId('MM'),
    parishId: params.parishId,
    scope: params.scope,
    alias: normAlias,
    entityId: params.entityId,
    entityName: params.entityName || params.alias,
    academicYearId: params.academicYearId || null,
    isActive: 1,
    createdBy: params.userId,
  }).onConflictDoNothing()
}

export async function saveStudentMapping(alias: string, studentId: string, studentName: string, userId: string, parishId: string): Promise<void> {
  return saveMappingMemory({ parishId, scope: 'student', alias, entityId: studentId, entityName: studentName, userId })
}

export async function getStudentMappings(parishId: string): Promise<Map<string, { studentId: string; studentName: string }>> {
  const mappings = await db
    .select({ alias: mappingMemory.alias, entityId: mappingMemory.entityId, entityName: mappingMemory.entityName })
    .from(mappingMemory)
    .where(and(eq(mappingMemory.parishId, parishId), eq(mappingMemory.scope, 'student'), eq(mappingMemory.isActive, 1)))
  const map = new Map<string, { studentId: string; studentName: string }>()
  for (const m of mappings) {
    if (!m.entityName) continue
    map.set(m.alias, { studentId: m.entityId, studentName: m.entityName })
  }
  return map
}

export async function getMappingMemory(parishId: string, scope: 'class' | 'student', academicYearId?: string) {
  const conditions = [eq(mappingMemory.parishId, parishId), eq(mappingMemory.scope, scope), eq(mappingMemory.isActive, 1)]
  if (academicYearId) conditions.push(eq(mappingMemory.academicYearId, academicYearId))
  return db
    .select()
    .from(mappingMemory)
    .where(and(...conditions))
    .orderBy(desc(mappingMemory.createdAt))
}

export async function deleteMappingMemory(id: string, parishId: string): Promise<void> {
  await db.update(mappingMemory)
    .set({ isActive: 0 })
    .where(and(eq(mappingMemory.id, id), eq(mappingMemory.parishId, parishId)))
}

export async function undoImport(batchId: string, parishId: string): Promise<{ undone: number; errors: string[] }> {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.parishId, parishId)))
    .limit(1)

  if (!batch) throw new Error('Không tìm thấy batch import')
  if (!['completed', 'partial'].includes(batch.status)) throw new Error('Batch này đã được hoàn tác hoặc đang xử lý')

  const undoWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  if (batch.createdAt < undoWindow) throw new Error('Chỉ có thể hoàn tác trong vòng 24 giờ sau khi import')

  const result = { undone: 0, errors: [] as string[] }

  await db.transaction(async (tx) => {
    const batchStudents = await tx
      .select()
      .from(importBatchStudents)
      .where(and(eq(importBatchStudents.batchId, batchId)))

    for (const bs of batchStudents) {
      if (bs.action === 'created' && bs.studentId) {
        await tx.update(students)
          .set({ deletedAt: new Date().toISOString() })
          .where(and(eq(students.id, bs.studentId), eq(students.parishId, parishId)))
        result.undone++
      }
      if (bs.action === 'updated' && bs.studentId) {
        const audit = await tx
          .select({ oldValue: auditLogs.oldValue })
          .from(auditLogs)
          .where(and(
            eq(auditLogs.entityId, bs.studentId),
            eq(auditLogs.action, 'IMPORT_UPDATE'),
            eq(auditLogs.userId, batch.userId),
            eq(auditLogs.parishId, parishId),
          ))
          .orderBy(desc(auditLogs.createdAt))
          .limit(1)
        if (audit.length > 0 && audit[0].oldValue) {
          const oldData = JSON.parse(audit[0].oldValue)
          const { id: _id, parishId: _pId, createdAt: _cA, ...restorableFields } = oldData
          await tx.update(students)
            .set({ ...restorableFields, updatedAt: new Date().toISOString(), updatedBy: batch.userId })
            .where(and(eq(students.id, bs.studentId), eq(students.parishId, parishId)))
          result.undone++
        }
      }
    }

    // Delete newly created classes
    const createdClasses: string[] = JSON.parse(batch.classesCreated || '[]')
    if (createdClasses.length > 0) {
      const clsToDelete = await tx
        .select({ id: classes.id })
        .from(classes)
        .where(and(
          inArray(classes.name, createdClasses),
          eq(classes.parishId, parishId),
        ))
      for (const cls of clsToDelete) {
        await tx.update(classes)
          .set({ deletedAt: new Date().toISOString() })
          .where(and(eq(classes.id, cls.id), eq(classes.parishId, parishId)))
      }
    }

    await tx.update(importBatches)
      .set({ status: 'undone' })
      .where(and(eq(importBatches.id, batchId), eq(importBatches.parishId, parishId)))
  })

  return result
}

export async function detectOrphanClasses(parishId: string): Promise<string[]> {
  const classIds = (await db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(and(eq(classes.parishId, parishId), isNull(classes.deletedAt))))
    .map(c => c.id)

  if (classIds.length === 0) return []

  const populated = await db
    .select({ classId: students.classId })
    .from(students)
    .where(and(
      inArray(students.classId, classIds),
      isNull(students.deletedAt),
      eq(students.parishId, parishId),
    ))
    .groupBy(students.classId)

  const populatedSet = new Set(populated.map(r => r.classId))
  return classIds.filter(id => !populatedSet.has(id))
}

export async function getImportHistory(parishId: string, limit = 20, offset = 0, userId?: string) {
  const conditions = [eq(importBatches.parishId, parishId)]
  if (userId) {
    conditions.push(eq(importBatches.userId, userId))
  }

  const rows = await db
    .select()
    .from(importBatches)
    .where(and(...conditions))
    .orderBy(desc(importBatches.createdAt))
    .limit(limit)
    .offset(offset)

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(importBatches)
    .where(and(...conditions))

  return { rows, total: count }
}
