import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { lazyWithRetry } from '../utils/lazyWithRetry'

describe('lazyWithRetry preload contract', () => {
  it('deduplicates concurrent preloads and renders synchronously after preload', async () => {
    const factory = vi.fn(async () => ({
      default: ({ label }: { label: string }) => <div>{label}</div>,
    }))
    const Component = lazyWithRetry(factory)

    await Promise.all([Component.preload(), Component.preload()])
    render(<Component label="Đã tải trước" />)

    expect(factory).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Đã tải trước')).toBeInTheDocument()
  })

  it('keeps named-export resolution available to route preloading', async () => {
    const factory = vi.fn(async () => ({
      NamedPage: () => <div>Named route</div>,
    }))
    const Component = lazyWithRetry(factory, 'NamedPage')

    await Component.preload()
    render(<Component />)

    expect(screen.getByText('Named route')).toBeInTheDocument()
  })
})
