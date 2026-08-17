import { describe, it, expect } from 'vitest'
import { renderTemplate, buildContext, NOTIFICATION_TEMPLATES } from '../../services/templateEngine.js'

describe('renderTemplate', () => {
  it('replaces all template variables', () => {
    const result = renderTemplate('Xin chào {studentName} ({className})', {
      studentName: 'Nguyễn Văn A',
      className: 'Lớp 1',
    })
    expect(result).toBe('Xin chào Nguyễn Văn A (Lớp 1)')
  })

  it('removes unfilled variables', () => {
    const result = renderTemplate('{studentName} - {missingVar}', { studentName: 'A' })
    expect(result).toBe('A - ')
  })

  it('escapes Telegram markdown characters', () => {
    const result = renderTemplate('{studentName}', { studentName: 'Test *bold* _italic_' })
    expect(result).toBe('Test \\*bold\\* \\_italic\\_')
  })

  it('renders absenceUnexcused template', () => {
    const result = renderTemplate(NOTIFICATION_TEMPLATES.absenceUnexcused, {
      studentName: 'Nguyễn Văn A',
      className: 'Lớp TN1',
      date: '01/01/2025',
      parentName: 'Cha A',
      parentPhone: '0901234567',
    })
    expect(result).toContain('Nguyễn Văn A')
    expect(result).toContain('Lớp TN1')
    expect(result).toContain('01/01/2025')
  })

  it('renders reportCard template', () => {
    const result = renderTemplate(NOTIFICATION_TEMPLATES.reportCard, {
      academicYear: '2025 - 2026',
      studentName: 'Nguyễn Văn A',
      className: 'Lớp TN1',
      score: 8.5,
      rank: 'Giỏi',
      attendanceRate: 90,
      attendancePresent: 18,
      attendanceTotal: 20,
    })
    expect(result).toContain('Phiếu Điểm')
    expect(result).toContain('Nguyễn Văn A')
    expect(result).toContain('8\\.5')
  })

  it('sundayMassReminder dùng giờ từ {sundayMassTime} (không còn hardcode 8h00)', () => {
    const result = renderTemplate(NOTIFICATION_TEMPLATES.sundayMassReminder, {
      sundayMassTime: '09:30',
    })
    expect(result).toContain('09:30')
    expect(result).not.toContain('8h00')

    const defaultResult = renderTemplate(NOTIFICATION_TEMPLATES.sundayMassReminder, {})
    expect(defaultResult).toContain('Thánh Lễ Thiếu Nhi lúc ')
  })

  it('renders sundayMassReminder template with no context needed', () => {
    const result = renderTemplate(NOTIFICATION_TEMPLATES.sundayMassReminder, {})
    expect(result).toContain('Nhắc nhở')
    expect(result).toContain('Thánh Lễ Thiếu Nhi lúc')
    expect(result).not.toContain('8h00')
  })
})

describe('buildContext', () => {
  it('returns default context with date and time', () => {
    const ctx = buildContext()
    expect(ctx.date).toBeTruthy()
    expect(ctx.time).toBeTruthy()
    expect(ctx.academicYear).toBeTruthy()
  })

  it('merges overrides', () => {
    const ctx = buildContext({ studentName: 'Test', className: 'Lớp A' })
    expect(ctx.studentName).toBe('Test')
    expect(ctx.className).toBe('Lớp A')
  })
})
