import type { BranchType, Student } from '../types'
import { parseClassHierarchy, detectBranchWeight } from './classSort'

const BRANCH_ORDER: BranchType[] = ['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi']
const BRANCH_AGE_RANGES: Record<BranchType, [number, number]> = {
  ChienCon: [4, 6],
  AuNhi: [7, 9],
  ThieuNhi: [10, 12],
  NghiaSi: [13, 15],
  HiepSi: [16, 18],
}

export function getAcademicYear(date: Date = new Date()): string {
  const startYear = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1
  return `${startYear}-${startYear + 1}`
}

export function getAge(dateOfBirth: string, reference: Date = new Date()): number {
  const dob = new Date(dateOfBirth)
  let age = reference.getFullYear() - dob.getFullYear()
  const monthDiff = reference.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < dob.getDate())) {
    age--
  }
  return age
}

export function getBranchForAge(age: number): BranchType | null {
  for (const branch of BRANCH_ORDER) {
    const [min, max] = BRANCH_AGE_RANGES[branch]
    if (age >= min && age <= max) return branch
  }
  return null
}

export interface SacramentStatus {
  baptism: { done: boolean; date: string | null }
  firstCommunion: { done: boolean; date: string | null }
  confirmation: { done: boolean; date: string | null }
  nextSacrament: string | null
}

export function getSacramentStatus(student: Student): SacramentStatus {
  const baptism = { done: !!student.baptismDate, date: student.baptismDate || null }
  const firstCommunion = { done: !!student.firstCommunionDate, date: student.firstCommunionDate || null }
  const confirmation = { done: !!student.confirmationDate, date: student.confirmationDate || null }

  let nextSacrament: string | null = null
  if (!baptism.done) nextSacrament = 'Rửa Tội'
  else if (!firstCommunion.done) nextSacrament = 'Rước Lễ Lần Đầu'
  else if (!confirmation.done) nextSacrament = 'Thêm Sức'
  else nextSacrament = 'Hoàn tất (đã lãnh nhận 3 Bí tích)'

  return { baptism, firstCommunion, confirmation, nextSacrament }
}

export function getNextBranch(currentBranch: BranchType): BranchType | null {
  const idx = BRANCH_ORDER.indexOf(currentBranch)
  if (idx >= 0 && idx < BRANCH_ORDER.length - 1) {
    return BRANCH_ORDER[idx + 1]
  }
  return null
}

export function getClassIdForBranch(branch: BranchType): string {
  switch (branch) {
    case 'ChienCon': return 'CC1'
    case 'AuNhi': return 'AU1'
    case 'ThieuNhi': return 'TN1'
    case 'NghiaSi': return 'NS1'
    case 'HiepSi': return 'HS1'
    default: return 'AU1'
  }
}

export interface PromotionEligibilityResult {
  canPromote: boolean
  recommendedBranch?: BranchType
  reasons: string[]
}

export interface PromotionPolicy {
  minGpa: number
  minAttendance: number
}

export const DEFAULT_PROMOTION_POLICY: PromotionPolicy = {
  minGpa: 5.0,
  minAttendance: 80,
}

/**
 * ADR-017: Ngưỡng xét thăng tiến dùng promotionPolicy (mặc định 5.0/80) —
 * khớp server DEFAULT_PROMOTION_POLICY và settings promotionPolicy.
 * Trước đây attendance hardcode 70% trong khi server dùng 80% → lệch quyết
 * định ở ngưỡng biên (70–80%).
 */
export function checkPromotionEligibility(
  student: Student,
  avgScore: number | null,
  attendanceRate: number,
  _semester: number = 2,
  policy: PromotionPolicy = DEFAULT_PROMOTION_POLICY
): PromotionEligibilityResult {
  const reasons: string[] = []

  if (avgScore === null) {
    reasons.push('Chưa có kết quả điểm học tập')
  } else if (avgScore < policy.minGpa) {
    reasons.push(`ĐTB học tập chưa đạt (cần ≥ ${policy.minGpa}, hiện tại ${avgScore})`)
  }

  if (attendanceRate < policy.minAttendance) {
    reasons.push(`Tỷ lệ chuyên cần chưa đạt (cần ≥ ${policy.minAttendance}%, hiện tại ${attendanceRate}%)`)
  }

  const nextBranch = getNextBranch(student.branch)
  const canPromote = reasons.length === 0

  return {
    canPromote,
    recommendedBranch: canPromote ? (nextBranch ?? undefined) : undefined,
    reasons,
  }
}

