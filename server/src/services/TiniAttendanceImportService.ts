import { createHash } from 'node:crypto'
import { and, eq, inArray, isNull, lte, gte } from 'drizzle-orm'
import { z } from 'zod'
import { db, runDbTransaction, type DbTransaction } from '../db/index.js'
import {
  academicYears, attendance, auditLogs, classes, externalEntityLinks,
  externalImportItems, externalImportRuns, students,
} from '../db/schema.js'
import { attendanceApplicationService } from './AttendanceApplicationService.js'
import { createSemesterLockSpecification } from './policyAdapters.js'
import { isAttendanceDateLocked } from './academicYearService.js'
import { resolveAcademicYear, resolveSemester } from '../utils/academicYear.js'
import { isValidIsoDate } from '../utils/date.js'
import { generateId } from '../utils/id.js'
import { VersionConflictError } from '../domain/errors.js'
import type { AttendanceStatus } from '../domain/AttendanceRecord.js'
import type { ActorRole } from '../types/actor.js'

const observationSchema = z.object({
  externalStudentId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  studentName: z.string().trim().min(1).max(120),
  dateOfBirth: z.string().refine(isValidIsoDate).nullable().optional(),
  externalClassId: z.string().regex(/^l_[A-Za-z0-9_-]{1,64}$/).nullable(),
  className: z.string().trim().max(80),
  date: z.string().refine(isValidIsoDate),
  sourceTitle: z.string().trim().max(100),
  sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  late: z.boolean(),
}).strict()

const bundleSchema = z.object({
  format: z.literal('catevia-tini-dom-attendance'),
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  provider: z.literal('tini'),
  extractedAt: z.string().datetime(),
  sourcePageKind: z.literal('glv-attendance'),
  sourcePath: z.literal('/glv'),
  academicYear: z.object({
    externalId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    label: z.string().regex(/^\d{4}-\d{4}$/),
  }).strict(),
  scope: z.object({
    date: z.string().refine(isValidIsoDate),
    filter: z.string().trim().min(1).max(60),
    externalClassId: z.string().regex(/^l_[A-Za-z0-9_-]{1,64}$/).nullable(),
    className: z.string().trim().max(80),
  }).strict(),
  partial: z.boolean(),
  renderedStudentRows: z.number().int().min(0).max(1000),
  rowErrors: z.array(z.object({
    rowIndex: z.number().int().min(0).max(999),
    reason: z.enum(['student_id_unavailable_or_mismatch', 'attendance_badge_unavailable']),
  }).strict()).max(1000),
  observations: z.array(observationSchema).min(1).max(500),
}).strict()

export type TiniBundle = z.infer<typeof bundleSchema>
type Observation = TiniBundle['observations'][number]
type Normalized = { type: 'SundayMass' | 'CatechismClass'; status: AttendanceStatus }
export type Classification = 'new' | 'identical' | 'conflict' | 'unmapped' | 'unsupported' | 'locked' | 'invalid' | 'stale'
export type StudentProfileDifference = {
  field: 'displayName' | 'dateOfBirth' | 'classMembership'
  kind: 'formatting' | 'content' | 'birth_date' | 'membership'
  cateviaValue: string
  tiniValue: string
  recommendation: 'review_name_parts' | 'review_birth_date' | 'use_membership_correction_workflow'
  proposedClassId?: string
}
export type StudentProfileSuggestion = {
  externalStudentId: string
  targetStudentId: string
  targetStudentCode: string
  identityBasis: 'reviewed_external_id_link'
  differences: StudentProfileDifference[]
}
export type IdentityEvidence = 'class_name_exact' | 'class_link_reviewed' | 'name_exact'
  | 'date_of_birth_exact' | 'date_of_birth_missing' | 'name_differs'
  | 'class_differs' | 'name_similar' | 'date_of_birth_differs' | 'class_name_similar'
export type IdentityCandidate = {
  targetId: string
  targetCode: string
  targetName: string
  targetClassId: string
  targetClassName: string
  score: number
  evidence: IdentityEvidence[]
}
export type IdentityLinkSuggestion = {
  entityKind: 'student' | 'class'
  externalScope: string
  externalId: string
  sourceName: string
  sourceDateOfBirth?: string | null
  status: 'high_confidence' | 'review' | 'ambiguous' | 'not_found'
  recommendedTargetId: string | null
  candidates: IdentityCandidate[]
}

const TITLE_MAP: Record<string, Normalized> = {
  'Có mặt Thánh lễ': { type: 'SundayMass', status: 'Present' },
  'Có mặt Giáo lý': { type: 'CatechismClass', status: 'Present' },
  'Vắng có phép Thánh lễ': { type: 'SundayMass', status: 'AbsentExcused' },
  'Vắng có phép Giáo lý': { type: 'CatechismClass', status: 'AbsentExcused' },
  'Vắng không phép Thánh lễ': { type: 'SundayMass', status: 'AbsentUnexcused' },
  'Vắng không phép Giáo lý': { type: 'CatechismClass', status: 'AbsentUnexcused' },
}

function error(message: string, status = 400): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
function fingerprint(bundle: TiniBundle, item: Observation): string {
  const fields: unknown[] = [
    bundle.academicYear.externalId, item.externalStudentId, item.externalClassId,
    item.date, item.sourceTitle, item.late,
  ]
  if (bundle.schemaVersion >= 2) fields.push(item.studentName, item.className)
  if (bundle.schemaVersion >= 3) fields.push(item.dateOfBirth ?? null)
  return hash(JSON.stringify(fields))
}
function displayText(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim()
}
function identityText(value: string): string {
  return displayText(value).toLocaleLowerCase('vi').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}
