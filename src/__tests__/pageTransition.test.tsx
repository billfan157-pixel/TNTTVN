import { act, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readCssGraph } from './helpers/cssGraph'
import { PageTransition } from '../components/common/PageTransition'
import { isExpectedViewTransitionInterruption } from '../router'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('App-wide page transition contract', () => {
  it('replaces the motion boundary only when the pathname key changes', () => {
    const { container, rerender } = render(
      <PageTransition routeKey="/students">Danh sách</PageTransition>,
    )
    const firstBoundary = container.firstElementChild

    rerender(<PageTransition routeKey="/students">Danh sách đã lọc</PageTransition>)
    expect(container.firstElementChild).toBe(firstBoundary)

    rerender(<PageTransition routeKey="/grades">Bảng điểm</PageTransition>)
    expect(container.firstElementChild).not.toBe(firstBoundary)
    expect(container.firstElementChild).toHaveClass('route-transition-frame')
    expect(container.firstElementChild).toHaveClass('route-transition-frame--fallback')
  })

  it('keeps native transitions path-only and provides accessible reduced motion', () => {
    const root = path.resolve(__dirname, '..')
    const router = fs.readFileSync(path.join(root, 'router.tsx'), 'utf8')
    const css = readCssGraph(path.join(root, 'index.css'))

    expect(router).toContain('defaultViewTransition')
    expect(router).toContain("pathChanged ? ['app-page-change'] : false")
    expect(css).toContain('view-transition-name: app-page')
    expect(css).toContain('.route-transition-frame--fallback')
    expect(css).toContain('::view-transition-old(app-page)')
    expect(css).toContain('::view-transition-new(app-page)')

    const reducedMotion = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reducedMotion).toContain('::view-transition-old(app-page)')
    expect(reducedMotion).toContain('animation: none !important')
    expect(reducedMotion).toContain('scroll-behavior: auto')
  })

  it('only suppresses browser lifecycle interruptions, not update callback failures', () => {
    expect(isExpectedViewTransitionInterruption({ name: 'AbortError' })).toBe(true)
    expect(isExpectedViewTransitionInterruption({ name: 'InvalidStateError' })).toBe(true)
    expect(isExpectedViewTransitionInterruption({ name: 'TimeoutError' })).toBe(true)
    expect(isExpectedViewTransitionInterruption(new Error('domain render failed'))).toBe(false)

    const router = fs.readFileSync(path.resolve(__dirname, '..', 'router.tsx'), 'utf8')
    expect(router).toContain('observeInterruption(transition.ready)')
    expect(router).toContain('observeInterruption(transition.finished)')
    expect(router).not.toContain('observeInterruption(transition.updateCallbackDone)')
  })

  it('reveals only below-fold overview content as it enters, including content loaded later', async () => {
    let onIntersect!: IntersectionObserverCallback
    const observe = vi.fn()
    const unobserve = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { onIntersect = callback }
      observe = observe
      unobserve = unobserve
      disconnect = vi.fn()
    })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const top = this.id === 'first' ? 20 : 1000
      return { top, bottom: top + 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: top, toJSON: () => ({}) }
    })

    const { container, rerender } = render(
      <PageTransition routeKey="/home">
        <section id="first" data-scroll-story="panel">First viewport</section>
        <section id="later" data-scroll-story="panel">Below fold</section>
      </PageTransition>,
    )
    const first = container.querySelector<HTMLElement>('#first')!
    const later = container.querySelector<HTMLElement>('#later')!
    expect(first.dataset.scrollStoryState).toBeUndefined()
    expect(later.dataset.scrollStoryState).toBe('pending')
    expect(observe).toHaveBeenCalledWith(later)

    const bounds = later.getBoundingClientRect()
    const entry: IntersectionObserverEntry = {
      isIntersecting: true,
      target: later,
      boundingClientRect: bounds,
      intersectionRatio: 1,
      intersectionRect: bounds,
      rootBounds: null,
      time: 0,
    }
    act(() => onIntersect([entry], {} as IntersectionObserver))
    expect(later.dataset.scrollStoryState).toBe('entered')
    expect(unobserve).toHaveBeenCalledWith(later)

    rerender(
      <PageTransition routeKey="/home">
        <section id="first" data-scroll-story="panel">First viewport</section>
        <section id="later" data-scroll-story="panel">Below fold</section>
        <section id="lazy" data-scroll-story="panel">Loaded later</section>
      </PageTransition>,
    )
    await waitFor(() => expect(container.querySelector<HTMLElement>('#lazy')?.dataset.scrollStoryState).toBe('pending'))
  })

  it('keeps below-fold content visible when reduced motion is requested', () => {
    const observe = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      observe = observe
      unobserve = vi.fn()
      disconnect = vi.fn()
    })
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 1000, bottom: 1100 } as DOMRect)

    const { container } = render(
      <PageTransition routeKey="/home"><section data-scroll-story="panel">Visible</section></PageTransition>,
    )
    expect(container.querySelector<HTMLElement>('section')?.dataset.scrollStoryState).toBeUndefined()
    expect(observe).not.toHaveBeenCalled()
  })
})
