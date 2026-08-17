import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '../../components/common/ErrorBoundary'

const mockCaptureException = vi.hoisted(() => vi.fn())
vi.mock('@sentry/react', () => ({
  captureException: mockCaptureException,
}))

const ThrowError: React.FC<{ message?: string }> = ({ message = 'Test error' }) => {
  throw new Error(message)
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children when no error', () => {
    render(<ErrorBoundary><div>Safe Content</div></ErrorBoundary>)
    expect(screen.getByText('Safe Content')).toBeDefined()
  })

  it('renders default fallback on error', () => {
    render(<ErrorBoundary><ThrowError /></ErrorBoundary>)
    expect(screen.getByText('Có lỗi xảy ra')).toBeDefined()
    expect(screen.getByText('Test error')).toBeDefined()
    expect(screen.getByText('Thử lại')).toBeDefined()
    expect(mockCaptureException).toHaveBeenCalled()
  })

  it('renders custom fallback when provided', () => {
    render(<ErrorBoundary fallback={<div>Custom Error UI</div>}><ThrowError /></ErrorBoundary>)
    expect(screen.getByText('Custom Error UI')).toBeDefined()
  })

  it('resets error state when Thử lại is clicked', () => {
    render(<ErrorBoundary><ThrowError /></ErrorBoundary>)
    expect(screen.getByText('Có lỗi xảy ra')).toBeDefined()
    fireEvent.click(screen.getByText('Thử lại'))
    expect(screen.getByText('Có lỗi xảy ra')).toBeDefined()
  })

  it('calls onReset when provided and Thử lại is clicked', () => {
    const onReset = vi.fn()
    render(<ErrorBoundary onReset={onReset}><ThrowError /></ErrorBoundary>)
    fireEvent.click(screen.getByText('Thử lại'))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('shows generic message when error has no message', () => {
    render(<ErrorBoundary><ThrowError message="" /></ErrorBoundary>)
    expect(screen.getByText('Một lỗi không mong muốn đã xảy ra. Vui lòng thử lại.')).toBeDefined()
  })
})