function editSimilarity(left: string, right: string): number {
  if (left === right) return 1
  if (!left || !right) return 0
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + Number(left[leftIndex - 1] !== right[rightIndex - 1]),
      )
    }
    previous = current
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length)
}
function tokenDiceSimilarity(left: string, right: string): number {
  const leftTokens = [...new Set(left.split(' ').filter(Boolean))]
  const rightTokens = [...new Set(right.split(' ').filter(Boolean))]
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0
  const rightSet = new Set(rightTokens)
  const overlap = leftTokens.filter(token => rightSet.has(token)).length
  return (2 * overlap) / (leftTokens.length + rightTokens.length)
}
function ngramDiceSimilarity(left: string, right: string): number {
  const grams = (value: string) => new Set(value.length < 3
    ? [value]
    : Array.from({ length: value.length - 2 }, (_, index) => value.slice(index, index + 3)))
  const leftGrams = grams(left)
  const rightGrams = grams(right)
  if (leftGrams.has('') || rightGrams.has('')) return 0
  const overlap = [...leftGrams].filter(gram => rightGrams.has(gram)).length
  return (2 * overlap) / (leftGrams.size + rightGrams.size)
}
function textSimilarity(left: string, right: string): number {
  const normalizedLeft = identityText(left)
  const normalizedRight = identityText(right)
  if (!normalizedLeft || !normalizedRight) return 0
  return Math.max(
    editSimilarity(normalizedLeft, normalizedRight),
    tokenDiceSimilarity(normalizedLeft, normalizedRight),
    ngramDiceSimilarity(normalizedLeft, normalizedRight),
  )
}
function assertConsistentStudentProfiles(bundle: TiniBundle): void {
  const profiles = new Map<string, string>()
  const classNames = new Map<string, string>()
  for (const item of bundle.observations) {
    const profile = JSON.stringify([
      displayText(item.studentName), item.externalClassId, displayText(item.className),
      bundle.schemaVersion >= 3 ? item.dateOfBirth ?? null : null,
    ])
    const existing = profiles.get(item.externalStudentId)
    if (existing && existing !== profile) {
      throw error('Tệp chứa thông tin hồ sơ mâu thuẫn cho cùng một mã học viên TINI.')
    }
    profiles.set(item.externalStudentId, profile)
    if (item.externalClassId) {
      const className = displayText(item.className)
      const previousClassName = classNames.get(item.externalClassId)
      if (previousClassName !== undefined && previousClassName !== className) {
        throw error('Tệp chứa tên lớp mâu thuẫn cho cùng một mã lớp TINI.')
      }
      classNames.set(item.externalClassId, className)
    }
  }
}
function parse(raw: string): TiniBundle {
  if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024) throw error('Tệp vượt giới hạn 1 MB.', 413)
  let decoded: unknown
  try { decoded = JSON.parse(raw) } catch { throw error('Tệp JSON không hợp lệ.') }
  const parsed = bundleSchema.safeParse(decoded)
  if (!parsed.success) throw error('Định dạng tệp TINI không hợp lệ hoặc chứa trường không được phép.')
  const bundle = parsed.data
  if (bundle.schemaVersion >= 3
    && bundle.observations.some(item => !Object.prototype.hasOwnProperty.call(item, 'dateOfBirth'))) {
    throw error('Tệp TINI v3 thiếu trường ngày sinh đã được ràng buộc vào dấu vân tay.')
  }
  if (bundle.academicYear.label !== resolveAcademicYear(bundle.scope.date)) {
    throw error('Niên học trong tệp không khớp ngày điểm danh.')
  }
  if (!/^(Hiện diện|Vắng)/.test(bundle.scope.filter)) throw error('Bộ lọc nguồn không phải điểm danh.')
  if (bundle.observations.some(item => item.date !== bundle.scope.date
    || (bundle.scope.externalClassId && (item.externalClassId !== bundle.scope.externalClassId
      || item.className !== bundle.scope.className)))) {
    throw error('Dòng điểm danh không khớp phạm vi nguồn.')
  }
  if (bundle.observations.some(item => item.sourceFingerprint !== fingerprint(bundle, item))) {
    throw error('Dấu vân tay lượt điểm danh không khớp nội dung tệp.')
  }
  assertConsistentStudentProfiles(bundle)
  return bundle
}

