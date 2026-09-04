import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuickScoreEntry } from '../../components/exam/QuickScoreEntry'

describe('QuickScoreEntry Validation', () => {
  const mockStudents = [
    { id: 'ST-1', name: 'Nguyễn Văn An', code: 'TN001', holyName: 'Giuse' },
  ]
  const mockSavedScores = {}

  it('displays inline error and sets aria-invalid when entered score exceeds maxScore', () => {
    const onSave = vi.fn()
    render(
      <QuickScoreEntry
        students={mockStudents}
        savedScores={mockSavedScores}
        maxScore={10}
        onSave={onSave}
      />
    )

    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.blur(input)

    expect(onSave).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Điểm từ 0 đến 10')).toBeDefined()
  })

  it('displays inline error when entered score is negative', () => {
    const onSave = vi.fn()
    render(
      <QuickScoreEntry
        students={mockStudents}
        savedScores={mockSavedScores}
        maxScore={10}
        onSave={onSave}
      />
    )

    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '-2' } })
    fireEvent.blur(input)

    expect(onSave).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Điểm từ 0 đến 10')).toBeDefined()
  })

  it('calls onSave and clears errors when valid score is entered', () => {
    const onSave = vi.fn()
    render(
      <QuickScoreEntry
        students={mockStudents}
        savedScores={mockSavedScores}
        maxScore={10}
        onSave={onSave}
      />
    )

    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '9.5' } })
    fireEvent.blur(input)

    expect(onSave).toHaveBeenCalledWith('ST-1', 9.5)
    expect(input.getAttribute('aria-invalid')).toBe('false')
    expect(screen.queryByText('Điểm từ 0 đến 10')).toBeNull()
  })
})
