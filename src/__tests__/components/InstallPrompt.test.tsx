import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { InstallPrompt } from '../../components/common/InstallPrompt'

describe('InstallPrompt', () => {
  it('stays hidden because install actions live in the mobile control sheet and Settings', () => {
    const { container } = render(<InstallPrompt />)
    expect(container.innerHTML).toBe('')
  })
})