async function buildStudentProfileSuggestions(
  tx: DbTransaction,
  parishId: string,
  bundle: TiniBundle,
): Promise<StudentProfileSuggestion[]> {
  // Schema v1 did not bind names/classes into sourceFingerprint, so those
  // values are unsuitable as the basis for a profile correction proposal.
  if (bundle.schemaVersion < 2) return []

  const observations = [...new Map(bundle.observations.map(item => [item.externalStudentId, item])).values()]
  const externalStudentIds = observations.map(item => item.externalStudentId)
  const externalClassIds = [...new Set(observations.flatMap(item => item.externalClassId ? [item.externalClassId] : []))]
  if (externalStudentIds.length === 0) return []

  const studentLinks = await tx.select().from(externalEntityLinks).where(and(
    eq(externalEntityLinks.parishId, parishId), eq(externalEntityLinks.provider, 'tini'),
    eq(externalEntityLinks.entityKind, 'student'), eq(externalEntityLinks.externalScope, ''),
    inArray(externalEntityLinks.externalId, externalStudentIds), isNull(externalEntityLinks.retiredAt),
  ))
  const classLinks = externalClassIds.length === 0 ? [] : await tx.select().from(externalEntityLinks).where(and(
    eq(externalEntityLinks.parishId, parishId), eq(externalEntityLinks.provider, 'tini'),
    eq(externalEntityLinks.entityKind, 'class'), eq(externalEntityLinks.externalScope, bundle.academicYear.externalId),
    inArray(externalEntityLinks.externalId, externalClassIds), isNull(externalEntityLinks.retiredAt),
  ))
  const targetStudentIds = [...new Set(studentLinks.map(link => link.targetId))]
  const targetClassIds = [...new Set(classLinks.map(link => link.targetId))]
  const targetStudents = targetStudentIds.length === 0 ? [] : await tx.select({
    id: students.id, code: students.code, holyName: students.holyName,
    fullName: students.fullName, dateOfBirth: students.dateOfBirth, classId: students.classId,
  }).from(students).where(and(eq(students.parishId, parishId),
    inArray(students.id, targetStudentIds), isNull(students.deletedAt)))
  const allClassIds = [...new Set([...targetClassIds, ...targetStudents.map(student => student.classId)])]
  const targetClasses = allClassIds.length === 0 ? [] : await tx.select({
    id: classes.id, name: classes.name,
  }).from(classes).where(and(eq(classes.parishId, parishId),
    inArray(classes.id, allClassIds), isNull(classes.deletedAt)))

  const studentLinkByExternalId = new Map(studentLinks.map(link => [link.externalId, link]))
  const classLinkByExternalId = new Map(classLinks.map(link => [link.externalId, link]))
  const studentById = new Map(targetStudents.map(student => [student.id, student]))
  const classById = new Map(targetClasses.map(targetClass => [targetClass.id, targetClass]))

  const suggestions: StudentProfileSuggestion[] = []
  for (const observation of observations) {
    const studentLink = studentLinkByExternalId.get(observation.externalStudentId)
    const student = studentLink ? studentById.get(studentLink.targetId) : undefined
    if (!studentLink || !student) continue

    const differences: StudentProfileDifference[] = []
    const tiniName = displayText(observation.studentName)
    const fullName = displayText(student.fullName)
    const combinedName = displayText(`${student.holyName} ${student.fullName}`)
    if (tiniName !== fullName && tiniName !== combinedName) {
      const normalizedTiniName = identityText(tiniName)
      const sameIdentity = normalizedTiniName === identityText(fullName)
        || normalizedTiniName === identityText(combinedName)
      differences.push({
        field: 'displayName',
        kind: sameIdentity ? 'formatting' : 'content',
        cateviaValue: combinedName,
        tiniValue: tiniName,
        recommendation: 'review_name_parts',
      })
    }

    if (bundle.schemaVersion >= 3 && observation.dateOfBirth
      && observation.dateOfBirth !== student.dateOfBirth) {
      differences.push({
        field: 'dateOfBirth', kind: 'birth_date',
        cateviaValue: student.dateOfBirth, tiniValue: observation.dateOfBirth,
        recommendation: 'review_birth_date',
      })
    }

    const classLink = observation.externalClassId
      ? classLinkByExternalId.get(observation.externalClassId)
      : undefined
    if (classLink && student.classId !== classLink.targetId) {
      differences.push({
        field: 'classMembership',
        kind: 'membership',
        cateviaValue: classById.get(student.classId)?.name ?? student.classId,
        tiniValue: classById.get(classLink.targetId)?.name ?? displayText(observation.className),
        recommendation: 'use_membership_correction_workflow',
        proposedClassId: classLink.targetId,
      })
    }
    if (differences.length > 0) {
      suggestions.push({
        externalStudentId: observation.externalStudentId,
        targetStudentId: student.id,
        targetStudentCode: student.code,
        identityBasis: 'reviewed_external_id_link',
        differences,
      })
    }
  }
  return suggestions
}

