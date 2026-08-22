import { describe, it, expect } from 'vitest'
import { computeNextClassForStudent, getNextBranch } from '../../utils/sacraments'

// PROMO-FIX (2026-08-22): học sinh Thiếu Nhi 1A thăng tiến phải lên **Thiếu Nhi 2A**
// (cùng ngành khối +1, giữ hậu tố), KHÔNG còn nhảy sang ngành Nghĩa Sĩ lớp đầu tiên.

const cls = (id: string, name: string) => ({ id, name })

describe('computeNextClassForStudent', () => {
  it('TN 1A → TN 2A: cùng ngành khối +1 giữ hậu tố', () => {
    const classes = [cls('tn1a', 'Thiếu Nhi 1A'), cls('tn1b', 'Thiếu Nhi 1B'), cls('tn2a', 'Thiếu Nhi 2A'), cls('tn2b', 'Thiếu Nhi 2B')]
    const r = computeNextClassForStudent({ classId: 'tn1a', branch: 'ThieuNhi' }, classes)
    expect(r.classId).toBe('tn2a')
    expect(r.nextBranch).toBeNull()
    expect(r.matchedBy).toBe('grade-section')
  })

  it('TN 1A → TN 2B khi không có 2A (fallback khối +1 bất kỳ hậu tố)', () => {
    const classes = [cls('tn1a', 'Thiếu Nhi 1A'), cls('tn2b', 'Thiếu Nhi 2B'), cls('tn3a', 'Thiếu Nhi 3A')]
    const r = computeNextClassForStudent({ classId: 'tn1a', branch: 'ThieuNhi' }, classes)
    expect(r.classId).toBe('tn2b')
    expect(r.matchedBy).toBe('grade')
  })

  it('Ấu Nhi 3 → Thiếu Nhi 1 khi AN hết cấp (không có AN khối 4) — chuyển ngành nhập môn khối thấp nhất', () => {
    const classes = [cls('an1', 'Ấu Nhi 1'), cls('an2', 'Ấu Nhi 2'), cls('an3', 'Ấu Nhi 3'), cls('tn1a', 'Thiếu Nhi 1A'), cls('tn2a', 'Thiếu Nhi 2A')]
    const r = computeNextClassForStudent({ classId: 'an3', branch: 'AuNhi' }, classes)
    expect(r.classId).toBe('tn1a')
    expect(r.nextBranch).toBe('ThieuNhi')
    expect(r.matchedBy).toBe('branch-entry')
  })

  it('Nghĩa Sĩ 2 → NS 3 cùng ngành (không nhảy ngành khi còn khối)', () => {
    const classes = [cls('ns2a', 'Nghĩa Sĩ 2A'), cls('ns3a', 'Nghĩa Sĩ 3A'), cls('hs1a', 'Hiệp Sĩ 1A')]
    const r = computeNextClassForStudent({ classId: 'ns2a', branch: 'NghiaSi' }, classes)
    expect(r.classId).toBe('ns3a')
    expect(r.nextBranch).toBeNull()
  })

  it('Hiệp Sĩ (ngành cuối) không còn lớp → none', () => {
    const classes = [cls('hs3a', 'Hiệp Sĩ 3A')]
    const r = computeNextClassForStudent({ classId: 'hs3a', branch: 'HiepSi' }, classes)
    expect(r.classId).toBeNull()
    expect(r.nextBranch).toBeNull()
    expect(r.matchedBy).toBe('none')
  })

  it('Chưa có lớp đích trong ngành kế → none (admin tạo lớp trước)', () => {
    const classes = [cls('tn5a', 'Thiếu Nhi 5A')] // NS chưa có lớp nào
    const r = computeNextClassForStudent({ classId: 'tn5a', branch: 'ThieuNhi' }, classes)
    expect(r.classId).toBeNull()
    expect(r.matchedBy).toBe('none')
  })

  it('getNextBranch vẫn đúng thứ tự ngành cho logic khác đang dùng', () => {
    expect(getNextBranch('AuNhi')).toBe('ThieuNhi')
    expect(getNextBranch('HiepSi')).toBeNull()
  })
})
