import type { Student } from '../types'
import type { ClassListItem } from '../stores/classStore'

/**
 * Bảng trọng số cấp bậc ngành TNTT (1: thấp nhất -> 5: cao nhất)
 */
export const BRANCH_HIERARCHY_WEIGHT: Record<string, number> = {
  ChienCon: 1,
  chiencon: 1,
  CC: 1,
  AuNhi: 2,
  aunhi: 2,
  AN: 2,
  AU: 2,
  ThieuNhi: 3,
  thieunhi: 3,
  TN: 3,
  NghiaSi: 4,
  nghiasi: 4,
  NS: 4,
  HiepSi: 5,
  hiepsi: 5,
  HS: 5,
}

export interface ParsedClassHierarchy {
  branchWeight: number
  gradeNumber: number
  sectionSuffix: string
  normalizedName: string
}

/**
 * Nhận diện ngành từ chuỗi tên lớp hoặc branchId
 */
export function detectBranchWeight(className: string = '', branchId?: string, branchName?: string | null): number {
  if (branchId && BRANCH_HIERARCHY_WEIGHT[branchId]) {
    return BRANCH_HIERARCHY_WEIGHT[branchId]
  }

  const combined = `${branchName || ''} ${className}`.toLowerCase()
  
  if (combined.includes('chiên') || combined.includes('chien') || combined.includes('cc')) {
    return 1
  }
  if (combined.includes('ấu') || combined.includes('au')) {
    return 2
  }
  if (combined.includes('thiếu') || combined.includes('thieu') || combined.includes('tn')) {
    return 3
  }
  if (combined.includes('nghĩa') || combined.includes('nghia') || combined.includes('ns')) {
    return 4
  }
  if (combined.includes('hiệp') || combined.includes('hiep') || combined.includes('hs')) {
    return 5
  }

  return 99 // Ngành không xác định xếp sau
}

/**
 * Phân tích tên lớp thành (Trọng số ngành, Số khối lớp, Hậu tố phân ban)
 * Ví dụ:
 *  - "Ấu Nhi 1A"  -> { branchWeight: 2, gradeNumber: 1, sectionSuffix: 'A' }
 *  - "Au 2B"      -> { branchWeight: 2, gradeNumber: 2, sectionSuffix: 'B' }
 *  - "Thiếu Nhi 3"-> { branchWeight: 3, gradeNumber: 3, sectionSuffix: '' }
 *  - "Hiệp Sĩ 2C" -> { branchWeight: 5, gradeNumber: 2, sectionSuffix: 'C' }
 */
export function parseClassHierarchy(
  className: string = '',
  branchId?: string,
  branchName?: string | null
): ParsedClassHierarchy {
  const branchWeight = detectBranchWeight(className, branchId, branchName)

  // Tìm số lớp và hậu tố chữ cái ngay sau số (ví dụ: "1A", " 2B ", "3", "4C")
  const gradeMatch = className.match(/(\d+)\s*([A-Za-zÀ-ỹ]*)/)
  let gradeNumber = 999
  let sectionSuffix = ''

  if (gradeMatch) {
    gradeNumber = parseInt(gradeMatch[1], 10)
    sectionSuffix = (gradeMatch[2] || '').trim().toUpperCase()
  }

  return {
    branchWeight,
    gradeNumber,
    sectionSuffix,
    normalizedName: className.trim(),
  }
}

export type SortDirection = 'asc' | 'desc'

/**
 * So sánh 2 đối tượng lớp học theo thứ tự cấp bậc (Ngành -> Khối lớp -> Hậu tố)
 */
export function compareClassHierarchy(
  classA: { name: string; branch?: string; branchId?: string; branchName?: string | null },
  classB: { name: string; branch?: string; branchId?: string; branchName?: string | null },
  direction: SortDirection = 'asc'
): number {
  const parsedA = parseClassHierarchy(classA.name, classA.branchId || classA.branch, classA.branchName)
  const parsedB = parseClassHierarchy(classB.name, classB.branchId || classB.branch, classB.branchName)

  let diff = 0

  // 1. So sánh cấp bậc ngành
  if (parsedA.branchWeight !== parsedB.branchWeight) {
    diff = parsedA.branchWeight - parsedB.branchWeight
  }
  // 2. So sánh số khối lớp (1 < 2 < 3)
  else if (parsedA.gradeNumber !== parsedB.gradeNumber) {
    diff = parsedA.gradeNumber - parsedB.gradeNumber
  }
  // 3. So sánh hậu tố phân ban (A < B < C)
  else {
    diff = parsedA.sectionSuffix.localeCompare(parsedB.sectionSuffix, 'vi', { sensitivity: 'base' })
    if (diff === 0) {
      diff = parsedA.normalizedName.localeCompare(parsedB.normalizedName, 'vi', { sensitivity: 'base' })
    }
  }

  return direction === 'asc' ? diff : -diff
}

/**
 * So sánh 2 học sinh dựa trên cấp bậc lớp học (và họ tên nếu cùng lớp)
 */
export function compareStudentByClassHierarchy(
  studentA: Student,
  studentB: Student,
  findClassById: (classId: string) => ClassListItem | { name: string; branch?: string; branchId?: string; branchName?: string | null } | undefined,
  direction: SortDirection = 'asc'
): number {
  const clsA = findClassById(studentA.classId) || { name: '', branchId: studentA.branch }
  const clsB = findClassById(studentB.classId) || { name: '', branchId: studentB.branch }

  const classDiff = compareClassHierarchy(clsA, clsB, direction)
  if (classDiff !== 0) {
    return classDiff
  }

  // Cùng lớp -> Sắp xếp theo tên học sinh (tiếng Việt)
  const nameA = `${studentA.fullName || ''} ${studentA.holyName || ''}`
  const nameB = `${studentB.fullName || ''} ${studentB.holyName || ''}`
  return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' })
}

/**
 * Tiện ích sắp xếp danh sách lớp học theo thứ tự cấp bậc
 */
export function sortClassesByHierarchy<T extends { name: string; branch?: string; branchId?: string; branchName?: string | null }>(
  classes: T[],
  direction: SortDirection = 'asc'
): T[] {
  return [...classes].sort((a, b) => compareClassHierarchy(a, b, direction))
}

/**
 * Tiện ích sắp xếp danh sách học sinh theo thứ tự cấp bậc lớp
 */
export function sortStudentsByClassHierarchy(
  students: Student[],
  findClassById: (classId: string) => ClassListItem | { name: string; branch?: string; branchId?: string; branchName?: string | null } | undefined,
  direction: SortDirection = 'asc'
): Student[] {
  return [...students].sort((a, b) => compareStudentByClassHierarchy(a, b, findClassById, direction))
}