async function buildIdentityLinkSuggestions(
  tx: DbTransaction,
  parishId: string,
  bundle: TiniBundle,
): Promise<IdentityLinkSuggestion[]> {
  if (bundle.schemaVersion < 2) return []

  const sourceStudents = [...new Map(bundle.observations.map(item => [item.externalStudentId, item])).values()]
  const sourceClasses = [...new Map(bundle.observations.flatMap(item => item.externalClassId
    ? [[item.externalClassId, item.className] as const]
    : [])).entries()]
  const activeLinks = await tx.select().from(externalEntityLinks).where(and(
    eq(externalEntityLinks.parishId, parishId), eq(externalEntityLinks.provider, 'tini'),
    isNull(externalEntityLinks.retiredAt),
  ))
  const linkedStudents = new Map(activeLinks.filter(link => link.entityKind === 'student')
    .map(link => [link.externalId, link]))
  const linkedClasses = new Map(activeLinks.filter(link => link.entityKind === 'class'
    && link.externalScope === bundle.academicYear.externalId).map(link => [link.externalId, link]))
  const occupiedStudentTargets = new Set([...linkedStudents.values()].map(link => link.targetId))
  const occupiedClassTargets = new Set([...linkedClasses.values()].map(link => link.targetId))

  const years = await tx.select({ id: academicYears.id, startDate: academicYears.startDate })
    .from(academicYears).where(eq(academicYears.parishId, parishId))
  const year = years.find(item => resolveAcademicYear(item.startDate) === bundle.academicYear.label)
  if (!year) return [...sourceClasses.filter(([externalId]) => !linkedClasses.has(externalId)).map(([externalId, sourceName]) => ({
    entityKind: 'class' as const, externalScope: bundle.academicYear.externalId,
    externalId, sourceName, status: 'not_found' as const, recommendedTargetId: null, candidates: [],
  })), ...sourceStudents.filter(item => !linkedStudents.has(item.externalStudentId)).map(item => ({
    entityKind: 'student' as const, externalScope: '', externalId: item.externalStudentId,
    sourceName: item.studentName, sourceDateOfBirth: bundle.schemaVersion >= 3 ? item.dateOfBirth ?? null : undefined,
    status: 'not_found' as const, recommendedTargetId: null, candidates: [],
  }))]

  const targetClasses = await tx.select({ id: classes.id, code: classes.code, name: classes.name })
    .from(classes).where(and(eq(classes.parishId, parishId),
      eq(classes.academicYearId, year.id), isNull(classes.deletedAt)))
  const classIds = targetClasses.map(item => item.id)
  const targetStudents = classIds.length === 0 ? [] : await tx.select({
    id: students.id, code: students.code, holyName: students.holyName, fullName: students.fullName,
    dateOfBirth: students.dateOfBirth, classId: students.classId,
  }).from(students).where(and(eq(students.parishId, parishId),
    inArray(students.classId, classIds), isNull(students.deletedAt)))
  const classById = new Map(targetClasses.map(item => [item.id, item]))
  const suggestions: IdentityLinkSuggestion[] = []
  const proposedClasses = new Map<string, string>()

  for (const [externalId, sourceName] of sourceClasses) {
    if (linkedClasses.has(externalId)) continue
    const ranked = targetClasses.filter(candidate => !occupiedClassTargets.has(candidate.id))
      .map(candidate => ({ candidate, similarity: textSimilarity(sourceName, candidate.name) }))
      .filter(entry => entry.similarity >= 0.5)
      .sort((a, b) => b.similarity - a.similarity
        || a.candidate.code.localeCompare(b.candidate.code, 'vi')
        || a.candidate.id.localeCompare(b.candidate.id))
    const top = ranked[0]
    const score = top ? Math.round(top.similarity * 100) : 0
    const secondScore = ranked[1] ? Math.round(ranked[1].similarity * 100) : 0
    const recommended = top && score >= 80 && score - secondScore >= 10 ? top.candidate : undefined
    const candidates: IdentityCandidate[] = ranked.slice(0, 5).map(({ candidate, similarity }) => ({
      targetId: candidate.id, targetCode: candidate.code, targetName: candidate.name,
      targetClassId: candidate.id, targetClassName: candidate.name,
      score: Math.round(similarity * 100),
      evidence: [similarity === 1 ? 'class_name_exact' : 'class_name_similar'],
    }))
    if (recommended) proposedClasses.set(externalId, recommended.id)
    suggestions.push({
      entityKind: 'class', externalScope: bundle.academicYear.externalId, externalId, sourceName,
      status: recommended ? 'review' : candidates.length > 1 ? 'ambiguous' : candidates.length ? 'review' : 'not_found',
      recommendedTargetId: recommended?.id ?? null, candidates,
    })
  }

  for (const item of sourceStudents) {
    if (linkedStudents.has(item.externalStudentId)) continue
    const existingClassLink = item.externalClassId ? linkedClasses.get(item.externalClassId) : undefined
    const effectiveClassId = existingClassLink?.targetId
      ?? (item.externalClassId ? proposedClasses.get(item.externalClassId) : undefined)
    const sourceName = identityText(item.studentName)
    const sourceDateOfBirth = bundle.schemaVersion >= 3 ? item.dateOfBirth ?? null : null
    const ranked = targetStudents.filter(candidate => !occupiedStudentTargets.has(candidate.id)).map(candidate => {
      const targetClass = classById.get(candidate.classId)
      const nameSimilarity = Math.max(
        textSimilarity(item.studentName, candidate.fullName),
        textSimilarity(item.studentName, `${candidate.holyName} ${candidate.fullName}`),
      )
      const nameMatches = sourceName === identityText(candidate.fullName)
        || sourceName === identityText(`${candidate.holyName} ${candidate.fullName}`)
      const reviewedClassMatches = Boolean(existingClassLink && candidate.classId === existingClassLink.targetId)
      const classNameExact = Boolean(targetClass && identityText(item.className) === identityText(targetClass.name))
      const classSimilarity = existingClassLink
        ? reviewedClassMatches ? 1 : 0
        : targetClass ? textSimilarity(item.className, targetClass.name) : 0
      const dateOfBirthMatches = Boolean(sourceDateOfBirth && candidate.dateOfBirth === sourceDateOfBirth)
      const dateOfBirthDiffers = Boolean(sourceDateOfBirth && candidate.dateOfBirth !== sourceDateOfBirth)
      const score = Math.max(0, Math.min(100,
        Math.round(nameSimilarity * 60)
          + (dateOfBirthMatches ? 25 : dateOfBirthDiffers ? -25 : 0)
          + Math.round(classSimilarity * 15)))
      const evidence: IdentityEvidence[] = []
      if (nameMatches) evidence.push('name_exact')
      else if (nameSimilarity >= 0.72) evidence.push('name_similar')
      else evidence.push('name_differs')
      if (dateOfBirthMatches) evidence.push('date_of_birth_exact')
      else if (dateOfBirthDiffers) evidence.push('date_of_birth_differs')
      else evidence.push('date_of_birth_missing')
      if (reviewedClassMatches) evidence.push('class_link_reviewed')
      else if (classNameExact) evidence.push('class_name_exact')
      else if (classSimilarity >= 0.72) evidence.push('class_name_similar')
      else if (effectiveClassId || item.className) evidence.push('class_differs')
      return { candidate, targetClass, nameMatches, nameSimilarity, classNameExact,
        reviewedClassMatches, classSimilarity, dateOfBirthMatches, score, evidence }
    })
    ranked.sort((a, b) => b.score - a.score
      || b.nameSimilarity - a.nameSimilarity
      || a.candidate.code.localeCompare(b.candidate.code, 'vi')
      || a.candidate.id.localeCompare(b.candidate.id))
    const candidates = ranked.filter(entry => entry.score >= 40).slice(0, 5).map(entry => ({
      targetId: entry.candidate.id, targetCode: entry.candidate.code,
      targetName: displayText(`${entry.candidate.holyName} ${entry.candidate.fullName}`),
      targetClassId: entry.candidate.classId,
      targetClassName: entry.targetClass?.name ?? entry.candidate.classId,
      score: entry.score,
      evidence: entry.evidence,
    }))
    const top = ranked[0]
    const second = ranked[1]
    const margin = top ? top.score - (second?.score ?? 0) : 0
    const recommended = top && top.score >= 70 && top.nameSimilarity >= 0.72 && margin >= 10
      ? top : undefined
    const highConfidence = Boolean(recommended && recommended.score === 100
      && recommended.nameMatches && recommended.dateOfBirthMatches
      && (recommended.classNameExact || recommended.reviewedClassMatches))
    suggestions.push({
      entityKind: 'student', externalScope: '', externalId: item.externalStudentId,
      sourceName: item.studentName,
      sourceDateOfBirth: bundle.schemaVersion >= 3 ? item.dateOfBirth ?? null : undefined,
      status: highConfidence ? 'high_confidence'
        : recommended ? 'review' : candidates.length > 1 ? 'ambiguous' : candidates.length ? 'review' : 'not_found',
      recommendedTargetId: recommended?.candidate.id ?? null,
      candidates,
    })
  }
  return suggestions
}

