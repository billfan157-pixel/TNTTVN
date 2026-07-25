import type { BranchType, Student } from '../types'

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
  return `${startYear} - ${startYear + 1}`
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

export function checkPromotionEligibility(
  student: Student,
  avgScore: number | null,
  attendanceRate: number,
  _semester: number = 2
): PromotionEligibilityResult {
  const reasons: string[] = []

  if (avgScore === null) {
    reasons.push('Chưa có kết quả điểm học tập')
  } else if (avgScore < 5.0) {
    reasons.push(`ĐTB học tập chưa đạt (cần ≥ 5.0, hiện tại ${avgScore})`)
  }

  if (attendanceRate < 70) {
    reasons.push(`Tỷ lệ chuyên cần chưa đạt (cần ≥ 70%, hiện tại ${attendanceRate}%)`)
  }

  const nextBranch = getNextBranch(student.branch)
  const canPromote = reasons.length === 0

  return {
    canPromote,
    recommendedBranch: canPromote ? (nextBranch ?? undefined) : undefined,
    reasons,
  }
}

