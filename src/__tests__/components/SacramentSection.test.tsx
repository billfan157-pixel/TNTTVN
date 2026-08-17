import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SacramentSection } from '../../components/common/SacramentSection'

const baseStudent = {
  id: 'ST-001',
  code: 'TN-1001',
  holyName: 'Phê-rô',
  fullName: 'Nguyễn Văn A',
  gender: 'Nam' as const,
  dateOfBirth: '2012-05-15',
  parentName: 'Nguyễn Văn B',
  parentPhone: '0901234567',
  address: '123 Đường ABC',
  branch: 'ThieuNhi' as const,
  classId: 'TN1',
  status: 'Đang học' as const,
}

describe('SacramentSection', () => {
  it('renders all three sacrament steps', () => {
    render(<SacramentSection student={baseStudent} />)
    const steps = screen.getAllByText(/Rửa Tội|Rước Lễ Lần Đầu|Thêm Sức/)
    expect(steps.length).toBeGreaterThanOrEqual(3)
  })

  it('shows Chưa lãnh nhận when sacraments not done', () => {
    render(<SacramentSection student={baseStudent} />)
    const notDone = screen.getAllByText('Chưa lãnh nhận')
    expect(notDone.length).toBe(3)
  })

  it('shows dates when sacraments are completed', () => {
    render(<SacramentSection student={{ ...baseStudent, baptismDate: '2020-01-15', firstCommunionDate: '2022-06-10' }} />)
    expect(screen.getByText('2020-01-15')).toBeDefined()
    expect(screen.getByText('2022-06-10')).toBeDefined()
    expect(screen.getByText('Chưa lãnh nhận')).toBeDefined()
  })

  it('shows next sacrament info', () => {
    render(<SacramentSection student={baseStudent} />)
    expect(screen.getByText(/Tuổi:/)).toBeDefined()
    expect(screen.getByText('Rửa Tội', { selector: 'span' })).toBeDefined()
  })

  it('shows age', () => {
    render(<SacramentSection student={baseStudent} />)
    expect(screen.getByText(/Tuổi:/)).toBeDefined()
  })

  it('shows Hoàn tất when all three sacraments done', () => {
    render(<SacramentSection student={{
      ...baseStudent,
      baptismDate: '2020-01-15',
      firstCommunionDate: '2022-06-10',
      confirmationDate: '2024-03-20',
    }} />)
    expect(screen.getByText(/Hoàn tất/)).toBeDefined()
  })
})