interface Decision {
  classification: Classification
  normalized: Normalized | null
  targetStudentId: string | null
  targetClassId: string | null
  mappingVersion: number | null
  classMappingVersion: number | null
  expectedVersion: number | null
  attendanceId: string | null
}

async function reconcile(tx: DbTransaction, parishId: string, bundle: TiniBundle, item: Observation, duplicate: boolean): Promise<Decision> {
  const base: Decision = { classification: 'invalid', normalized: null, targetStudentId: null, targetClassId: null,
    mappingVersion: null, classMappingVersion: null, expectedVersion: null, attendanceId: null }
  if (duplicate) return base
  const normalized = TITLE_MAP[item.sourceTitle]
  if (!normalized) return { ...base, classification: 'unsupported' }
  if (item.date > new Date().toISOString().slice(0, 10)) return base
  if ((bundle.scope.filter.startsWith('Hiện diện') && normalized.status !== 'Present')
    || (bundle.scope.filter.startsWith('Vắng') && normalized.status === 'Present')
    || (bundle.scope.filter.endsWith('Thánh lễ') && normalized.type !== 'SundayMass')
    || (bundle.scope.filter.endsWith('Giáo lý') && normalized.type !== 'CatechismClass')) return base
  base.normalized = normalized
  if (!item.externalClassId) return { ...base, classification: 'unmapped' }

  const [studentLink] = await tx.select().from(externalEntityLinks).where(and(
    eq(externalEntityLinks.parishId, parishId), eq(externalEntityLinks.provider, 'tini'),
    eq(externalEntityLinks.entityKind, 'student'), eq(externalEntityLinks.externalScope, ''),
    eq(externalEntityLinks.externalId, item.externalStudentId), isNull(externalEntityLinks.retiredAt),
  )).limit(1)
  const [classLink] = await tx.select().from(externalEntityLinks).where(and(
    eq(externalEntityLinks.parishId, parishId), eq(externalEntityLinks.provider, 'tini'),
    eq(externalEntityLinks.entityKind, 'class'), eq(externalEntityLinks.externalScope, bundle.academicYear.externalId),
    eq(externalEntityLinks.externalId, item.externalClassId), isNull(externalEntityLinks.retiredAt),
  )).limit(1)
  if (!studentLink || !classLink) return { ...base, classification: 'unmapped' }
  base.targetStudentId = studentLink.targetId
  base.targetClassId = classLink.targetId
  base.mappingVersion = studentLink.version
  base.classMappingVersion = classLink.version

  const [year] = await tx.select().from(academicYears).where(and(
    eq(academicYears.parishId, parishId), lte(academicYears.startDate, item.date), gte(academicYears.endDate, item.date),
  )).limit(1)
  if (!year || !['OPEN', 'SEMESTER_2_OPEN'].includes(year.status)) return { ...base, classification: 'locked' }
  const [student] = await tx.select({ classId: students.classId }).from(students).where(and(
    eq(students.parishId, parishId), eq(students.id, studentLink.targetId), isNull(students.deletedAt),
  )).limit(1)
  const [targetClass] = await tx.select({ id: classes.id, academicYearId: classes.academicYearId }).from(classes).where(and(
    eq(classes.parishId, parishId), eq(classes.id, classLink.targetId), isNull(classes.deletedAt),
  )).limit(1)
  if (!student || !targetClass || targetClass.academicYearId !== year.id) return { ...base, classification: 'invalid' }
  if (student.classId !== targetClass.id) return { ...base, classification: 'conflict' }
  const semester = resolveSemester(item.date)
  if (!(await createSemesterLockSpecification(tx).isSatisfiedBy(bundle.academicYear.label, semester, parishId))
    || await isAttendanceDateLocked(parishId, item.date, tx)) return { ...base, classification: 'locked' }

  const [current] = await tx.select({ id: attendance.id, version: attendance.version, status: attendance.status })
    .from(attendance).where(and(eq(attendance.parishId, parishId), eq(attendance.studentId, studentLink.targetId),
      eq(attendance.date, item.date), eq(attendance.type, normalized.type))).limit(1)
  if (!current) return { ...base, classification: 'new', expectedVersion: 0 }
  return { ...base, classification: current.status === normalized.status ? 'identical' : 'conflict',
    expectedVersion: current.version, attendanceId: current.id }
}

function duplicateIndexes(bundle: TiniBundle): Set<number> {
  const byKey = new Map<string, number[]>()
  bundle.observations.forEach((item, index) => {
    const type = TITLE_MAP[item.sourceTitle]?.type ?? item.sourceTitle
    const key = JSON.stringify([item.externalStudentId, item.date, type])
    byKey.set(key, [...(byKey.get(key) ?? []), index])
  })
  return new Set([...byKey.values()].filter(indexes => indexes.length > 1).flat())
}

