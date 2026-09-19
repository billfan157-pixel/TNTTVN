import { createHash } from 'node:crypto'
import { db, type DbTransaction } from '../db/index.js'
import { classes, academicYears, students, branches, users, auditLogs, importBatches, importBatchStudents, mappingMemory, serviceAssignments, grades, attendance, examResults, promotionRecords, academicYearSnapshots, assessmentEntries, leaveRequests, studentFeeRecords, financialTransactions } from '../db/schema.js'
import { eq, and, isNull, isNotNull, or, sql, desc, inArray, gte } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { redactStudentForAudit } from '../utils/auditRedact.js'
import { generateStudentCodeSuffix } from './studentCodeGenerator.js'
import { getClasses } from './classService.js'
import { getClassDependencyBlockers } from './classDependencyService.js'
import { resolveMembershipBranch, resolveStudentBranch, STUDENT_BRANCHES, type StudentBranch } from './studentMembershipPolicy.js'
import { phoneMatchVariants } from '../utils/phone.js'
import { isAcademicYearClosedForWrite } from '../utils/academicYear.js'

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

type ImportClassCandidate = {
  id: string
  name: string
  code: string
  branchId: string
  branchName: string
  academicYearId: string
}

interface ImportInput {
  rows: ImportRow[]
  academicYearId: string
  classMappings: Record<string, string | null>
  newClasses?: { name: string; branch: string; academicYearId: string }[]
  duplicateActions: Record<string, 'skip' | 'update' | 'create'>
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
  studentChanges: ImportStudentChange[]
  report: { rowIndex: number; studentName: string; status: string; errors: string[] }[]
}

interface ImportStudentChange {
  action: 'created' | 'updated'
  student: typeof students.$inferSelect
}

interface ImportRowOutcome {
  rowIndex: number
  studentName: string
  status: 'imported' | 'skipped' | 'error'
  errors: string[]
  change?: ImportStudentChange
}

interface ImportRollbackSnapshot {
  version: 1
  kind: 'created' | 'updated'
  appliedUpdatedAt: string
  previousStudent?: typeof students.$inferSelect
  previousServiceAssigned?: boolean
}

interface UndoImportItemOutcome {
  rowIndex: number
  studentId: string
  action: 'created' | 'updated'
  status: 'undone' | 'blocked' | 'already_undone'
  message?: string
}

interface UndoImportResult {
  undone: number
  errors: string[]
  items: UndoImportItemOutcome[]
  classesDeleted: string[]
}

const IMPORT_PROCESS_STARTED_AT = new Date().toISOString()

function summarizeImportBatchActions(actions: Array<typeof importBatchStudents.$inferInsert>): {
  imported: number
  skipped: number
  errors: number
} {
  let imported = 0
  let skipped = 0
  let errors = 0
  for (const item of actions) {
    if (item.action === 'created' || item.action === 'updated') imported++
    else if (item.action === 'skipped') skipped++
    else errors++
  }
  return { imported, skipped, errors }
}

async function recordImportBatchRows(
  tx: DbTransaction,
  actions: Array<typeof importBatchStudents.$inferInsert>,
): Promise<void> {
  if (actions.length === 0) return
  const batchId = actions[0].batchId
  const parishId = actions[0].parishId
  if (!parishId || actions.some(item => item.batchId !== batchId || item.parishId !== parishId)) {
    throw new Error('Import row provenance must belong to one explicit parish batch')
  }
  const counts = summarizeImportBatchActions(actions)
  await tx.insert(importBatchStudents).values(actions)
  const [updatedBatch] = await tx.update(importBatches).set({
    imported: sql`${importBatches.imported} + ${counts.imported}`,
    skipped: sql`${importBatches.skipped} + ${counts.skipped}`,
    errorCount: sql`${importBatches.errorCount} + ${counts.errors}`,
  }).where(and(
    eq(importBatches.id, batchId),
    eq(importBatches.parishId, parishId),
    eq(importBatches.status, 'processing'),
  )).returning({ id: importBatches.id })
  if (!updatedBatch) throw new Error('Import batch is no longer processing')
}

async function finalizeImportBatchFromRows(
  tx: DbTransaction,
  batchId: string,
  parishId: string,
  totalRows: number,
): Promise<{ imported: number; skipped: number; errors: number; status: 'completed' | 'partial' | 'failed' }> {
  const actionRows = await tx.select({ action: importBatchStudents.action, count: sql<number>`COUNT(*)` })
    .from(importBatchStudents)
    .where(and(eq(importBatchStudents.batchId, batchId), eq(importBatchStudents.parishId, parishId)))
    .groupBy(importBatchStudents.action)
  let imported = 0
  let skipped = 0
  let recordedErrors = 0
  for (const row of actionRows) {
    const count = Number(row.count)
    if (row.action === 'created' || row.action === 'updated') imported += count
    else if (row.action === 'skipped') skipped += count
    else recordedErrors += count
  }
  const missingRows = Math.max(0, totalRows - imported - skipped - recordedErrors)
  const errors = recordedErrors + missingRows
  const status = errors > 0
    ? (imported > 0 || skipped > 0 ? 'partial' : 'failed')
    : 'completed'
  await tx.update(importBatches).set({ imported, skipped, errorCount: errors, status }).where(and(
    eq(importBatches.id, batchId), eq(importBatches.parishId, parishId), eq(importBatches.status, 'processing'),
  ))
  return { imported, skipped, errors, status }
}

/**
 * Recover only batches created before this server process started. Such a row
 * cannot belong to an import still executing in this process, so recovery does
 * not race an active request in the supported single-SQLite-writer runtime.
 */
export async function recoverInterruptedImportBatches(
  parishId: string,
  processStartedAt = IMPORT_PROCESS_STARTED_AT,
): Promise<number> {
  const interrupted = await db.select({
    id: importBatches.id,
    totalRows: importBatches.totalRows,
    userId: importBatches.userId,
    createdClassIds: importBatches.createdClassIds,
  })
    .from(importBatches)
    .where(and(
      eq(importBatches.parishId, parishId),
      eq(importBatches.status, 'processing'),
      sql`${importBatches.createdAt} < ${processStartedAt}`,
    ))
  for (const batch of interrupted) {
    await db.transaction(async (tx) => {
      let createdClassIds: string[] = []
      try { createdClassIds = JSON.parse(batch.createdClassIds || '[]') } catch {}
      if (createdClassIds.length > 0) {
        await cleanupUnreferencedImportClasses(tx, createdClassIds, parishId, batch.userId, batch.id)
      }
      await finalizeImportBatchFromRows(tx, batch.id, parishId, batch.totalRows)
    })
  }
  return interrupted.length
}

/**
 * Composition-root recovery entrypoint. Discover only stale processing scopes,
 * then delegate every mutation to the parish-scoped recovery boundary above.
 * The supported production topology contains one parish, while this discovery
 * keeps dev/test databases safe without inventing a default tenant.
 */
export async function recoverInterruptedImportBatchesForAllParishes(
  processStartedAt = IMPORT_PROCESS_STARTED_AT,
): Promise<number> {
  const rows = await db.select({ parishId: importBatches.parishId })
    .from(importBatches)
    .where(and(
      eq(importBatches.status, 'processing'),
      sql`${importBatches.createdAt} < ${processStartedAt}`,
    ))
  const parishIds = [...new Set(rows.map(row => row.parishId))]
  let recovered = 0
  for (const parishId of parishIds) {
    recovered += await recoverInterruptedImportBatches(parishId, processStartedAt)
  }
  return recovered
}

