import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StudentName } from '../../components/common/StudentName'

describe('StudentName', () => {
  it('exposes one correctly spaced name to assistive technology', () => {
    const { container } = render(<StudentName holyName="Anrê" fullName="Nguyễn Văn A" />)

    expect(container.querySelector('.student-name-group')?.textContent).toBe('Anrê Nguyễn Văn A')
    expect(screen.getByText('Anrê')).toBeVisible()
    expect(screen.getByText('Nguyễn Văn A')).toBeVisible()
  })

  it('does not announce an empty patronal-name placeholder', () => {
    render(<StudentName fullName="Nguyễn Văn B" showEmptyHolyNameDash />)

    expect(screen.getByText('Nguyễn Văn B')).toBeVisible()
    expect(screen.getByText('—')).toHaveAttribute('aria-hidden', 'true')
  })
})