export async function previewTiniAttendance(raw: string, actorId: string, parishId: string) {
  const bundle = parse(raw)
  const fileHash = hash(raw)
  const duplicates = duplicateIndexes(bundle)
  return runDbTransaction(async tx => {
    const decisions = [] as (Decision & { index: number; observationHash: string; observation: Observation })[]
    for (const [index, item] of bundle.observations.entries()) {
      decisions.push({ ...(await reconcile(tx, parishId, bundle, item, duplicates.has(index))),
        index, observationHash: fingerprint(bundle, item), observation: item })
    }
    const studentProfileSuggestions = await buildStudentProfileSuggestions(tx, parishId, bundle)
    const identityLinkSuggestions = await buildIdentityLinkSuggestions(tx, parishId, bundle)
    const previewDigest = hash(JSON.stringify(decisions.map(({ index, observationHash, classification, targetStudentId, targetClassId,
      mappingVersion, classMappingVersion, expectedVersion }) => [index, observationHash, classification,
      targetStudentId, targetClassId, mappingVersion, classMappingVersion, expectedVersion])))
    const runId = generateId('EIR')
    const now = new Date().toISOString()
    await tx.insert(externalImportRuns).values({ parishId, id: runId, provider: 'tini', fileHash,
      schemaVersion: bundle.schemaVersion, normalizationVersion: 1, actorId,
      sourceYear: bundle.academicYear.label, sourceClassId: bundle.scope.externalClassId,
      previewDigest, status: 'PREVIEW', createdAt: now })
    await tx.insert(externalImportItems).values(decisions.map(decision => ({
      parishId, id: generateId('EII'), runId, itemIndex: decision.index,
      observationHash: decision.observationHash,
      externalStudentId: decision.observation.externalStudentId, date: decision.observation.date,
      targetType: decision.normalized?.type ?? null, targetStatus: decision.normalized?.status ?? null,
      targetStudentId: decision.targetStudentId, targetClassId: decision.targetClassId,
      mappingVersion: decision.mappingVersion,
      classMappingVersion: decision.classMappingVersion, expectedVersion: decision.expectedVersion,
      classification: decision.classification, createdAt: now,
    })))
    await tx.insert(auditLogs).values({ id: generateId('AUD'), parishId, userId: actorId,
      action: 'PREVIEW_TINI_ATTENDANCE_IMPORT', entityType: 'external_import_run', entityId: runId,
      oldValue: null, newValue: JSON.stringify({ fileHash, rows: bundle.renderedStudentRows,
        observations: decisions.length, partial: bundle.partial,
        studentProfileSuggestionCount: studentProfileSuggestions.length,
        identityLinkSuggestionCount: identityLinkSuggestions.length }), createdAt: now })
    return { runId, previewDigest, partial: bundle.partial, renderedStudentRows: bundle.renderedStudentRows,
      rowErrors: bundle.rowErrors, sourceYear: bundle.academicYear.label,
      sourceSchemaVersion: bundle.schemaVersion,
      profileComparisonAvailable: bundle.schemaVersion >= 2,
      studentProfileSuggestions,
      identityLinkSuggestions,
      counts: decisions.reduce((counts, decision) => {
        counts[decision.classification] = (counts[decision.classification] ?? 0) + 1
        return counts
      }, {} as Partial<Record<Classification, number>>),
      items: decisions.map(({ index, observationHash, observation, classification, targetStudentId,
        expectedVersion, normalized }) => ({ index, observationHash, observation,
        classification, targetStudentId, expectedVersion, normalized })) }
  })
}

export async function commitTiniAttendance(raw: string, runId: string, selectedIndexes: number[],
  actor: { userId: string; parishId: string; role: ActorRole; epoch?: number },
) {
  const bundle = parse(raw)
  const fileHash = hash(raw)
  const duplicates = duplicateIndexes(bundle)
  if (selectedIndexes.length === 0 || selectedIndexes.length > 500
    || new Set(selectedIndexes).size !== selectedIndexes.length
    || selectedIndexes.some(index => !Number.isInteger(index) || index < 0 || index >= bundle.observations.length)) {
    throw error('Danh sách lượt được chọn không hợp lệ.')
  }
  return runDbTransaction(async tx => {
    const [run] = await tx.select().from(externalImportRuns).where(and(
      eq(externalImportRuns.parishId, actor.parishId), eq(externalImportRuns.id, runId),
    )).limit(1)
    if (!run || run.actorId !== actor.userId) throw error('Không tìm thấy lượt xem trước thuộc tài khoản này.', 404)
    if (run.fileHash !== fileHash) throw error('Tệp không khớp với lượt xem trước.', 409)

    const receipts = [] as { index: number; outcome: string; attendanceId?: string; version?: number }[]
    for (const index of selectedIndexes) {
      const [stored] = await tx.select().from(externalImportItems).where(and(
        eq(externalImportItems.parishId, actor.parishId), eq(externalImportItems.runId, runId),
        eq(externalImportItems.itemIndex, index),
      )).limit(1)
      if (!stored) throw error('Lượt điểm danh không thuộc bản xem trước.', 404)
      if (stored.observationHash !== fingerprint(bundle, bundle.observations[index])) {
        throw error('Nội dung lượt điểm danh đã thay đổi.', 409)
      }
      if (stored.receipt) {
        receipts.push(JSON.parse(stored.receipt) as typeof receipts[number])
        continue
      }
      if (stored.classification !== 'new' && stored.classification !== 'identical') {
        throw error('Chỉ có thể xác nhận lượt mới hoặc trùng khớp.', 409)
      }
      const current = await reconcile(tx, actor.parishId, bundle, bundle.observations[index], duplicates.has(index))
      let result: typeof receipts[number]
      if (current.classification !== stored.classification
        || current.targetStudentId !== stored.targetStudentId
        || current.targetClassId !== stored.targetClassId
        || current.mappingVersion !== stored.mappingVersion
        || current.classMappingVersion !== stored.classMappingVersion
        || current.expectedVersion !== stored.expectedVersion) {
        result = { index, outcome: 'stale' }
      } else if (current.classification === 'identical') {
        result = { index, outcome: 'identical', attendanceId: current.attendanceId ?? undefined,
          version: current.expectedVersion ?? undefined }
      } else {
        try {
          const record = await attendanceApplicationService.markAttendanceInTransaction(tx, {
            studentId: current.targetStudentId!, date: bundle.observations[index].date,
            type: current.normalized!.type, status: current.normalized!.status,
            version: 0, userId: actor.userId, parishId: actor.parishId,
            expected: { role: actor.role, epoch: actor.epoch },
            auditAction: 'IMPORT_TINI_ATTENDANCE',
            auditProvenance: { provider: 'tini', runId, observationHash: stored.observationHash,
              late: bundle.observations[index].late },
          })
          result = { index, outcome: 'created', attendanceId: record.id, version: record.version }
        } catch (cause) {
          if (cause instanceof VersionConflictError) result = { index, outcome: 'stale' }
          else throw cause
        }
      }
      await tx.update(externalImportItems).set({ receipt: JSON.stringify(result),
        attendanceId: result.attendanceId ?? null, committedAt: new Date().toISOString() })
        .where(and(eq(externalImportItems.parishId, actor.parishId), eq(externalImportItems.id, stored.id)))
      receipts.push(result)
    }
    await tx.update(externalImportRuns).set({ status: 'COMMITTED', committedAt: new Date().toISOString() })
      .where(and(eq(externalImportRuns.parishId, actor.parishId), eq(externalImportRuns.id, runId)))
    return { runId, receipts }
  })
}

