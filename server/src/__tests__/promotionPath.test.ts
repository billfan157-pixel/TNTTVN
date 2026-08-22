import { describe, it, expect } from 'vitest'
import { parsePromotionClassName, findNextClassInYear, branchTypeByWeight } from '../utils/promotionPath.js'

// PROMO-FIX (2026-08-22): chốt năm học — chỉ học sinh ĐẠT điều kiện mới lên
// khối +1 (ưu tiên cùng hậu tố), hết cấp ngành thì sang nhập môn ngành kế.

const cls = (id: string, name: string) => ({ id, name })

describe('parsePromotionClassName', () => {
  it('parse tên lớp chuẩn TNTT', () => {
    expect(parsePromotionClassName('Thiếu Nhi 1A')).toEqual({ weight: 3, grade: 1, suffix: 'A' })
    expect(parsePromotionClassName('Ấu Nhi 2B')).toEqual({ weight: 2, grade: 2, suffix: 'B' })
    expect(parsePromotionClassName('Thiếu Nhi 3')).toEqual({ weight: 3, grade: 3, suffix: '' })
  })

  it('tên lạ → weight 99', () => {
    expect(parsePromotionClassName('Lớp Không Xác Định').weight).toBe(99)
  })
})

describe('findNextClassInYear', () => {
  const NEW_YEAR = [
    cls('n-tn1a', 'Thiếu Nhi 1A'),
    cls('n-tn1b', 'Thiếu Nhi 1B'),
    cls('n-tn2a', 'Thiếu Nhi 2A'),
    cls('n-tn3a', 'Thiếu Nhi 3A'),
    cls('n-an1', 'Ấu Nhi 1'),
    cls('n-an2', 'Ấu Nhi 2'),
    cls('n-an3', 'Ấu Nhi 3'),
    cls('n-ns1a', 'Nghĩa Sĩ 1A'),
  ]

  it('TN 1A → TN 2A cùng hậu tố (học sinh đạt điều kiện)', () => {
    const r = findNextClassInYear('Thiếu Nhi 1A', NEW_YEAR)
    expect(r?.id).toBe('n-tn2a')
  })

  it('TN 2A → TN 3A', () => {
    const r = findNextClassInYear('Thiếu Nhi 2A', NEW_YEAR)
    expect(r?.id).toBe('n-tn3a')
  })

  it('AN 3 (hết cấp Ấu) → nhập môn TN khối thấp nhất', () => {
    const r = findNextClassInYear('Ấu Nhi 3', NEW_YEAR)
    expect(r?.id).toBe('n-tn1a')
  })

  it('suffix fallback: nguồn 1B mà năm mới chỉ có 2A → dùng 2A', () => {
    const limited = [cls('x-tn1b', 'Thiếu Nhi 1B'), cls('x-tn2a', 'Thiếu Nhi 2A')]
    const r = findNextClassInYear('Thiếu Nhi 1B', limited)
    expect(r?.id).toBe('x-tn2a')
  })

  it('ngành không có khối +1 trong năm mới → null (caller fallback giữ nguyên)', () => {
    const onlyOldGrade = [cls('y-tn1a', 'Thiếu Nhi 1A')]
    const r = findNextClassInYear('Thiếu Nhi 1A', onlyOldGrade)
    expect(r).toBeNull()
  })

  it('branchTypeByWeight map đúng enum BranchType', () => {
    expect(branchTypeByWeight(2)).toBe('AuNhi')
    expect(branchTypeByWeight(4)).toBe('NghiaSi')
    expect(branchTypeByWeight(99)).toBeNull()
  })
})
