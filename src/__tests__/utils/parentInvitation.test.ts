import { describe, it, expect } from 'vitest'
import { generateParentInvitationHTML, generateBatchParentInvitationsHTML } from '../../utils/pdfGenerator'
import type { Student } from '../../types'

const student: Student = {
  id: 'st-inv-01',
  code: 'ST-INV-1',
  holyName: 'Giu-se',
  fullName: 'Nguyen Van A',
  gender: 'Nam',
  dateOfBirth: '2015-01-01',
  parentName: 'Nguyen Van Bo',
  parentPhone: '0900000000',
  address: 'X',
  branch: 'AuNhi',
  classId: 'cl-inv-01',
  status: 'Đang học',
  parishId: 'gia-ton',
}

describe('Parent Invitation (Phiếu Mời Phụ Huynh)', () => {
  it('single slip contains student + parent info and parish header', () => {
    const html = generateParentInvitationHTML(student, {
      academicYear: '2025-2026',
      parishName: 'Giáo Xứ Gia Tôn',
      dioceseName: 'Giáo Phận Xuân Lộc',
    })
    expect(html).toContain('Phiếu Mời Phụ Huynh')
    expect(html).toContain('Giáo Xứ Gia Tôn')
    expect(html).toContain('Nguyen Van Bo')
    expect(html).toContain('Giu-se')
    expect(html).toContain('ST-INV-1')
    expect(html).toContain('@page { size: A4 portrait')
  })

  it('returns empty for missing student', () => {
    expect(generateParentInvitationHTML(null as any)).toBe('')
  })

  it('single slip interpolates custom meeting options and escapes HTML', () => {
    const html = generateParentInvitationHTML(student, {
      academicYear: '2025-2026',
      title: 'Giấy Mời Họp PH Đầu Năm',
      meetingTime: '08g00 Chủ Nhật, 25/08/2026',
      meetingLocation: 'Hội trường Giáo xứ',
      meetingReason: 'Họp phụ huynh triển khai năm học mới & bầu Ban đại diện',
    })
    expect(html).toContain('Giấy Mời Họp PH Đầu Năm')
    expect(html).toContain('08g00 Chủ Nhật, 25/08/2026')
    expect(html).toContain('Hội trường Giáo xứ')
    expect(html).toContain('Họp phụ huynh triển khai năm học mới &amp; bầu Ban đại diện')
  })

  it('batch generates one slip per student with page breaks', () => {
    const html = generateBatchParentInvitationsHTML([student, { ...student, id: 'st-inv-02' }], { academicYear: '2025-2026' })
    expect(html).toContain('Phiếu Mời Phụ Huynh')
    expect(html).toContain('page-break')
    expect(html.match(/Phiếu Mời Phụ Huynh/g)?.length || 0).toBeGreaterThanOrEqual(3)
  })

  it('batch returns notice when no students', () => {
    const html = generateBatchParentInvitationsHTML([], { academicYear: '2025-2026' })
    expect(html).toContain('Không có thiếu nhi')
  })
})