export async function listTiniLinks(parishId: string) {
  return db.select().from(externalEntityLinks).where(and(eq(externalEntityLinks.parishId, parishId),
    eq(externalEntityLinks.provider, 'tini'), isNull(externalEntityLinks.retiredAt)))
}

export async function listTiniCandidates(parishId: string, sourceYear: string) {
  if (!/^\d{4}-\d{4}$/.test(sourceYear)) throw error('Thiếu niên học cần đối chiếu.')
  const years = await db.select({ id: academicYears.id, startDate: academicYears.startDate })
    .from(academicYears).where(eq(academicYears.parishId, parishId))
  const year = years.find(item => resolveAcademicYear(item.startDate) === sourceYear)
  if (!year) return { classes: [], students: [] }
  const targetClasses = await db.select({ id: classes.id, code: classes.code, name: classes.name })
    .from(classes).where(and(eq(classes.parishId, parishId),
      eq(classes.academicYearId, year.id), isNull(classes.deletedAt)))
  const targetStudents = await db.select({ id: students.id, code: students.code,
    fullName: students.fullName, classId: students.classId })
    .from(students).where(and(eq(students.parishId, parishId), isNull(students.deletedAt)))
  const classIds = new Set(targetClasses.map(item => item.id))
  return { classes: targetClasses, students: targetStudents.filter(item => classIds.has(item.classId)) }
}

type SaveTiniLinkInput = {
  parishId: string; actorId: string; entityKind: 'student' | 'class'; externalScope: string;
  externalId: string; targetId: string; expectedVersion: number; reason: string; sourceYearLabel?: string;
}

async function saveTiniLinkInTransaction(tx: DbTransaction, input: SaveTiniLinkInput) {
  if (input.entityKind === 'student' && input.externalScope !== '') throw error('Liên kết học viên không dùng phạm vi năm học.')
  if (input.entityKind === 'class' && (!input.externalScope || !input.sourceYearLabel)) throw error('Liên kết lớp cần niên học nguồn.')
  if (input.entityKind === 'student') {
    const [target] = await tx.select({ id: students.id }).from(students).where(and(
      eq(students.parishId, input.parishId), eq(students.id, input.targetId), isNull(students.deletedAt),
    )).limit(1)
    if (!target) throw error('Không tìm thấy học viên Catevia trong giáo xứ.', 404)
  } else {
    const [target] = await tx.select({ id: classes.id, startDate: academicYears.startDate,
      endDate: academicYears.endDate }).from(classes)
      .innerJoin(academicYears, and(eq(classes.parishId, academicYears.parishId),
        eq(classes.academicYearId, academicYears.id)))
      .where(and(eq(classes.parishId, input.parishId), eq(classes.id, input.targetId),
        isNull(classes.deletedAt))).limit(1)
    if (!target || resolveAcademicYear(target.startDate) !== input.sourceYearLabel) {
      throw error('Lớp Catevia không thuộc niên học nguồn.', 409)
    }
  }
  const [current] = await tx.select().from(externalEntityLinks).where(and(
    eq(externalEntityLinks.parishId, input.parishId), eq(externalEntityLinks.provider, 'tini'),
    eq(externalEntityLinks.entityKind, input.entityKind), eq(externalEntityLinks.externalScope, input.externalScope),
    eq(externalEntityLinks.externalId, input.externalId), isNull(externalEntityLinks.retiredAt),
  )).limit(1)
  if ((current?.version ?? 0) !== input.expectedVersion) throw error('Liên kết định danh đã thay đổi.', 409)
  const [targetLink] = await tx.select({ externalId: externalEntityLinks.externalId })
    .from(externalEntityLinks).where(and(eq(externalEntityLinks.parishId, input.parishId),
      eq(externalEntityLinks.provider, 'tini'), eq(externalEntityLinks.entityKind, input.entityKind),
      eq(externalEntityLinks.externalScope, input.externalScope),
      eq(externalEntityLinks.targetId, input.targetId), isNull(externalEntityLinks.retiredAt))).limit(1)
  if (targetLink && targetLink.externalId !== input.externalId) {
    throw error('Hồ sơ Catevia đã liên kết với một mã TINI khác.', 409)
  }
  const now = new Date().toISOString()
  const linkId = current?.id ?? generateId('EEL')
  if (current) {
    await tx.update(externalEntityLinks).set({ targetId: input.targetId, version: current.version + 1,
      reviewedBy: input.actorId, reviewReason: input.reason, updatedAt: now })
      .where(and(eq(externalEntityLinks.parishId, input.parishId), eq(externalEntityLinks.id, linkId),
        eq(externalEntityLinks.version, current.version)))
  } else {
    await tx.insert(externalEntityLinks).values({ parishId: input.parishId, id: linkId, provider: 'tini',
      entityKind: input.entityKind, externalScope: input.externalScope, externalId: input.externalId,
      targetId: input.targetId, version: 1, reviewedBy: input.actorId,
      reviewReason: input.reason, createdAt: now, updatedAt: now })
  }
  await tx.insert(auditLogs).values({ id: generateId('AUD'), parishId: input.parishId, userId: input.actorId,
    action: 'REVIEW_TINI_IDENTITY_LINK', entityType: 'external_entity_link', entityId: linkId,
    oldValue: current ? JSON.stringify({ targetId: current.targetId, version: current.version }) : null,
    newValue: JSON.stringify({ provider: 'tini', entityKind: input.entityKind,
      externalScope: input.externalScope, externalId: input.externalId, targetId: input.targetId,
      version: (current?.version ?? 0) + 1, reason: input.reason }), createdAt: now })
  return { id: linkId, version: (current?.version ?? 0) + 1 }
}

