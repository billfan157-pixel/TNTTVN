import { describe, it, expect } from 'vitest'
import {
  getAcademicYear,
  getAge,
  getBranchForAge,
  getSacramentStatus,
  getNextBranch,
  getClassIdForBranch,
  checkPromotionEligibility,
} from '../../utils/sacraments'
import type { Student } from '../../types'

const makeStudent = (overrides: Partial<Student> = {}): Student => ({
  id: 'ST-001',
  code: 'TN-1001',
  holyName: 'Giuse',
  fullName: 'Nguyễn Văn A',
  gender: 'Nam',
  dateOfBirth: '2015-01-01',
  parentName: 'Cha A',
  parentPhone: '0901234567',
  address: 'Giáo Xứ',
  branch: 'ThieuNhi',
  classId: 'TN1',
  status: 'Đang học',
  ...overrides,
})

describe('getAcademicYear', () => {
  it('returns correct year for dates after July', () => {
    const d = new Date('2025-09-01')
    expect(getAcademicYear(d)).toBe('2025-2026')
  })

  it('returns correct year for dates before August', () => {
    const d = new Date('2025-03-01')
    expect(getAcademicYear(d)).toBe('2024-2025')
  })

  it('handles August boundary (month 7 = August)', () => {
    const aug = new Date('2025-08-01')
    expect(getAcademicYear(aug)).toBe('2025-2026')
    const jul = new Date('2025-07-31')
    expect(getAcademicYear(jul)).toBe('2024-2025')
  })
})

describe('getAge', () => {
  it('calculates age correctly', () => {
    const dob = '2015-06-01'
    const ref = new Date('2025-06-01')
    expect(getAge(dob, ref)).toBe(10)
  })

  it('decrements age if birthday not yet passed', () => {
    const dob = '2015-09-01'
    const ref = new Date('2025-06-01')
    expect(getAge(dob, ref)).toBe(9)
  })

  it('handles same month but earlier day', () => {
    const dob = '2015-06-15'
    const ref = new Date('2025-06-01')
    expect(getAge(dob, ref)).toBe(9)
  })
})

describe('getBranchForAge', () => {
  it('maps ages to correct branches', () => {
    expect(getBranchForAge(4)).toBe('ChienCon')
    expect(getBranchForAge(6)).toBe('ChienCon')
    expect(getBranchForAge(7)).toBe('AuNhi')
    expect(getBranchForAge(9)).toBe('AuNhi')
    expect(getBranchForAge(10)).toBe('ThieuNhi')
    expect(getBranchForAge(12)).toBe('ThieuNhi')
    expect(getBranchForAge(13)).toBe('NghiaSi')
    expect(getBranchForAge(15)).toBe('NghiaSi')
    expect(getBranchForAge(16)).toBe('HiepSi')
    expect(getBranchForAge(18)).toBe('HiepSi')
  })

  it('returns null for out-of-range ages', () => {
    expect(getBranchForAge(3)).toBeNull()
    expect(getBranchForAge(19)).toBeNull()
  })
})

describe('getSacramentStatus', () => {
  it('returns all done when all dates present', () => {
    const s = makeStudent({
      baptismDate: '2015-06-01',
      firstCommunionDate: '2016-06-01',
      confirmationDate: '2017-06-01',
    })
    const result = getSacramentStatus(s)
    expect(result.baptism.done).toBe(true)
    expect(result.firstCommunion.done).toBe(true)
    expect(result.confirmation.done).toBe(true)
    expect(result.nextSacrament).toContain('Hoàn tất')
  })

  it('shows baptism as next when missing', () => {
    const s = makeStudent({ baptismDate: undefined })
    const result = getSacramentStatus(s)
    expect(result.nextSacrament).toBe('Rửa Tội')
  })

  it('shows first communion as next when baptism done but first communion missing', () => {
    const s = makeStudent({ baptismDate: '2015-06-01', firstCommunionDate: undefined })
    const result = getSacramentStatus(s)
    expect(result.nextSacrament).toBe('Rước Lễ Lần Đầu')
  })

  it('shows confirmation as next when baptism and communion done', () => {
    const s = makeStudent({
      baptismDate: '2015-06-01',
      firstCommunionDate: '2016-06-01',
      confirmationDate: undefined,
    })
    const result = getSacramentStatus(s)
    expect(result.nextSacrament).toBe('Thêm Sức')
  })
})

