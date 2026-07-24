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

export function getNextAcademicYear(currentYear: string): string {
  const match = currentYear.match(/(\d{4}) - (\d{4})/)
  if (!match) return getAcademicYear()
  const start = Number(match[1]) + 1
  return `${start} - ${start + 1}`
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

export function getNextBranch(currentBranch: BranchType): BranchType | null {
  const idx = BRANCH_ORDER.indexOf(currentBranch)
  if (idx < 0 || idx >= BRANCH_ORDER.length - 1) return null
  return BRANCH_ORDER[idx + 1]
}

export function isBranchProgression(currentBranch: BranchType, targetBranch: BranchType): boolean {
  const currentIdx = BRANCH_ORDER.indexOf(currentBranch)
  const targetIdx = BRANCH_ORDER.indexOf(targetBranch)
  return targetIdx > currentIdx
}

export interface PromotionResult {
  canPromote: boolean
  reasons: string[]
  recommendedBranch: BranchType | null
}

export function checkPromotionEligibility(
  student: Student,
  averageScore: number | null,
  attendanceRate: number | null,
  semester: 1 | 2
): PromotionResult {
  const reasons: string[] = []

  if (averageScore === null || averageScore === undefined) {
    reasons.push('Chưa có điểm trung bình')
  } else if (averageScore < 5.0) {
    reasons.push(`Điểm TB ${averageScore} < 5.0 (không đạt)`)
  }

  if (attendanceRate === null || attendanceRate === undefined) {
    reasons.push('Chưa có tỷ lệ chuyên cần')
  } else if (attendanceRate < 70) {
    reasons.push(`Chuyên cần ${attendanceRate}% < 70% (không đạt)`)
  }

  if (semester === 1) {
    reasons.push('Chỉ xét khi kết thúc học kỳ II')
  }

  const canPromote = reasons.length === 0

  let recommendedBranch: BranchType | null = null
  if (canPromote) {
    const age = getAge(student.dateOfBirth)
    const ageBranch = getBranchForAge(age)
    const currentBranchIdx = BRANCH_ORDER.indexOf(student.branch)
    if (ageBranch && BRANCH_ORDER.indexOf(ageBranch) > currentBranchIdx) {
      recommendedBranch = ageBranch
    } else if (currentBranchIdx < BRANCH_ORDER.length - 1) {
      recommendedBranch = BRANCH_ORDER[currentBranchIdx + 1]
    }
  }

  return { canPromote, reasons, recommendedBranch }
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

export function getClassIdForBranch(branch: BranchType, yearIndex: number = 0): string {
  const prefixMap: Record<BranchType, string> = {
    ChienCon: 'CC',
    AuNhi: 'AU',
    ThieuNhi: 'TN',
    NghiaSi: 'NS',
    HiepSi: 'HS',
  }
  const prefix = prefixMap[branch]
  return `${prefix}${yearIndex + 1}`
}

export function getSacramentYears(student: Student): { baptismYear: number | null; communionYear: number | null; confirmationYear: number | null } {
  return {
    baptismYear: student.baptismDate ? new Date(student.baptismDate).getFullYear() : null,
    communionYear: student.firstCommunionDate ? new Date(student.firstCommunionDate).getFullYear() : null,
    confirmationYear: student.confirmationDate ? new Date(student.confirmationDate).getFullYear() : null,
  }
}
