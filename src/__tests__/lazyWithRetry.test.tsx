import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import { suspensePage } from '../components/common/suspensePage'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'

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

  it('never reloads the app when an idle preload exhausts its retries', async () => {
    sessionStorage.clear()
    const factory = vi.fn(async () => {
      throw new Error('Failed to fetch dynamically imported module')
    })
    const Component = lazyWithRetry(factory, 'default', 0, 0)

    await expect(Component.preload()).rejects.toThrow('Failed to fetch dynamically imported module')

    expect(factory).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('tntt_last_chunk_reload_time')).toBeNull()
  })

  it('allows a later navigation preload to retry after a background failure', async () => {
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ default: () => <div>Recovered route</div> })
    const Component = lazyWithRetry(factory, 'default', 0, 0)

    await expect(Component.preload()).rejects.toThrow('Failed to fetch dynamically imported module')
    await Component.preload()
    render(<Component />)

    expect(factory).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Recovered route')).toBeInTheDocument()
  })

  it('recovers on navigation when a speculative page import failed through Router', async () => {
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary chunk failure'))
      .mockResolvedValueOnce({ default: () => <div>Recovered destination</div> })
    const root = createRootRoute({ component: Outlet })
    const route = createRoute({
      getParentRoute: () => root,
      path: '/destination',
      component: suspensePage(lazyWithRetry(factory, 'default', 0, 0)),
    })
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/destination'] }),
    })

    await router.preloadRoute({ to: '/destination' })
    expect(factory).toHaveBeenCalledTimes(1)
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Recovered destination')).toBeInTheDocument()
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