describe('getNextBranch', () => {
  it('returns next branch in sequence', () => {
    expect(getNextBranch('ChienCon')).toBe('AuNhi')
    expect(getNextBranch('AuNhi')).toBe('ThieuNhi')
    expect(getNextBranch('ThieuNhi')).toBe('NghiaSi')
    expect(getNextBranch('NghiaSi')).toBe('HiepSi')
  })

  it('returns null for last branch', () => {
    expect(getNextBranch('HiepSi')).toBeNull()
  })
})

describe('getClassIdForBranch', () => {
  it('returns correct class IDs', () => {
    expect(getClassIdForBranch('ChienCon')).toBe('CC1')
    expect(getClassIdForBranch('AuNhi')).toBe('AU1')
    expect(getClassIdForBranch('ThieuNhi')).toBe('TN1')
    expect(getClassIdForBranch('NghiaSi')).toBe('NS1')
    expect(getClassIdForBranch('HiepSi')).toBe('HS1')
  })
})

describe('checkPromotionEligibility', () => {
  it('allows promotion when all criteria met', () => {
    const s = makeStudent({ branch: 'ThieuNhi' })
    const result = checkPromotionEligibility(s, 7.5, 85)
    expect(result.canPromote).toBe(true)
    expect(result.recommendedBranch).toBe('NghiaSi')
    expect(result.reasons).toHaveLength(0)
  })

  it('rejects promotion when avgScore is null', () => {
    const s = makeStudent()
    const result = checkPromotionEligibility(s, null, 85)
    expect(result.canPromote).toBe(false)
    expect(result.reasons).toContain('Chưa có kết quả điểm học tập')
  })

  it('rejects promotion when avgScore < 5.0', () => {
    const s = makeStudent()
    const result = checkPromotionEligibility(s, 4.5, 85)
    expect(result.canPromote).toBe(false)
    expect(result.reasons[0]).toContain('ĐTB học tập chưa đạt')
  })

  it('rejects promotion when attendance < 70%', () => {
    const s = makeStudent()
    const result = checkPromotionEligibility(s, 7.0, 60)
    expect(result.canPromote).toBe(false)
    expect(result.reasons[0]).toContain('Tỷ lệ chuyên cần chưa đạt')
  })

  it('rejects attendance 70-79% with default policy (min 80%, ADR-017)', () => {
    const s = makeStudent()
    const result = checkPromotionEligibility(s, 7.0, 75)
    expect(result.canPromote).toBe(false)
    expect(result.reasons[0]).toContain('80')
  })

  it('honors custom promotionPolicy thresholds (ADR-017)', () => {
    const s = makeStudent()
    const strict = checkPromotionEligibility(s, 7.0, 75, 2, { minGpa: 5.0, minAttendance: 80 })
    expect(strict.canPromote).toBe(false)
    const lenient = checkPromotionEligibility(s, 7.0, 75, 2, { minGpa: 5.0, minAttendance: 70 })
    expect(lenient.canPromote).toBe(true)
  })

  it('reports multiple failure reasons', () => {
    const s = makeStudent()
    const result = checkPromotionEligibility(s, null, 50)
    expect(result.canPromote).toBe(false)
    expect(result.reasons.length).toBeGreaterThanOrEqual(2)
  })

  it('returns undefined recommendedBranch if at max branch', () => {
    const s = makeStudent({ branch: 'HiepSi' })
    const result = checkPromotionEligibility(s, 8.0, 90)
    expect(result.canPromote).toBe(true)
    expect(result.recommendedBranch).toBeUndefined()
  })
})
