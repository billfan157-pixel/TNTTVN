import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readCssGraph } from './helpers/cssGraph'
import { PageTransition } from '../components/common/PageTransition'
import { isExpectedViewTransitionInterruption } from '../router'

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
})