async function cleanupUnreferencedImportClasses(
  tx: DbTransaction,
  classIds: string[],
  parishId: string,
  actorUserId: string,
  batchId: string,
): Promise<{ deleted: string[]; blocked: string[] }> {
  const deleted: string[] = []
  const blocked: string[] = []
  for (const classId of [...new Set(classIds)]) {
    const blockers = await getClassDependencyBlockers(tx, classId, parishId)
    if (blockers.length > 0) {
      blocked.push(classId)
      continue
    }
    const now = new Date().toISOString()
    await tx.update(mappingMemory).set({ isActive: 0 }).where(and(
      eq(mappingMemory.parishId, parishId), eq(mappingMemory.scope, 'class'), eq(mappingMemory.entityId, classId),
    ))
    await tx.update(classes).set({ deletedAt: now, updatedAt: now, updatedBy: actorUserId }).where(and(
      eq(classes.id, classId), eq(classes.parishId, parishId), isNull(classes.deletedAt),
    ))
    await tx.insert(auditLogs).values({
      id: generateId('AUD'), userId: actorUserId, action: 'UNDO_IMPORT', entityType: 'class', entityId: classId,
      newValue: JSON.stringify({ batchId, cleanup: 'failed_or_undone_import' }), parishId,
    })
    deleted.push(classId)
  }
  return { deleted, blocked }
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
    .map(r => [
      normalizeName(r.holyName), normalizeName(r.fullName), toStr(r.gender).trim(),
      toStr(r.dateOfBirth).trim(), toStr(r.parentPhone).trim(), normalizeName(r.parentName),
      normalizeName(r.address), toStr(r.branch).trim(), canonicalClassKey(r.className),
      toStr(r.service).trim().toLowerCase(),
    ].join('|'))
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

async function requireImportAcademicYear(parishId: string, academicYearId: string): Promise<string> {
  if (!academicYearId?.trim()) {
    throw Object.assign(
      new Error('Cần chọn niên khóa trước khi kiểm tra hoặc import danh sách.'),
      { code: 'ACADEMIC_YEAR_REQUIRED' },
    )
  }

  const [academicYear] = await db
    .select({ id: academicYears.id, isLocked: academicYears.isLocked, status: academicYears.status })
    .from(academicYears)
    .where(and(
      eq(academicYears.parishId, parishId),
      eq(academicYears.id, academicYearId),
    ))
    .limit(1)
  // A8 hardening: canonical closed-for-write predicate (lock OR terminal
  // status) instead of the previous isLocked-only check.
  if (academicYear && !isAcademicYearClosedForWrite(academicYear)) return academicYear.id

  throw Object.assign(
    new Error('Niên khóa đã chọn không tồn tại, đã khóa hoặc không thuộc giáo xứ hiện tại.'),
    { code: 'ACADEMIC_YEAR_INVALID' },
  )
}

/**
 * V-01 TOCTOU close (audit 2026-09-19 addendum): the import year is validated
 * once up front, but a long import may still be running when an admin
 * finalizes the year. Every write transaction below re-checks year liveness
 * at commit time so no class/student lands in a newly locked year.
 * Fail-closed with a clear message; row/chunk catch blocks convert it to
 * per-row errors so the batch stops visibly instead of half-committing.
 */
async function assertImportYearStillOpen(tx: DbTransaction, parishId: string, academicYearId: string): Promise<void> {
  const [year] = await tx
    .select({ id: academicYears.id, isLocked: academicYears.isLocked, status: academicYears.status })
    .from(academicYears)
    .where(and(
      eq(academicYears.parishId, parishId),
      eq(academicYears.id, academicYearId),
    ))
    .limit(1)
  if (!year || isAcademicYearClosedForWrite(year)) {
    throw Object.assign(
      new Error('Niên khóa import đã bị khóa/chốt trong lúc xử lý; hãy chọn niên khóa đang mở và chạy lại.'),
      { code: 'ACADEMIC_YEAR_INVALID' },
    )
  }
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

function validateRow(row: ImportRow, requireCompleteMembership = true): string[] {
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
  if (!gender && requireCompleteMembership) errors.push('Thiếu Giới Tính')
  else if (gender && !['Nam', 'Nữ'].includes(gender)) errors.push('Giới tính không hợp lệ (phải là Nam hoặc Nữ)')
  if (dateOfBirth && !isPlaceholder(dateOfBirth)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      errors.push('Ngày sinh không đúng định dạng (YYYY-MM-DD)')
    } else {
      const [year, month, day] = dateOfBirth.split('-').map(Number)
      const parsed = new Date(Date.UTC(year, month - 1, day))
      const isRealDate = parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
      if (!isRealDate || year < 1900 || parsed.getTime() > Date.now()) {
        errors.push('Ngày sinh không hợp lệ, phải từ năm 1900 và không nằm trong tương lai')
      }
    }
  }
  if (parentPhone && !isPlaceholder(parentPhone) && !PHONE_RE.test(parentPhone)) errors.push('Số điện thoại không hợp lệ (phải là số Việt Nam)')
  if (!branch && requireCompleteMembership) errors.push('Thiếu Phân Ngành')
  else if (branch && !isPlaceholder(branch) && !VALID_BRANCHES.includes(branch as any)) errors.push(`Phân ngành không hợp lệ: ${branch}`)
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

function explainMatch(normInput: string, classNorm: string, classCandidate: any, branch: string, dist: number, levenshteinScore: number, tokenScore: number, substringBonus: number, branchBoost: number, confidence: number): string[] {
  const reasons: string[] = []
  if (levenshteinScore >= 90) reasons.push(`Tên gần giống (Levenshtein: ${levenshteinScore}%)`)
  else if (levenshteinScore >= 60) reasons.push(`Tên tương đồng một phần (Levenshtein: ${levenshteinScore}%)`)
  if (tokenScore >= 80) reasons.push(`Các từ khóa trùng nhau nhiều (Token: ${tokenScore}%)`)
  else if (tokenScore > 0) reasons.push(`Có ${normInput.split(' ').filter(Boolean).length} từ khớp trên ${classNorm.split(' ').filter(Boolean).length} từ`)
  if (substringBonus > 0) reasons.push('Tên lớp nằm trong tên nhập vào hoặc ngược lại')
  if (branchBoost > 0) reasons.push(`Cùng phân ngành (${classCandidate.branchName})`)
  reasons.push(`Mức tương đồng: ${confidence}%`)
  return reasons
}

async function matchClass(
  className: string,
  branch: string,
  allClasses: ImportClassCandidate[],
): Promise<ClassMatchResult> {
  const trimmed = className.trim()
  const stripped = stripForMatch(trimmed)
  const normInput = canonicalClassKey(trimmed)

  // 1. Canonical exact match (case-insensitive, diacritic-insensitive) — 2026-08-28 fix: "LỚP 3A" vs "Lớp 3A" phải cùng lớp
  const exactMatches = allClasses.filter(c => canonicalClassKey(c.name) === normInput || canonicalClassKey(c.code) === normInput)
  if (exactMatches.length === 1) {
    const [exact] = exactMatches
    return { className: trimmed, matchedClass: { id: exact.id, name: exact.name, code: exact.code, branchName: exact.branchName }, suggestions: [], reason: ['Tên lớp khớp sau khi chuẩn hóa (không phân biệt hoa/thường, dấu)'] }
  }
  if (exactMatches.length > 1) {
    return {
      className: trimmed,
      matchedClass: null,
      suggestions: exactMatches.slice(0, 5).map(c => ({
        id: c.id, name: c.name, code: c.code, branchName: c.branchName, confidence: 100,
        reason: ['Có nhiều lớp khớp chính xác trong cùng niên khóa — bắt buộc chọn thủ công'],
      })),
      reason: ['Có nhiều lớp khớp chính xác trong cùng niên khóa — bắt buộc chọn thủ công'],
    }
  }

  // 2. Stripped code match (fallback, strip spaces)
  const codeMatches = allClasses.filter(c => stripForMatch(c.code) === stripped)
  if (codeMatches.length === 1) {
    const [byCode] = codeMatches
    return { className: trimmed, matchedClass: { id: byCode.id, name: byCode.name, code: byCode.code, branchName: byCode.branchName }, suggestions: [], reason: ['Mã lớp khớp sau khi chuẩn hóa'] }
  }

  // 3. Normalized name match (kept for backward compat, same as canonical)
  // 3. Compute weighted scores using multiple signals
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
      const branchBoost = c.branchId === branch || c.branchName === branch || (inferred && (c.branchId === inferred || c.branchName === inferred)) ? 8 : 0

      const confidence = Math.min(levenshteinScore * 0.5 + tokenScore * 0.3 + substringBonus + branchBoost, 100)
      const reason = explainMatch(normInput, classNorm, c, branch, dist, levenshteinScore, tokenScore, substringBonus, branchBoost, Math.round(confidence))

      return { ...c, confidence: Math.round(confidence), reason }
    })
    .filter(c => c.confidence >= 50)
    .sort((a, b) => b.confidence - a.confidence)

  if (candidates.length > 0) {
    const top = candidates[0]
    const suggestions = candidates.slice(0, 5).map(c => ({ id: c.id, name: c.name, code: c.code, branchName: c.branchName, confidence: c.confidence, reason: c.reason }))

    const runnerUp = candidates[1]
    const lead = runnerUp ? top.confidence - runnerUp.confidence : 100
    if (top.confidence >= 80 && lead >= 10) {
      return {
        className: trimmed,
        matchedClass: { id: top.id, name: top.name, code: top.code, branchName: top.branchName },
        suggestions,
        reason: [...top.reason, runnerUp ? `Dẫn ứng viên kế tiếp ${lead} điểm` : 'Không có ứng viên cạnh tranh'],
      }
    }
    return {
      className: trimmed,
      matchedClass: null,
      suggestions,
      reason: [top.confidence < 80
        ? `Độ tin cậy cao nhất chỉ ${top.confidence}% — cần bạn chọn lớp phù hợp`
        : `Hai ứng viên đứng đầu chỉ chênh ${lead} điểm — cần bạn chọn lớp phù hợp`],
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
    if (!r.dateOfBirth.trim()) {
      r.dateOfBirth = PLACEHOLDER
    }
    if (!r.parentName.trim()) r.parentName = PLACEHOLDER
    if (!r.parentPhone.trim()) r.parentPhone = PLACEHOLDER
    if (!r.address.trim()) r.address = PLACEHOLDER
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

  // Multi-key intra-file deduplication (DOB, Phone, HolyName+Class, Name+Class)
  const intraNameDobMap = new Map<string, ImportRow>()
  const intraNamePhoneMap = new Map<string, ImportRow>()
  const intraHolyNameClassMap = new Map<string, ImportRow>()
  const intraNameClassMap = new Map<string, ImportRow>()
  const rowsToCheck: ImportRow[] = []

  for (const row of rows) {
    const fn = normalizeName(toStr(row.fullName))
    const hn = normalizeName(toStr(row.holyName))
    const dob = toStr(row.dateOfBirth).trim()
    const phone = toStr(row.parentPhone).trim()
    const cls = canonicalClassKey(toStr(row.className))
    const hasValidDob = Boolean(dob && !isPlaceholder(dob))
    const hasValidPhone = Boolean(phone && !isPlaceholder(phone))

    let intraFirst: ImportRow | undefined
    let intraReason = ''

    if (fn && hasValidDob) {
      const k = `${fn}||${dob}`
      if (intraNameDobMap.has(k)) {
        intraFirst = intraNameDobMap.get(k)
        intraReason = `Trùng lặp Họ Tên và Ngày Sinh với dòng ${intraFirst?.rowIndex} trong cùng file`
      } else {
        intraNameDobMap.set(k, row)
      }
    }

    if (!intraFirst && fn && hasValidPhone) {
      const k = `${fn}||${phone}`
      if (intraNamePhoneMap.has(k)) {
        intraFirst = intraNamePhoneMap.get(k)
        intraReason = `Trùng lặp Họ Tên và SĐT Phụ Huynh với dòng ${intraFirst?.rowIndex} trong cùng file`
      } else {
        intraNamePhoneMap.set(k, row)
      }
    }

    if (!intraFirst && hn && fn && cls) {
      const k = `${hn}||${fn}||${cls}`
      if (intraHolyNameClassMap.has(k)) {
        intraFirst = intraHolyNameClassMap.get(k)
        intraReason = `Trùng lặp Tên Thánh, Họ Tên và Lớp với dòng ${intraFirst?.rowIndex} trong cùng file`
      } else {
        intraHolyNameClassMap.set(k, row)
      }
    }

    if (!intraFirst && fn && cls && !hasValidDob && !hasValidPhone) {
      const k = `${fn}||${cls}`
      if (intraNameClassMap.has(k)) {
        intraFirst = intraNameClassMap.get(k)
        intraReason = `Trùng lặp Họ Tên trong cùng lớp với dòng ${intraFirst?.rowIndex} trong cùng file`
      } else {
        intraNameClassMap.set(k, row)
      }
    }

    if (intraFirst) {
      result.set(row.rowIndex, {
        studentId: 'intra-file',
        fullName: intraFirst.fullName,
        reason: intraReason,
      })
      continue
    }

    rowsToCheck.push(row)
  }

  const phones = [...new Set(rowsToCheck.map(r => toStr(r.parentPhone).trim()).filter(Boolean).filter(p => !isPlaceholder(p)))]
  const datesOfBirth = [...new Set(rowsToCheck.map(r => {
    const d = toStr(r.dateOfBirth).trim()
    return d && !isPlaceholder(d) ? d : ''
  }).filter(Boolean))]
  const needsNameClassLookup = rowsToCheck.some(r => {
    const d = toStr(r.dateOfBirth).trim()
    const n = toStr(r.fullName).trim()
    return (!d || isPlaceholder(d)) && Boolean(n)
  })

  if (phones.length === 0 && datesOfBirth.length === 0 && !needsNameClassLookup) return result
  if (allowedClassIds !== undefined && allowedClassIds !== null && allowedClassIds.length === 0) return result

  const CHUNK_PHONE = 50
  const CHUNK_DOB = 50
  const baseCond = [eq(students.parishId, parishId), isNull(students.deletedAt)]
  if (allowedClassIds) {
    baseCond.push(inArray(students.classId, allowedClassIds))
  }

  let existing: any[] = []

  // 1. Query phones in chunks
  if (phones.length > 0) {
    for (let i = 0; i < phones.length; i += CHUNK_PHONE) {
      const chunk = phones.slice(i, i + CHUNK_PHONE)
      const candidates = await db
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
        .leftJoin(classes, and(eq(students.classId, classes.id), eq(students.parishId, classes.parishId)))
        .where(and(...baseCond, inArray(students.parentPhone, chunk)))
      existing.push(...candidates)
    }
  }

  // 2. Retrieve by DOB, then compare names with the same canonicalizer used
  // below. Querying raw full_name here previously made the normalized match
  // unreachable for case/diacritic variants.
  if (datesOfBirth.length > 0) {
    for (let i = 0; i < datesOfBirth.length; i += CHUNK_DOB) {
      const chunk = datesOfBirth.slice(i, i + CHUNK_DOB)
      const candidates = await db
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
        .leftJoin(classes, and(eq(students.classId, classes.id), eq(students.parishId, classes.parishId)))
        .where(and(...baseCond, inArray(students.dateOfBirth, chunk)))
      existing.push(...candidates)
    }
  }

  // 3. Rows without DOB need normalized name + class comparison. A bounded
  // parish/class-scope candidate read is deliberate: SQLite cannot reproduce
  // the application's Vietnamese diacritic canonicalization in an indexed
  // predicate, and an exact raw-name predicate would fail open again.
  if (needsNameClassLookup) {
    const candidates = await db
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
      .leftJoin(classes, and(eq(students.classId, classes.id), eq(students.parishId, classes.parishId)))
      .where(and(...baseCond))
    existing.push(...candidates)
  }

  // Deduplicate existing records by id
  const existingMap = new Map<string, typeof existing[0]>()
  for (const s of existing) {
    existingMap.set(s.id, s)
  }
  const uniqueExisting = Array.from(existingMap.values())

  // Multi-value maps to properly support siblings and candidate lookups
  const byPhone = new Map<string, typeof existing>()
  const byNameDob = new Map<string, typeof existing>()
  const byName = new Map<string, typeof existing>()

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
    if (fn) {
      const list = byName.get(fn) || []
      list.push(s)
      byName.set(fn, list)
    }
  }

  for (const row of rowsToCheck) {
    const phone = toStr(row.parentPhone).trim()
    const rowNormName = normalizeName(toStr(row.fullName))
    const rowNormHoly = normalizeName(toStr(row.holyName))
    const rowDob = toStr(row.dateOfBirth).trim()
    const rowClassNorm = canonicalClassKey(toStr(row.className))
    const hasValidDob = Boolean(rowDob && !isPlaceholder(rowDob))
    const hasValidPhone = Boolean(phone && !isPlaceholder(phone))
    const nameDobKey = `${rowNormName}||${rowDob}`

    let match: typeof existing[0] | undefined
    let reason = ''

    // 1. If phone is provided, inspect all students sharing this parent phone (IE-01 disambiguation)
    if (hasValidPhone && byPhone.has(phone)) {
      const candidates = byPhone.get(phone)!
      // Check for exact identity match (normalized name match)
      const nameMatchedCandidate = candidates.find(c => {
        const candNorm = normalizeName(c.fullName || '')
        if (candNorm !== rowNormName) return false
        if (hasValidDob && c.dateOfBirth && !isPlaceholder(c.dateOfBirth)) {
          return c.dateOfBirth === rowDob
        }
        return true
      })

      if (nameMatchedCandidate) {
        match = nameMatchedCandidate
        const candHolyNorm = normalizeName(nameMatchedCandidate.holyName || '')
        const hasDiffHoly = Boolean(rowNormHoly && candHolyNorm && rowNormHoly !== candHolyNorm)
        if (hasValidDob && nameMatchedCandidate.dateOfBirth === rowDob) {
          reason = hasDiffHoly ? 'name_dob_diff_holy_name' : 'phone_and_identity'
        } else {
          reason = 'phone_and_name'
        }
      } else if (candidates.length === 1 && !hasValidDob && normalizeName(candidates[0].fullName || '') === rowNormName) {
        match = candidates[0]
        reason = 'phone'
      } else {
        // Fuzzy match check on phone candidates (detect typos when phone + DOB match)
        for (const c of candidates) {
          const candNorm = normalizeName(c.fullName || '')
          const candDob = toStr(c.dateOfBirth).trim()
          const sameDob = hasValidDob && candDob && !isPlaceholder(candDob) && candDob === rowDob
          const dist = levenshtein(rowNormName, candNorm)
          const maxLen = Math.max(rowNormName.length, candNorm.length)
          const sim = maxLen > 0 ? Math.round((1 - dist / maxLen) * 100) : 0
          if (sim >= 80 && (sameDob || candidates.length === 1)) {
            match = c
            reason = sameDob ? 'fuzzy_phone_dob' : 'fuzzy_phone'
            break
          }
        }
      }
    }

    // 2. Fallback to name + DOB match if no phone match was found
    if (!match && hasValidDob && byNameDob.has(nameDobKey)) {
      const candidates = byNameDob.get(nameDobKey)!
      match = candidates[0]
      const candHolyNorm = normalizeName(match.holyName || '')
      const hasDiffHoly = Boolean(rowNormHoly && candHolyNorm && rowNormHoly !== candHolyNorm)
      reason = hasDiffHoly ? 'name_dob_diff_holy_name' : 'name_dob'
    }

    // 3. Name + Holy Name + Class match (when DOB is missing or placeholder)
    if (!match && !hasValidDob && byName.has(rowNormName)) {
      const candidates = byName.get(rowNormName)!
      const classMatched = candidates.find(c => {
        const candClassNorm = canonicalClassKey(c.className || '')
        const candHolyNorm = normalizeName(c.holyName || '')
        const sameClass = Boolean(candClassNorm && rowClassNorm && candClassNorm === rowClassNorm)
        const sameHoly = Boolean(rowNormHoly && candHolyNorm && rowNormHoly === candHolyNorm)
        return sameClass && (sameHoly || !rowNormHoly)
      })
      if (classMatched) {
        match = classMatched
        reason = rowNormHoly ? 'name_holy_class' : 'name_class'
      }
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
  allClasses: ImportClassCandidate[],
  requestedAcademicYearId: string,
  allowedClassIds?: string[] | null,
): Promise<{
  rows: ValidationRow[]
  classesNotFound: string[]
  suggestedNewClasses: { name: string; branch: string; academicYearId: string }[]
  contentHash: string
  previousImport: { batchId: string; fileName: string | null; createdAt: string; totalRows: number } | null
}> {
  const academicYearId = await requireImportAcademicYear(parishId, requestedAcademicYearId)
  const targetYearClasses = allClasses.filter(candidate => candidate.academicYearId === academicYearId)
  const normalizedRows = normalizeImportRows(rows)
  const dupMap = await detectDuplicates(normalizedRows, parishId, allowedClassIds)
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
      const cls = targetYearClasses.find(c => c.id === learned.classId)
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

    let classMatch: ValidationRow['classMatch'] = null
    let classSuggestions: ValidationRow['classSuggestions'] = []
    let classAutoCreate = false
    let membershipError: string | null = null

    const cn = rowClone.className?.trim()
    if (cn) {
      const canon = canonicalClassKey(cn)
      if (!canonicalToOriginal.has(canon)) canonicalToOriginal.set(canon, cn)
      if (!classCache.has(canon)) {
        classCache.set(canon, await matchClass(cn, rowClone.branch, targetYearClasses))
      }
      const result = classCache.get(canon)!
      classSuggestions = result.suggestions
      if (result.matchedClass) {
        const isExactCode = canonicalClassKey(result.matchedClass.code) === canon
        classMatch = { id: result.matchedClass.id, name: result.matchedClass.name, confidence: isExactCode ? 'exact_code' : 'exact_name', reason: result.reason }
        const matchedCandidate = targetYearClasses.find(candidate => candidate.id === result.matchedClass!.id)
        const targetBranch = resolveStudentBranch(matchedCandidate?.branchId || '', result.matchedClass.branchName)
        if (!rowClone.branch.trim() && targetBranch) rowClone.branch = targetBranch
        else if (targetBranch && rowClone.branch.trim() && rowClone.branch !== targetBranch) {
          membershipError = `Phân ngành học viên (${rowClone.branch}) không khớp phân ngành lớp (${targetBranch})`
        }
      } else if (result.suggestions.length === 0) {
        classAutoCreate = true
        missingCanonicalSet.add(canon)
      }
    }

    const dup = dupMap.get(rowClone.rowIndex) || null
    const errors = validateRow(rowClone, !dup)
    if (membershipError) errors.push(membershipError)

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
  await recoverInterruptedImportBatches(parishId)
  await clearExpiredImportRollbackSnapshots(parishId)
  const academicYearId = await requireImportAcademicYear(parishId, input.academicYearId)
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

  if (classesToCreate.some(candidate => candidate.academicYearId !== academicYearId)) {
    throw Object.assign(
      new Error('Mọi lớp tạo trong lượt import phải thuộc đúng niên khóa đã chọn.'),
      { code: 'ACADEMIC_YEAR_MISMATCH' },
    )
  }

  if (allowedClassSet != null && classesToCreate.length > 0) {
    throw new Error('Chủ nhiệm không có quyền tạo mới lớp học')
  }

  const classMappings = input.classMappings || {}
  const duplicateActions = input.duplicateActions || {}
  const allClasses = (await getClasses(parishId)).filter(candidate => candidate.academicYearId === academicYearId)
  const eligibleClassIds = new Set(allClasses.map(candidate => candidate.id))
  const classBranchById = new Map<string, StudentBranch | null>(
    allClasses.map(candidate => [candidate.id, resolveStudentBranch(candidate.branchId, candidate.branchName)]),
  )

  // Canonical normalizeImportRows (IE-02)
  const normalizedRows = normalizeImportRows(input.rows)
  const providedFieldsByRow = new Map<number, Set<keyof ImportRow>>()
  for (const rawRow of input.rows) {
    const provided = new Set<keyof ImportRow>()
    for (const field of ['holyName', 'fullName', 'gender', 'dateOfBirth', 'parentName', 'parentPhone', 'address', 'branch', 'className', 'service'] as const) {
      const value = toStr(rawRow[field]).trim()
      if (value && !isPlaceholder(value)) provided.add(field)
    }
    providedFieldsByRow.set(Number(rawRow.rowIndex) || 0, provided)
  }

  const batchId = generateId('IMP')
  const contentHash = computeContentHash(normalizedRows)
  const serviceExclusions = new Set(input.serviceExclusions || [])
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    errors: 0,
    classesCreated: [],
    batchId,
    contentHash,
    studentChanges: [],
    report: [],
  }
  const createdClassIds: string[] = []
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

  // The control row and any classes created for this import share one
  // transaction. A crash can therefore never leave an unowned import class.
  const batchNow = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.insert(importBatches).values({
      id: batchId, userId, fileName: input.fileName || null, contentHash,
      totalRows: input.rows.length, imported: 0, skipped: 0, errorCount: 0,
      classesCreated: '[]', createdClassIds: '[]',
      status: 'processing', parishId, createdAt: batchNow,
    })
    for (const nc of dedupedClassesToCreate) {
      const id = generateId('CLS')
      const now = new Date().toISOString()
      const [branch] = await tx
        .select({ id: branches.id, name: branches.name })
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
          .select({ id: academicYears.id, isLocked: academicYears.isLocked, status: academicYears.status })
          .from(academicYears)
          .where(and(eq(academicYears.id, ayId), eq(academicYears.parishId, parishId)))
          .limit(1)
        if (!ay) {
          throw Object.assign(new Error(`Niên khóa "${ayId}" không tồn tại trong giáo xứ`), { code: 'ACADEMIC_YEAR_INVALID' })
        }
        // V-01: the target year was validated open up front, but re-check at
        // write time — it may have been finalized since validation.
        if (isAcademicYearClosedForWrite(ay)) {
          throw Object.assign(new Error(`Niên khóa "${ayId}" đã bị khóa/chốt; không thể tạo lớp trong lượt import`), { code: 'ACADEMIC_YEAR_INVALID' })
        }
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
      eligibleClassIds.add(id)
      classBranchById.set(id, resolveStudentBranch(branch.id, branch.name))
      if (!canonicalToOriginalImport.has(canon)) canonicalToOriginalImport.set(canon, nc.name)
      result.classesCreated.push(nc.name)
      createdClassIds.push(id)
    }
    if (createdClassIds.length > 0) {
      await tx.update(importBatches).set({
        classesCreated: JSON.stringify(result.classesCreated),
        createdClassIds: JSON.stringify(createdClassIds),
      }).where(and(eq(importBatches.id, batchId), eq(importBatches.parishId, parishId)))
    }
  })

  try {
    // Commit-time duplicate guard scans the parish. Rows that collide outside a
    // class-scoped user's assignments fail generically without exposing identity.
    const dupMap = await detectDuplicates(normalizedRows, parishId)
    const academicYearByClassId = new Map<string, string>()
    for (const cls of allClasses) {
      const year = cls.academicYear?.substring(0, 4)
      if (year) academicYearByClassId.set(cls.id, year)
    }
    if (createdClassIds.length > 0) {
      const createdClassYears = await db
        .select({ classId: classes.id, startDate: academicYears.startDate })
        .from(classes)
        .leftJoin(academicYears, and(
          eq(classes.academicYearId, academicYears.id),
          eq(classes.parishId, academicYears.parishId),
        ))
        .where(and(eq(classes.parishId, parishId), inArray(classes.id, createdClassIds)))
      for (const cls of createdClassYears) {
        const year = cls.startDate?.substring(0, 4)
        if (year) academicYearByClassId.set(cls.classId, year)
      }
    }

    // PERF-IMPORT-2: one parish-scoped snapshot replaces one code lookup per
    // created row. The database UNIQUE(parish_id, code) remains the final guard.
    const existingCodes = await db
      .select({ code: students.code })
      .from(students)
      .where(eq(students.parishId, parishId))
    const reservedCodes = new Set(existingCodes.map(row => row.code))
    const codeFallbackCursors = new Map<string, number>()
    const academicYearLookupCache = new Map<string, Promise<string | null>>()
    const getCachedAcademicYear = (classId: string): Promise<string | null> => {
      const known = academicYearByClassId.get(classId)
      if (known) return Promise.resolve(known)
      let pending = academicYearLookupCache.get(classId)
      if (!pending) {
        pending = getAcademicYearStart(classId, parishId)
        academicYearLookupCache.set(classId, pending)
      }
      return pending
    }

  function findKnownClassId(rowClassName: string): string | null {
    const trimmed = rowClassName.trim()
    if (!trimmed) return null
    const canon = canonicalClassKey(trimmed)
    const mapped = normClassMappings.get(canon) ?? classMappings[trimmed]
    if (mapped && eligibleClassIds.has(mapped)) {
      if (allowedClassSet != null && !allowedClassSet.has(mapped)) return null
      return mapped
    }

    const cached = classIdMap.get(canon)
    if (cached) {
      if (allowedClassSet != null && !allowedClassSet.has(cached)) return null
      return cached
    }

    const matchingClasses = allClasses.filter(c => canonicalClassKey(c.name) === canon || canonicalClassKey(c.code) === canon)
    if (matchingClasses.length !== 1) return null
    const [existed] = matchingClasses
    if (allowedClassSet != null && !allowedClassSet.has(existed.id)) return null
    classIdMap.set(canon, existed.id)
    if (!canonicalToOriginalImport.has(canon)) canonicalToOriginalImport.set(canon, trimmed)
    return existed.id
  }

  function resolveImportMembershipBranch(row: ImportRow, classId: string): StudentBranch {
    const requested = row.branch.trim()
    if (requested && !STUDENT_BRANCHES.includes(requested as StudentBranch)) {
      throw Object.assign(new Error(`Phân ngành không hợp lệ: ${requested}`), { code: 'BRANCH_INVALID' })
    }
    const targetBranch = classBranchById.get(classId)
    if (!targetBranch) {
      if (requested) return requested as StudentBranch
      throw Object.assign(new Error('Không xác định được phân ngành của lớp; cần chọn phân ngành rõ ràng'), { code: 'CLASS_BRANCH_UNRESOLVED' })
    }
    if (requested && requested !== targetBranch) {
      throw Object.assign(
        new Error(`Phân ngành học viên (${requested}) không khớp phân ngành lớp (${targetBranch})`),
        { code: 'BRANCH_CLASS_MISMATCH' },
      )
    }
    return targetBranch
  }

  type PreparedCreate = {
    row: ImportRow
    student: typeof students.$inferSelect
    audit: typeof auditLogs.$inferInsert
    batchStudent: typeof importBatchStudents.$inferInsert
    serviceAssignment?: typeof serviceAssignments.$inferInsert
  }

  const fastCreateCandidates: PreparedCreate[] = []
  const remainingRows: ImportRow[] = []
  for (const row of normalizedRows) {
    const preliminaryErrors = validateRow(row, false)
    const classId = preliminaryErrors.length === 0 ? findKnownClassId(row.className || '') : null
    if (preliminaryErrors.length > 0 || dupMap.has(row.rowIndex) || !classId) {
      remainingRows.push(row)
      continue
    }
    try {
      row.branch = resolveImportMembershipBranch(row, classId)
    } catch {
      remainingRows.push(row)
      continue
    }
    const validationErrors = validateRow(row)
    if (validationErrors.length > 0) {
      remainingRows.push(row)
      continue
    }

    const year = await getCachedAcademicYear(classId) || String(new Date().getFullYear())
    const now = new Date().toISOString()
    const studentId = generateId('ST')
    const student: typeof students.$inferSelect = {
      id: studentId,
      code: reserveStudentCode(year, reservedCodes, codeFallbackCursors),
      holyName: row.holyName,
      fullName: row.fullName,
      gender: row.gender as (typeof students.$inferSelect)['gender'],
      dateOfBirth: row.dateOfBirth,
      baptismDate: null,
      firstCommunionDate: null,
      confirmationDate: null,
      parentName: row.parentName,
      parentPhone: row.parentPhone,
      address: row.address || '',
      branch: row.branch as (typeof students.$inferSelect)['branch'],
      classId,
      avatarUrl: null,
      status: 'Đang học',
      notes: null,
      deletedAt: null,
      idempotencyKey: null,
      parishId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    }
    const rollbackSnapshot: ImportRollbackSnapshot = { version: 1, kind: 'created', appliedUpdatedAt: now }
    fastCreateCandidates.push({
      row,
      student,
      audit: {
        id: generateId('AUD'), userId, action: 'IMPORT_CREATE', entityType: 'student',
        entityId: studentId,
        newValue: JSON.stringify({ ...(redactStudentForAudit(row) as Record<string, unknown>), importBatchId: batchId, importRowIndex: row.rowIndex }),
        ip, userAgent, parishId,
      },
      batchStudent: {
        id: generateId('IBS'), batchId, studentId, action: 'created', rowIndex: row.rowIndex, parishId,
        rollbackSnapshot: JSON.stringify(rollbackSnapshot),
      },
      serviceAssignment: detectService(row) === 'yes' && !serviceExclusions.has(row.rowIndex)
        ? { id: generateId('SA'), studentId, serviceType: 'le_phuc_vu', parishId, createdBy: userId }
        : undefined,
    })
  }

  const rowOutcomes: ImportRowOutcome[] = []
  const FAST_CREATE_CHUNK_SIZE = 40
  for (let index = 0; index < fastCreateCandidates.length; index += FAST_CREATE_CHUNK_SIZE) {
    const chunk = fastCreateCandidates.slice(index, index + FAST_CREATE_CHUNK_SIZE)
    try {
      await db.transaction(async (tx) => {
        const chunkClassIds = [...new Set(chunk.map(item => item.student.classId))]
        // V-01: commit-time year liveness — closes the validate-then-write
        // window for long imports finalized mid-flight.
        await assertImportYearStillOpen(tx, parishId, academicYearId)
        const activeTargets = await tx.select({ id: classes.id, branchId: classes.branchId, branchName: branches.name })
          .from(classes)
          .leftJoin(branches, and(eq(branches.id, classes.branchId), eq(branches.parishId, classes.parishId)))
          .where(and(eq(classes.parishId, parishId), inArray(classes.id, chunkClassIds), isNull(classes.deletedAt)))
        if (activeTargets.length !== chunkClassIds.length) throw new Error('Có lớp import đã bị xóa trước khi ghi học viên')
        const activeBranches = new Map(activeTargets.map(target => [target.id, resolveStudentBranch(target.branchId, target.branchName)]))
        for (const item of chunk) {
          const targetBranch = activeBranches.get(item.student.classId)
          if (targetBranch && targetBranch !== item.student.branch) throw new Error('Phân ngành học viên không còn khớp lớp tại thời điểm ghi')
        }
        await tx.insert(students).values(chunk.map(item => item.student))
        await tx.insert(auditLogs).values(chunk.map(item => item.audit))
        await recordImportBatchRows(tx, chunk.map(item => item.batchStudent))
        const assignmentValues = chunk.flatMap(item => item.serviceAssignment ? [item.serviceAssignment] : [])
        if (assignmentValues.length > 0) {
          await tx.insert(serviceAssignments).values(assignmentValues).onConflictDoNothing()
        }
      })
      for (const item of chunk) {
        rowOutcomes.push({
          rowIndex: item.row.rowIndex,
          studentName: item.row.fullName,
          status: 'imported',
          errors: [],
          change: { action: 'created', student: item.student },
        })
      }
    } catch {
      // Preserve ADR-008 partial-success semantics: an unexpected constraint or
      // concurrent race rolls back the whole chunk, then each row is retried via
      // the existing isolated transaction path for an exact per-row outcome.
      remainingRows.push(...chunk.map(item => item.row))
    }
  }

  // PERF-IMPORT-1: bounded concurrency hides remote latency while preserving
  // per-row transactions, partial success, audit records, and exact rollback.
  // Shared maps are only synchronously reserved/mutated on the JS event loop.
  const CONCURRENCY = process.env.NODE_ENV === 'test' || process.env.VITEST ? 1 : 8
  const fallbackOutcomes = await mapConcurrent<ImportRow, ImportRowOutcome>(remainingRows, async (row) => {
    try {
      const duplicate = dupMap.get(row.rowIndex)
      const requestedDuplicateAction = duplicate ? (duplicateActions[String(row.rowIndex)] || 'skip') : 'create'
      const errors = validateRow(row, !duplicate || requestedDuplicateAction === 'create')
      if (errors.length > 0) {
        await db.transaction(tx => recordImportBatchRows(tx, [{ id: generateId('IBS'), batchId, action: 'error', rowIndex: row.rowIndex, parishId }]))
        return { rowIndex: row.rowIndex, studentName: row.fullName, status: 'error' as const, errors }
      }

      let rowResult: 'created' | 'updated' | 'skipped' | 'class_error' = 'class_error'
      let studentId = ''
      let rowFailureMessage = ''
      let committedChange: ImportStudentChange | undefined

      await db.transaction(async (tx) => {
        const dup = dupMap.get(row.rowIndex)
        // V-01: same commit-time year liveness as the fast-create chunks.
        await assertImportYearStillOpen(tx, parishId, academicYearId)
        // Server-authoritative fail-closed policy: a missing/tampered duplicate
        // decision can never silently create or overwrite a student.
        const dupAction = dup ? (duplicateActions[String(row.rowIndex)] || 'skip') : 'create'

        if (dup && dup.studentId !== 'intra-file' && allowedClassSet != null) {
          const [duplicateStudent] = await tx.select({ classId: students.classId }).from(students).where(and(
            eq(students.id, dup.studentId), eq(students.parishId, parishId), isNull(students.deletedAt),
          )).limit(1)
          if (!duplicateStudent || !allowedClassSet.has(duplicateStudent.classId)) {
            await recordImportBatchRows(tx, [{ id: generateId('IBS'), batchId, action: 'error', rowIndex: row.rowIndex, parishId }])
            rowFailureMessage = 'Có hồ sơ tương tự ngoài phạm vi lớp được phân công; vui lòng nhờ quản trị viên kiểm tra'
            rowResult = 'class_error'
            return
          }
        }

        if (dup && dupAction === 'skip') {
          await recordImportBatchRows(tx, [{
            id: generateId('IBS'), batchId,
            studentId: dup.studentId === 'intra-file' ? null : dup.studentId,
            action: 'skipped', rowIndex: row.rowIndex, parishId,
          }])
          rowResult = 'skipped'
          return
        }

        const classId = findKnownClassId(row.className || '')
        if (!classId) {
          await recordImportBatchRows(tx, [{ id: generateId('IBS'), batchId, action: 'error', rowIndex: row.rowIndex, parishId }])
          rowResult = 'class_error'
          return
        }

        if (dup && dupAction === 'update') {
          if (dup.studentId === 'intra-file') {
            await recordImportBatchRows(tx, [{ id: generateId('IBS'), batchId, action: 'error', rowIndex: row.rowIndex, parishId }])
            rowResult = 'class_error'
            rowFailureMessage = 'Không thể cập nhật từ dòng trùng trong cùng file; hãy chọn Bỏ qua hoặc Tạo mới'
            return
          }
          studentId = dup.studentId
          const now = new Date().toISOString()
          const [existingStudent] = await tx
            .select()
            .from(students)
            .where(and(eq(students.id, studentId), eq(students.parishId, parishId)))
            .limit(1)

          if (allowedClassSet != null && (!existingStudent || !allowedClassSet.has(existingStudent.classId))) {
            await recordImportBatchRows(tx, [{ id: generateId('IBS'), batchId, studentId, action: 'error', rowIndex: row.rowIndex, parishId }])
            rowResult = 'class_error'
            return
          }

          if (!existingStudent || existingStudent.deletedAt) {
            await recordImportBatchRows(tx, [{ id: generateId('IBS'), batchId, action: 'error', rowIndex: row.rowIndex, parishId }])
            rowResult = 'class_error'
            return
          }

          const [previousService] = await tx
            .select({ id: serviceAssignments.id })
            .from(serviceAssignments)
            .where(and(
              eq(serviceAssignments.studentId, studentId),
              eq(serviceAssignments.serviceType, 'le_phuc_vu'),
              eq(serviceAssignments.parishId, parishId),
            ))
            .limit(1)

          const provided = providedFieldsByRow.get(row.rowIndex) || new Set<keyof ImportRow>()
          const membershipBranch = await resolveMembershipBranch(
            tx,
            parishId,
            classId,
            provided.has('branch') ? row.branch : (classId === existingStudent.classId ? existingStudent.branch : undefined),
          )
          const updateData = {
            holyName: provided.has('holyName') ? row.holyName.trim() : existingStudent.holyName,
            fullName: row.fullName.trim(),
            gender: (provided.has('gender') ? row.gender : existingStudent.gender) as typeof existingStudent.gender,
            dateOfBirth: provided.has('dateOfBirth') ? row.dateOfBirth : existingStudent.dateOfBirth,
            parentName: provided.has('parentName') ? row.parentName : existingStudent.parentName,
            parentPhone: provided.has('parentPhone') ? row.parentPhone : existingStudent.parentPhone,
            address: provided.has('address') ? row.address : existingStudent.address,
            branch: membershipBranch,
            classId,
            updatedBy: userId,
            updatedAt: now,
          }

          const [updatedStudent] = await tx.update(students)
            .set(updateData)
            .where(and(eq(students.id, studentId), eq(students.parishId, parishId)))
            .returning()
          if (!updatedStudent) throw new Error(`Không thể cập nhật học viên ở dòng ${row.rowIndex}`)
          await tx.insert(auditLogs).values({
            id: generateId('AUD'), userId, action: 'IMPORT_UPDATE', entityType: 'student',
            entityId: studentId,
            oldValue: existingStudent ? JSON.stringify(redactStudentForAudit(existingStudent)) : null,
            newValue: JSON.stringify({ ...(redactStudentForAudit(updateData) as Record<string, unknown>), importBatchId: batchId, importRowIndex: row.rowIndex }), ip, userAgent, parishId,
          })
          const rollbackSnapshot: ImportRollbackSnapshot = {
            version: 1,
            kind: 'updated',
            appliedUpdatedAt: now,
            previousStudent: existingStudent,
            previousServiceAssigned: Boolean(previousService),
          }
          await recordImportBatchRows(tx, [{
            id: generateId('IBS'), batchId, studentId, action: 'updated', rowIndex: row.rowIndex, parishId,
            rollbackSnapshot: JSON.stringify(rollbackSnapshot),
          }])
          // Gộp serviceAssignments vào cùng tx để giảm 1 round-trip
          if (detectService(row) === 'yes' && !serviceExclusions.has(row.rowIndex)) {
            await tx.insert(serviceAssignments).values({ id: generateId('SA'), studentId, serviceType: 'le_phuc_vu', parishId, createdBy: userId }).onConflictDoNothing()
          } else {
            await tx.delete(serviceAssignments).where(and(
              eq(serviceAssignments.studentId, studentId),
              eq(serviceAssignments.serviceType, 'le_phuc_vu'),
              eq(serviceAssignments.parishId, parishId),
            ))
          }
          committedChange = { action: 'updated', student: updatedStudent }
          rowResult = 'updated'
          return
        }

        studentId = generateId('ST')
        const year = await getCachedAcademicYear(classId) || String(new Date().getFullYear())
        const code = reserveStudentCode(year, reservedCodes, codeFallbackCursors)
        const now = new Date().toISOString()
        const membershipBranch = await resolveMembershipBranch(tx, parishId, classId, row.branch)

        const [createdStudent] = await tx.insert(students).values({
          id: studentId, code, holyName: row.holyName, fullName: row.fullName,
          gender: row.gender as any, dateOfBirth: row.dateOfBirth,
          parentName: row.parentName, parentPhone: row.parentPhone,
          address: row.address || '', branch: membershipBranch, classId,
          parishId, updatedBy: userId, createdAt: now, updatedAt: now,
        }).returning()
        if (!createdStudent) throw new Error(`Không thể tạo học viên ở dòng ${row.rowIndex}`)
        await tx.insert(auditLogs).values({
          id: generateId('AUD'), userId, action: 'IMPORT_CREATE', entityType: 'student',
          entityId: studentId,
          newValue: JSON.stringify({ ...(redactStudentForAudit(row) as Record<string, unknown>), importBatchId: batchId, importRowIndex: row.rowIndex }),
          ip, userAgent, parishId,
        })
        const rollbackSnapshot: ImportRollbackSnapshot = { version: 1, kind: 'created', appliedUpdatedAt: now }
        await recordImportBatchRows(tx, [{
          id: generateId('IBS'), batchId, studentId, action: 'created', rowIndex: row.rowIndex, parishId,
          rollbackSnapshot: JSON.stringify(rollbackSnapshot),
        }])
        if (detectService(row) === 'yes' && !serviceExclusions.has(row.rowIndex)) {
          await tx.insert(serviceAssignments).values({ id: generateId('SA'), studentId, serviceType: 'le_phuc_vu', parishId, createdBy: userId }).onConflictDoNothing()
        }
        committedChange = { action: 'created', student: createdStudent }
        rowResult = 'created'
      })

      if (rowResult === 'class_error') return { rowIndex: row.rowIndex, studentName: row.fullName, status: 'error' as const, errors: [rowFailureMessage || `Không xác định được lớp: ${row.className}`] }
      if (rowResult === 'skipped') return { rowIndex: row.rowIndex, studentName: row.fullName, status: 'skipped' as const, errors: [] as string[] }
      // created / updated đều là imported
      return { rowIndex: row.rowIndex, studentName: row.fullName, status: 'imported' as const, errors: [] as string[], change: committedChange }
    } catch (err: any) {
      try {
        await db.transaction(tx => recordImportBatchRows(tx, [{ id: generateId('IBS'), batchId, action: 'error', rowIndex: row.rowIndex, parishId }]))
      } catch {}
      return { rowIndex: row.rowIndex, studentName: row.fullName, status: 'error' as const, errors: [err?.message || 'Lỗi không xác định'] }
    }
  }, CONCURRENCY)
  rowOutcomes.push(...fallbackOutcomes)

  // Aggregate kết quả theo rowIndex để report có thứ tự
  rowOutcomes.sort((a, b) => a.rowIndex - b.rowIndex)
  for (const o of rowOutcomes) {
    result.report.push({ rowIndex: o.rowIndex, studentName: o.studentName, status: o.status, errors: o.errors })
    if (o.status === 'error') result.errors++
    else if (o.status === 'skipped') result.skipped++
    else if (o.status === 'imported') {
      result.imported++
      if (o.change) result.studentChanges.push(o.change)
    }
  }

  // Update import_batches with final counts and status
  let finalStatus: 'completed' | 'partial' | 'failed' = 'completed'
  if (result.errors > 0) {
    finalStatus = (result.imported > 0 || result.skipped > 0) ? 'partial' : 'failed'
  }

  // Save class name mappings for learning (scope by academic year)
  const ayId = academicYearId
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

  await db.transaction(async (tx) => {
    if (finalStatus === 'failed' && createdClassIds.length > 0) {
      const cleanup = await cleanupUnreferencedImportClasses(tx, createdClassIds, parishId, userId, batchId)
      if (cleanup.blocked.length > 0) result.orphanClasses = cleanup.blocked
    } else if (mappingValues.length > 0) {
      await tx.insert(mappingMemory).values(mappingValues).onConflictDoNothing()
    }

    await tx.update(importBatches).set({
      classesCreated: JSON.stringify(result.classesCreated || []),
      createdClassIds: JSON.stringify(createdClassIds),
    }).where(and(eq(importBatches.id, batchId), eq(importBatches.parishId, parishId)))
    const finalized = await finalizeImportBatchFromRows(tx, batchId, parishId, input.rows.length)
    if (finalized.status !== finalStatus
      || finalized.imported !== result.imported
      || finalized.skipped !== result.skipped
      || finalized.errors !== result.errors) {
      throw new Error('Import outcome metadata does not match committed row provenance')
    }
  })

  // Detect orphan classes (created but have 0 students)
  if (classIdMap.size > 0) {
    const candidateClassIds = [...new Set(classIdMap.values())]
    const activeCreatedClasses = await db.select({ id: classes.id }).from(classes).where(and(
      eq(classes.parishId, parishId), inArray(classes.id, candidateClassIds), isNull(classes.deletedAt),
    ))
    const newClassIds = activeCreatedClasses.map(item => item.id)
    if (newClassIds.length === 0) return result
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
    await db.transaction(async (tx) => {
      if (createdClassIds.length > 0) {
        const cleanup = await cleanupUnreferencedImportClasses(tx, createdClassIds, parishId, userId, batchId)
        if (cleanup.blocked.length > 0) result.orphanClasses = cleanup.blocked
      }
      await finalizeImportBatchFromRows(tx, batchId, parishId, input.rows.length)
    })
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

function reserveStudentCode(
  year: string,
  reservedCodes: Set<string>,
  fallbackCursors: Map<string, number>,
): string {
  for (let attempt = 0; attempt < 32; attempt++) {
    const code = `TN${year}${generateStudentCodeSuffix()}`
    if (!reservedCodes.has(code)) {
      reservedCodes.add(code)
      return code
    }
  }

  let cursor = fallbackCursors.get(year) ?? (Date.now() % 1_000_000)
  for (let attempt = 0; attempt < 1_000_000; attempt++) {
    const code = `TN${year}${String(cursor).padStart(6, '0')}`
    cursor = (cursor + 1) % 1_000_000
    if (!reservedCodes.has(code)) {
      fallbackCursors.set(year, cursor)
      reservedCodes.add(code)
      return code
    }
  }

  throw new Error(`Đã hết mã học viên khả dụng cho năm ${year}`)
}

const ROSTER_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000

export async function clearExpiredImportRollbackSnapshots(parishId?: string): Promise<void> {
  const cutoff = new Date(Date.now() - ROSTER_UNDO_WINDOW_MS).toISOString()
  const conditions = [
    sql`${importBatchStudents.batchId} IN (
      SELECT id FROM import_batches
      WHERE import_batches.parish_id = import_batch_students.parish_id
        AND created_at < ${cutoff}
    )`,
  ]
  if (parishId) conditions.push(eq(importBatchStudents.parishId, parishId))
  await db.update(importBatchStudents)
    .set({ rollbackSnapshot: null })
    .where(and(...conditions))
}

export async function runImportMaintenanceCycle(): Promise<void> {
  await recoverInterruptedImportBatchesForAllParishes()
  await clearExpiredImportRollbackSnapshots()
}

let rollbackCleanupTimer: ReturnType<typeof setInterval> | null = null

export function startImportRollbackSnapshotCleanup(intervalMs = 60 * 60 * 1000, runImmediately = true): () => void {
  if (rollbackCleanupTimer) return () => {}
  const run = () => void runImportMaintenanceCycle().catch((error) => {
    console.error('[import] maintenance cycle failed', error)
  })
  if (runImmediately) run()
  rollbackCleanupTimer = setInterval(run, intervalMs)
  rollbackCleanupTimer.unref?.()
  return () => {
    if (rollbackCleanupTimer) clearInterval(rollbackCleanupTimer)
    rollbackCleanupTimer = null
  }
}

function parseRollbackSnapshot(raw: string | null): ImportRollbackSnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ImportRollbackSnapshot>
    if (parsed.version !== 1 || !['created', 'updated'].includes(parsed.kind || '') || !parsed.appliedUpdatedAt) return null
    return parsed as ImportRollbackSnapshot
  } catch {
    return null
  }
}

async function hasStudentActivityAfterImport(
  tx: DbTransaction,
  studentId: string,
  parishId: string,
  appliedAt: string,
  importedParentPhone: string,
): Promise<boolean> {
  const checks = [
    () => tx.select({ id: grades.id }).from(grades).where(and(
      eq(grades.studentId, studentId), eq(grades.parishId, parishId),
      or(gte(grades.createdAt, appliedAt), gte(grades.updatedAt, appliedAt)),
    )).limit(1),
    () => tx.select({ id: attendance.id }).from(attendance).where(and(
      eq(attendance.studentId, studentId), eq(attendance.parishId, parishId),
      or(gte(attendance.createdAt, appliedAt), gte(attendance.updatedAt, appliedAt)),
    )).limit(1),
    () => tx.select({ id: examResults.id }).from(examResults).where(and(
      eq(examResults.studentId, studentId), eq(examResults.parishId, parishId),
      or(gte(examResults.createdAt, appliedAt), gte(examResults.savedAt, appliedAt)),
    )).limit(1),
    () => tx.select({ id: promotionRecords.id }).from(promotionRecords).where(and(
      eq(promotionRecords.studentId, studentId), eq(promotionRecords.parishId, parishId),
      or(gte(promotionRecords.createdAt, appliedAt), gte(promotionRecords.updatedAt, appliedAt)),
    )).limit(1),
    () => tx.select({ id: academicYearSnapshots.id }).from(academicYearSnapshots).where(and(
      eq(academicYearSnapshots.studentId, studentId), eq(academicYearSnapshots.parishId, parishId),
      or(gte(academicYearSnapshots.createdAt, appliedAt), gte(academicYearSnapshots.updatedAt, appliedAt)),
    )).limit(1),
    () => tx.select({ id: assessmentEntries.id }).from(assessmentEntries).where(and(
      eq(assessmentEntries.studentId, studentId), eq(assessmentEntries.parishId, parishId),
      gte(assessmentEntries.createdAt, appliedAt),
    )).limit(1),
    () => tx.select({ id: leaveRequests.id }).from(leaveRequests).where(and(
      eq(leaveRequests.studentId, studentId), eq(leaveRequests.parishId, parishId),
      or(gte(leaveRequests.createdAt, appliedAt), gte(leaveRequests.updatedAt, appliedAt)),
    )).limit(1),
    () => tx.select({ id: studentFeeRecords.id }).from(studentFeeRecords).where(and(
      eq(studentFeeRecords.studentId, studentId), eq(studentFeeRecords.parishId, parishId),
      or(gte(studentFeeRecords.createdAt, appliedAt), gte(studentFeeRecords.updatedAt, appliedAt)),
    )).limit(1),
    // Manual finance entries may reference a student without a student-fee row.
    // Undoing a newly imported student would otherwise soft-delete the roster
    // identity while leaving a later receipt/expense linked to hidden history.
    () => tx.select({ id: financialTransactions.id }).from(financialTransactions).where(and(
      eq(financialTransactions.studentId, studentId), eq(financialTransactions.parishId, parishId),
      gte(financialTransactions.createdAt, appliedAt),
    )).limit(1),
    // A8-05 (audit 2026-09-19 follow-up): lễ phục vụ assignments created
    // after the import are downstream activity too. Without this guard, undo
    // of a `created` row unconditionally deleted them, silently losing
    // post-import service history. Pre-existing assignments (created before
    // appliedAt) still flow through snapshot restore below.
    () => tx.select({ id: serviceAssignments.id }).from(serviceAssignments).where(and(
      eq(serviceAssignments.studentId, studentId), eq(serviceAssignments.parishId, parishId),
      gte(serviceAssignments.createdAt, appliedAt),
    )).limit(1),
  ]
  for (const check of checks) {
    if ((await check()).length > 0) return true
  }

  // Parent ownership is an implicit phone link rather than a foreign key.
  // If an account was provisioned, or an existing account was relinked to the
  // imported phone after this row committed, undoing the student would silently
  // orphan that later identity decision. Historical phone values are redacted
  // in the audit log, so only the current evidenced link is considered here.
  const phoneVariants = phoneMatchVariants(importedParentPhone)
  if (phoneVariants.length > 0) {
    const linkedParents = await tx
      .select({ id: users.id, createdAt: users.createdAt })
      .from(users)
      .where(and(
        eq(users.parishId, parishId),
        eq(users.role, 'phuhuynh'),
        isNull(users.deletedAt),
        inArray(users.phone, phoneVariants),
      ))
    if (linkedParents.some(parent => parent.createdAt >= appliedAt)) return true
    if (linkedParents.length > 0) {
      const relink = await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(
        eq(auditLogs.parishId, parishId),
        eq(auditLogs.entityType, 'user'),
        eq(auditLogs.action, 'UPDATE_USER_PHONE'),
        inArray(auditLogs.entityId, linkedParents.map(parent => parent.id)),
        gte(auditLogs.createdAt, appliedAt),
      )).limit(1)
      if (relink.length > 0) return true
    }
  }
  return false
}

