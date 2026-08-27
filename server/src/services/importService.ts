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

function validateRow(row: ImportRow): string[] {
  const errors: string[] = []
  const holyName = toStr(row.holyName).trim()
  const fullName = toStr(row.fullName).trim()
  const gender = toStr(row.gender).trim()
  const dateOfBirth = toStr(row.dateOfBirth).trim()
  const parentPhone = toStr(row.parentPhone).trim()
  const branch = toStr(row.branch).trim()
  const className = toStr(row.className).trim()
  if (!holyName) errors.push('Thiếu Tên Thánh')
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
  const normInput = normalizeName(trimmed)

  // 1. Exact match (name or code)
  const exact = allClasses.find(c => c.name.trim() === trimmed || c.code.trim() === trimmed)
  if (exact) return { className: trimmed, matchedClass: { id: exact.id, name: exact.name, code: exact.code, branchName: exact.branchName }, suggestions: [], reason: ['Tên lớp hoặc mã lớp khớp chính xác'] }

  // 2. Stripped code match
  const byCode = allClasses.find(c => stripForMatch(c.code) === stripped)
  if (byCode) return { className: trimmed, matchedClass: { id: byCode.id, name: byCode.name, code: byCode.code, branchName: byCode.branchName }, suggestions: [], reason: ['Mã lớp khớp sau khi chuẩn hóa'] }

  // 3. Normalized name match
  const byName = allClasses.find(c => normalizeName(c.name) === normInput)
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

export function normalizeImportRows(rows: ImportRow[]): ImportRow[] {
  const normalized: ImportRow[] = []
  for (const row of rows) {
    // Defensive coerce: Excel may produce numbers/nulls; ensure strings
    const r: ImportRow = {
      rowIndex: Number((row as any).rowIndex) || 0,
      holyName: toStr((row as any).holyName),
      fullName: toStr((row as any).fullName),
      gender: toStr((row as any).gender),
      dateOfBirth: toStr((row as any).dateOfBirth),
      parentName: toStr((row as any).parentName),
      parentPhone: toStr((row as any).parentPhone),
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

  // Intra-file deduplication
  const intraFileMap = new Map<string, ImportRow>()
  const rowsToCheck: ImportRow[] = []
  for (const row of rows) {
    const fn = normalizeName(row.fullName || '')
    const dob = row.dateOfBirth?.trim()
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

  const phones = [...new Set(rowsToCheck.map(r => r.parentPhone?.trim()).filter(Boolean))]
  const nameDobPairs = [...new Set(rowsToCheck.map(r => {
    const n = r.fullName?.trim()
    const d = r.dateOfBirth?.trim()
    return n && d ? `${n}||${d}` : ''
  }).filter(Boolean))]

  if (phones.length === 0 && nameDobPairs.length === 0) return result
  if (allowedClassIds !== undefined && allowedClassIds !== null && allowedClassIds.length === 0) return result

  const CHUNK = 100
  const baseCond = [eq(students.parishId, parishId), isNull(students.deletedAt)]
  if (allowedClassIds) {
    baseCond.push(inArray(students.classId, allowedClassIds))
  }

  // Query phones in chunks
  let existing: any[] = []
  if (phones.length > 0) {
    for (let i = 0; i < phones.length; i += CHUNK) {
      const chunk = phones.slice(i, i + CHUNK)
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
    }
  }

  // Query nameDob pairs in chunks
  if (nameDobPairs.length > 0) {
    for (let i = 0; i < nameDobPairs.length; i += CHUNK) {
      const chunk = nameDobPairs.slice(i, i + CHUNK)
      const conditions = chunk.map(pair => {
        const [fn, dob] = pair.split('||')
        return and(eq(students.fullName, fn), eq(students.dateOfBirth, dob))
      })
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
    const p = s.parentPhone?.trim()
    if (p && !isPlaceholder(p)) {
      const list = byPhone.get(p) || []
      list.push(s)
      byPhone.set(p, list)
    }
    const fn = normalizeName(s.fullName || '')
    const dob = s.dateOfBirth?.trim()
    if (fn && dob && !isPlaceholder(dob)) {
      const key = `${fn}||${dob}`
      const list = byNameDob.get(key) || []
      list.push(s)
      byNameDob.set(key, list)
    }
  }

  for (const row of rowsToCheck) {
    const phone = row.parentPhone?.trim()
    const rowNormName = normalizeName(row.fullName || '')
    const rowDob = row.dateOfBirth?.trim()
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

  const classCache = new Map<string, ClassMatchResult>()
  const missingClassNames = new Set<string>()

  // Pre-populate cache with learned mappings
  for (const row of normalizedRows) {
    const cn = row.className?.trim()
    if (!cn || classCache.has(cn)) continue
    const normKey = cn.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    const learned = existingMappings.get(normKey)
    if (learned) {
      const cls = allClasses.find(c => c.id === learned.classId)
      if (cls) {
        classCache.set(cn, {
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
      if (!classCache.has(cn)) {
        classCache.set(cn, await matchClass(cn, rowClone.branch, allClasses))
      }
      const result = classCache.get(cn)!
      classSuggestions = result.suggestions
      if (result.matchedClass) {
        classMatch = { id: result.matchedClass.id, name: result.matchedClass.name, confidence: result.matchedClass.code === cn ? 'exact_code' : 'exact_name', reason: result.reason }
      } else if (result.suggestions.length === 0) {
        classAutoCreate = true
        missingClassNames.add(cn)
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
  if (missingClassNames.size > 0) {
    for (const cn of missingClassNames) {
      const branch = inferBranch(cn) || 'ThieuNhi'
      suggestedNewClasses.push({ name: cn, branch, academicYearId })
    }
  }

  const classNames = [...new Set(normalizedRows.map(r => r.className?.trim()).filter(Boolean))]
  const classesNotFound = classNames.filter(cn => {
    const result = classCache.get(cn)
    return result && !result.matchedClass
  })

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
  const classIdMap = new Map<string, string>()

  // Atomic class creation
  await db.transaction(async (tx) => {
    for (const nc of classesToCreate) {
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
      classIdMap.set(nc.name, id)
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

    const mapped = classMappings[trimmed]
    // A-NEW-22 (2026-08-11): validate classId từ classMappings thuộc parish hiện tại + thuộc allowedClassSet nếu có
    if (mapped && allClasses.some(c => c.id === mapped)) {
      if (allowedClassSet != null && !allowedClassSet.has(mapped)) return null
      return mapped
    }

    const cached = classIdMap.get(trimmed)
    if (cached) {
      if (allowedClassSet != null && !allowedClassSet.has(cached)) return null
      return cached
    }

    const existed = allClasses.find(c => c.name.trim() === trimmed || c.code.trim() === trimmed)
    if (existed) {
      if (allowedClassSet != null && !allowedClassSet.has(existed.id)) return null
      classIdMap.set(trimmed, existed.id)
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
    classIdMap.set(trimmed, newId)
    result.classesCreated.push(trimmed)
    return newId
  }

  for (const row of normalizedRows) {
    try {
      const errors = validateRow(row)
      if (errors.length > 0) {
        result.errors++
        result.report.push({ rowIndex: row.rowIndex, studentName: row.fullName, status: 'error', errors })
        await db.insert(importBatchStudents).values({ id: generateId('IBS'), batchId, action: 'error', rowIndex: row.rowIndex, parishId })
        continue
      }

      let rowResult = 'class_error' as 'created' | 'updated' | 'skipped' | 'class_error'
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
        rowResult = 'created'
      })

      switch (rowResult) {
        case 'class_error':
          result.errors++
          result.report.push({ rowIndex: row.rowIndex, studentName: row.fullName, status: 'error', errors: [`Không xác định được lớp: ${row.className}`] })
          break
        case 'skipped':
          result.skipped++
          result.report.push({ rowIndex: row.rowIndex, studentName: row.fullName, status: 'skipped', errors: [] })
          break
        case 'updated':
          if (detectService(row) === 'yes' && !serviceExclusions.has(row.rowIndex)) {
            await db.insert(serviceAssignments).values({
              id: generateId('SA'), studentId, serviceType: 'le_phuc_vu',
              parishId, createdBy: userId,
            }).onConflictDoNothing()
          } else {
            await db.delete(serviceAssignments)
              .where(and(
                eq(serviceAssignments.studentId, studentId),
                eq(serviceAssignments.serviceType, 'le_phuc_vu'),
              ))
          }
          result.imported++
          result.report.push({ rowIndex: row.rowIndex, studentName: row.fullName, status: 'imported', errors: [] })
          break
        case 'created':
          if (detectService(row) === 'yes' && !serviceExclusions.has(row.rowIndex)) {
            await db.insert(serviceAssignments).values({
              id: generateId('SA'), studentId, serviceType: 'le_phuc_vu',
              parishId, createdBy: userId,
            }).onConflictDoNothing()
          }
          result.imported++
          result.report.push({ rowIndex: row.rowIndex, studentName: row.fullName, status: 'imported', errors: [] })
          break
      }
    } catch (err: any) {
      result.errors++
      result.report.push({ rowIndex: row.rowIndex, studentName: row.fullName, status: 'error', errors: [err?.message || 'Lỗi không xác định'] })
      await db.insert(importBatchStudents).values({ id: generateId('IBS'), batchId, action: 'error', rowIndex: row.rowIndex, parishId })
    }
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

  // Save user-confirmed class mappings
  for (const [rawName, classId] of Object.entries(classMappings)) {
    if (!classId) continue
    const normKey = rawName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    mappingValues.push({
      id: generateId('MM'), parishId, scope: 'class' as const,
      alias: normKey, entityId: classId, entityName: rawName,
      academicYearId: ayId, isActive: 1, createdBy: userId,
    })
  }

  // Save mappings for newly created classes
  for (const [rawName, classId] of classIdMap) {
    const normKey = rawName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    mappingValues.push({
      id: generateId('MM'), parishId, scope: 'class' as const,
      alias: normKey, entityId: classId, entityName: rawName,
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