export async function saveTiniLink(input: SaveTiniLinkInput) {
  return runDbTransaction(tx => saveTiniLinkInTransaction(tx, input))
}

export async function saveSuggestedTiniLinks(input: {
  raw: string
  runId: string
  selected: { entityKind: 'student' | 'class'; externalId: string; targetId: string }[]
  reason: string
  parishId: string
  actorId: string
}) {
  const bundle = parse(input.raw)
  if (input.selected.length === 0 || input.selected.length > 500) throw error('Danh sách đề xuất được chọn không hợp lệ.')
  const keys = input.selected.map(item => `${item.entityKind}:${item.externalId}`)
  if (new Set(keys).size !== keys.length) throw error('Danh sách đề xuất chứa định danh trùng lặp.')
  return runDbTransaction(async tx => {
    const [run] = await tx.select().from(externalImportRuns).where(and(
      eq(externalImportRuns.parishId, input.parishId), eq(externalImportRuns.id, input.runId),
    )).limit(1)
    if (!run || run.actorId !== input.actorId || run.status !== 'PREVIEW') {
      throw error('Không tìm thấy lượt xem trước đang hoạt động thuộc tài khoản này.', 404)
    }
    if (run.fileHash !== hash(input.raw)) throw error('Tệp không khớp với lượt xem trước.', 409)

    const suggestions = await buildIdentityLinkSuggestions(tx, input.parishId, bundle)
    const suggestionByKey = new Map(suggestions.map(item => [`${item.entityKind}:${item.externalId}`, item]))
    const existingLinks = await tx.select().from(externalEntityLinks).where(and(
      eq(externalEntityLinks.parishId, input.parishId), eq(externalEntityLinks.provider, 'tini'),
      isNull(externalEntityLinks.retiredAt),
    ))
    const existingByKey = new Map(existingLinks.map(link => [
      `${link.entityKind}:${link.externalScope}:${link.externalId}`, link,
    ]))
    const ordered = [...input.selected].sort((a, b) => Number(a.entityKind === 'student') - Number(b.entityKind === 'student'))
    const links: { entityKind: 'student' | 'class'; externalId: string; targetId: string; id: string; version: number; outcome: 'created' | 'existing' }[] = []
    for (const selected of ordered) {
      const key = `${selected.entityKind}:${selected.externalId}`
      const externalScope = selected.entityKind === 'class' ? bundle.academicYear.externalId : ''
      const existing = existingByKey.get(`${selected.entityKind}:${externalScope}:${selected.externalId}`)
      if (existing) {
        if (existing.targetId !== selected.targetId) throw error('Liên kết định danh đã thay đổi.', 409)
        links.push({ ...selected, id: existing.id, version: existing.version, outcome: 'existing' })
        continue
      }
      const suggestion = suggestionByKey.get(key)
      if (!suggestion || suggestion.recommendedTargetId !== selected.targetId
        || !['high_confidence', 'review'].includes(suggestion.status)) {
        throw error('Đề xuất định danh không còn hợp lệ; hãy xem trước lại.', 409)
      }
      const saved = await saveTiniLinkInTransaction(tx, {
        parishId: input.parishId, actorId: input.actorId,
        entityKind: selected.entityKind,
        externalScope: selected.entityKind === 'class' ? bundle.academicYear.externalId : '',
        externalId: selected.externalId, targetId: selected.targetId, expectedVersion: 0,
        reason: input.reason,
        ...(selected.entityKind === 'class' ? { sourceYearLabel: bundle.academicYear.label } : {}),
      })
      links.push({ ...selected, ...saved, outcome: 'created' })
    }
    return { runId: input.runId, links }
  })
}

export async function retireTiniLink(input: { parishId: string; actorId: string; id: string; expectedVersion: number; reason: string }) {
  return runDbTransaction(async tx => {
    const [link] = await tx.select().from(externalEntityLinks).where(and(
      eq(externalEntityLinks.parishId, input.parishId), eq(externalEntityLinks.id, input.id),
      eq(externalEntityLinks.provider, 'tini'), isNull(externalEntityLinks.retiredAt),
    )).limit(1)
    if (!link) throw error('Không tìm thấy liên kết đang hoạt động.', 404)
    if (link.version !== input.expectedVersion) throw error('Liên kết định danh đã thay đổi.', 409)
    const now = new Date().toISOString()
    await tx.update(externalEntityLinks).set({ retiredAt: now, retiredBy: input.actorId,
      reviewReason: input.reason, version: link.version + 1, updatedAt: now })
      .where(and(eq(externalEntityLinks.parishId, input.parishId), eq(externalEntityLinks.id, input.id),
        eq(externalEntityLinks.version, link.version), isNull(externalEntityLinks.retiredAt)))
    await tx.insert(auditLogs).values({ id: generateId('AUD'), parishId: input.parishId, userId: input.actorId,
      action: 'RETIRE_TINI_IDENTITY_LINK', entityType: 'external_entity_link', entityId: input.id,
      oldValue: JSON.stringify({ targetId: link.targetId, version: link.version }),
      newValue: JSON.stringify({ retiredAt: now, version: link.version + 1, reason: input.reason }), createdAt: now })
    return { id: input.id, version: link.version + 1, retiredAt: now }
  })
}