// ─── PROMO-FIX (2026-08-22): tính lớp đích khi thăng tiến ───
// Trước đây panel luôn nhảy sang NGÀNH kế tiếp và lấy lớp ĐẦU TIÊN của ngành đó
// (`existingClasses[0]`) → học sinh Thiếu Nhi 1A thăng tiến bị đưa vào lớp Nghĩa Sĩ
// tùy ý thay vì **Thiếu Nhi 2A**. Chuẩn TNTT: tăng khối +1 trong cùng ngành, giữ
// hậu tố phân ban khi có thể; chỉ chuyển ngành khi đã hết khối kế tiếp trong ngành.

export interface NextClassSuggestion {
  /** Lớp đích — null nếu không tìm thấy lớp phù hợp nào (admin cần tạo lớp trước) */
  classId: string | null
  /** Ngành đích — khác student.branch CHỈ khi chuyển ngành (hết cấp trong ngành) */
  nextBranch: BranchType | null
  matchedBy: 'grade-section' | 'grade' | 'branch-entry' | 'none'
}

interface ClassLike {
  id: string
  name: string
  branchId?: string
  branch?: string
}

export function computeNextClassForStudent(
  student: Pick<Student, 'classId' | 'branch'>,
  classes: ClassLike[]
): NextClassSuggestion {
  const current = classes.find((c) => c.id === student.classId)
  const cur = parseClassHierarchy(current?.name || '', current?.branchId || student.branch)

  // 1) Cùng ngành, khối lớp +1
  const sameBranchClasses = classes.filter((c) => {
    if (c.id === student.classId) return false
    const p = parseClassHierarchy(c.name, c.branchId || c.branch)
    return p.branchWeight !== 99 && p.branchWeight === cur.branchWeight
  })
  const nextGradeCandidates = sameBranchClasses.filter(
    (c) => parseClassHierarchy(c.name, c.branchId || c.branch).gradeNumber === cur.gradeNumber + 1
  )
  const byName = (a: ClassLike, b: ClassLike) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' })

  if (nextGradeCandidates.length > 0) {
    // Ưu tiên cùng hậu tố phân ban (1A → 2A); fallback khối +1 bất kỳ hậu tố (1A → 2B)
    const exactSection =
      cur.sectionSuffix !== ''
        ? nextGradeCandidates.find(
            (c) => parseClassHierarchy(c.name, c.branchId || c.branch).sectionSuffix === cur.sectionSuffix
          )
        : undefined
    const chosen = exactSection || [...nextGradeCandidates].sort(byName)[0]
    return { classId: chosen.id, nextBranch: null, matchedBy: exactSection ? 'grade-section' : 'grade' }
  }

  // 2) Hết cấp trong ngành → lớp nhập môn của ngành kế tiếp (khối thấp nhất hiện có)
  const nextBranchType = getNextBranch(student.branch as BranchType)
  if (nextBranchType) {
    const entryWeight = detectBranchWeight(nextBranchType)
    const entryCandidates = classes
      .filter((c) => {
        if (c.id === student.classId) return false
        const p = parseClassHierarchy(c.name, c.branchId || c.branch)
        return p.branchWeight === entryWeight
      })
      .sort((a, b) => {
        const pa = parseClassHierarchy(a.name, a.branchId || a.branch)
        const pb = parseClassHierarchy(b.name, b.branchId || b.branch)
        return pa.gradeNumber - pb.gradeNumber || byName(a, b)
      })
    if (entryCandidates.length > 0) {
      return { classId: entryCandidates[0].id, nextBranch: nextBranchType, matchedBy: 'branch-entry' }
    }
  }

  return { classId: null, nextBranch: null, matchedBy: 'none' }
}

