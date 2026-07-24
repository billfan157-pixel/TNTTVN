import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { DesktopGradeMatrix } from '../../components/desktop/DesktopGradeMatrix'

describe('DesktopGradeMatrix Component Unit Tests', () => {
  it('renders grade matrix header and title', () => {
    render(<DesktopGradeMatrix />)
    expect(screen.getByText('Ma Trận Nhập Điểm Hàng Loạt')).toBeDefined()
  })

  it('renders column headers for score categories with weights', () => {
    render(<DesktopGradeMatrix />)
    expect(screen.getByText(/Miệng/i)).toBeDefined()
    expect(screen.getByText(/15P/i)).toBeDefined()
    expect(screen.getByText(/1 Tiết/i)).toBeDefined()
  })
})