export async function undoImport(batchId: string, parishId: string, actorUserId: string): Promise<UndoImportResult> {
  await recoverInterruptedImportBatches(parishId)
  await clearExpiredImportRollbackSnapshots(parishId)
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.parishId, parishId)))
    .limit(1)

  if (!batch) throw new Error('Không tìm thấy batch import')
  if (!['completed', 'partial', 'partial_undone'].includes(batch.status)) throw new Error('Batch này đã được hoàn tác hoặc đang xử lý')

  const undoWindow = new Date(Date.now() - ROSTER_UNDO_WINDOW_MS).toISOString()
  if (batch.createdAt < undoWindow) throw new Error('Chỉ có thể hoàn tác trong vòng 24 giờ sau khi import')

  const result: UndoImportResult = { undone: 0, errors: [], items: [], classesDeleted: [] }

  await db.transaction(async (tx) => {
    const batchStudents = await tx
      .select()
      .from(importBatchStudents)
      .where(and(eq(importBatchStudents.batchId, batchId)))

    for (const bs of batchStudents) {
      if (!bs.studentId || !['created', 'updated'].includes(bs.action)) continue
      const snapshot = parseRollbackSnapshot(bs.rollbackSnapshot)
      if (!snapshot && batch.status === 'partial_undone') {
        result.items.push({ rowIndex: bs.rowIndex, studentId: bs.studentId, action: bs.action as 'created' | 'updated', status: 'already_undone' })
        continue
      }
      if (!snapshot || snapshot.kind !== bs.action) {
        const message = `Dòng ${bs.rowIndex}: thiếu snapshot hoàn tác an toàn; không thay đổi dữ liệu`
        result.errors.push(message)
        result.items.push({ rowIndex: bs.rowIndex, studentId: bs.studentId, action: bs.action as 'created' | 'updated', status: 'blocked', message })
        continue
      }

      const [current] = await tx.select().from(students).where(and(
        eq(students.id, bs.studentId), eq(students.parishId, parishId),
      )).limit(1)
      if (!current || current.deletedAt || current.updatedAt !== snapshot.appliedUpdatedAt) {
        const message = `Dòng ${bs.rowIndex}: học viên đã thay đổi sau import; từ chối hoàn tác để tránh mất dữ liệu`
        result.errors.push(message)
        result.items.push({ rowIndex: bs.rowIndex, studentId: bs.studentId, action: snapshot.kind, status: 'blocked', message })
        continue
      }

      const now = new Date().toISOString()
      const parentLinkCanChange = snapshot.kind === 'created'
        || snapshot.previousStudent?.parentPhone !== current.parentPhone
      if (await hasStudentActivityAfterImport(
        tx,
        bs.studentId,
        parishId,
        snapshot.appliedUpdatedAt,
        parentLinkCanChange ? current.parentPhone : '',
      )) {
        const message = `Dòng ${bs.rowIndex}: học viên đã có dữ liệu phát sinh sau import; không thể hoàn tác tự động`
        result.errors.push(message)
        result.items.push({ rowIndex: bs.rowIndex, studentId: bs.studentId, action: snapshot.kind, status: 'blocked', message })
        continue
      }
      if (snapshot.kind === 'created') {
        await tx.delete(serviceAssignments).where(and(
          eq(serviceAssignments.studentId, bs.studentId), eq(serviceAssignments.parishId, parishId),
        ))
        await tx.update(students).set({ deletedAt: now, updatedAt: now, updatedBy: actorUserId }).where(and(
          eq(students.id, bs.studentId), eq(students.parishId, parishId),
        ))
      } else {
        const previous = snapshot.previousStudent
        if (!previous) {
          result.errors.push(`Dòng ${bs.rowIndex}: snapshot cập nhật không đầy đủ; không thay đổi dữ liệu`)
          continue
        }
        await tx.update(students).set({
          code: previous.code, holyName: previous.holyName, fullName: previous.fullName,
          gender: previous.gender, dateOfBirth: previous.dateOfBirth,
          baptismDate: previous.baptismDate, firstCommunionDate: previous.firstCommunionDate,
          confirmationDate: previous.confirmationDate, parentName: previous.parentName,
          parentPhone: previous.parentPhone, address: previous.address, branch: previous.branch,
          classId: previous.classId, avatarUrl: previous.avatarUrl, status: previous.status,
          notes: previous.notes, deletedAt: previous.deletedAt, idempotencyKey: previous.idempotencyKey,
          updatedAt: now, updatedBy: actorUserId,
        }).where(and(eq(students.id, bs.studentId), eq(students.parishId, parishId)))

        if (snapshot.previousServiceAssigned) {
          await tx.insert(serviceAssignments).values({
            id: generateId('SA'), studentId: bs.studentId, serviceType: 'le_phuc_vu', parishId, createdBy: actorUserId,
          }).onConflictDoNothing()
        } else {
          await tx.delete(serviceAssignments).where(and(
            eq(serviceAssignments.studentId, bs.studentId), eq(serviceAssignments.serviceType, 'le_phuc_vu'),
            eq(serviceAssignments.parishId, parishId),
          ))
        }
      }

      await tx.insert(auditLogs).values({
        id: generateId('AUD'), userId: actorUserId, action: 'UNDO_IMPORT', entityType: 'student', entityId: bs.studentId,
        oldValue: JSON.stringify(redactStudentForAudit(current)),
        newValue: JSON.stringify({ batchId, rowIndex: bs.rowIndex, restored: snapshot.kind }), parishId,
      })
      await tx.update(importBatchStudents).set({ rollbackSnapshot: null }).where(and(
        eq(importBatchStudents.id, bs.id), eq(importBatchStudents.parishId, parishId),
      ))
      result.undone++
      result.items.push({ rowIndex: bs.rowIndex, studentId: bs.studentId, action: snapshot.kind, status: 'undone' })
    }

    let createdClassIds: string[] = []
    try { createdClassIds = JSON.parse(batch.createdClassIds || '[]') } catch {}
    for (const classId of createdClassIds) {
      const cleanup = await cleanupUnreferencedImportClasses(tx, [classId], parishId, actorUserId, batchId)
      if (cleanup.blocked.length > 0) {
        const blockers = await getClassDependencyBlockers(tx, classId, parishId)
        result.errors.push(`Lớp ${classId}: còn ${blockers.join(', ')}; không tự động xóa lớp`)
        continue
      }
      result.classesDeleted.push(classId)
    }

    const [remainingRollback] = await tx.select({ id: importBatchStudents.id }).from(importBatchStudents).where(and(
      eq(importBatchStudents.batchId, batchId), eq(importBatchStudents.parishId, parishId), isNotNull(importBatchStudents.rollbackSnapshot),
    )).limit(1)
    if (!remainingRollback && result.errors.length === 0) {
      await tx.update(importBatches)
        .set({ status: 'undone' })
        .where(and(eq(importBatches.id, batchId), eq(importBatches.parishId, parishId)))
    } else if (result.undone > 0 || batch.status === 'partial_undone') {
      await tx.update(importBatches)
        .set({ status: 'partial_undone' })
        .where(and(eq(importBatches.id, batchId), eq(importBatches.parishId, parishId)))
    }
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
  await recoverInterruptedImportBatches(parishId)
  await clearExpiredImportRollbackSnapshots(parishId)
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
