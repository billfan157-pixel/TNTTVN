import { useEffect, useRef, type ReactNode } from 'react'

interface PageTransitionProps {
  routeKey: string
  children: ReactNode
}

/**
 * Shared route-motion boundary.
 *
 * `routeKey` intentionally tracks pathname only: changing filters/search params
 * must not replay page entrance motion or reset the rendered route subtree.
 */
export function PageTransition({ routeKey, children }: PageTransitionProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const supportsNativeViewTransition = typeof document !== 'undefined'
    && 'startViewTransition' in document

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || typeof window === 'undefined' || !('IntersectionObserver' in window)) return

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (reducedMotion?.matches) return

    const sections = new Set<HTMLElement>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const section = entry.target as HTMLElement
        section.dataset.scrollStoryState = 'entered'
        observer.unobserve(section)
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })

    const track = (element: Element) => {
      if (reducedMotion?.matches) return
      const candidates = element.matches('[data-scroll-story]')
        ? [element, ...Array.from(element.querySelectorAll('[data-scroll-story]'))]
        : Array.from(element.querySelectorAll('[data-scroll-story]'))

      for (const candidate of candidates) {
        const section = candidate as HTMLElement
        if (sections.has(section)) continue
        sections.add(section)
        const bounds = section.getBoundingClientRect()
        // The route transition handles the first viewport. Only later content
        // enters on scroll, so the two motion layers never replay together.
        if (bounds.bottom <= 0 || bounds.top <= window.innerHeight * 0.88) continue
        section.dataset.scrollStoryState = 'pending'
        observer.observe(section)
      }
    }

    track(frame)
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (node.nodeType === Node.ELEMENT_NODE) track(node as Element)
        }
      }
    })
    mutations?.observe(frame, { childList: true, subtree: true })

    const revealAll = () => {
      if (!reducedMotion?.matches) return
      observer.disconnect()
      for (const section of sections) delete section.dataset.scrollStoryState
    }
    reducedMotion?.addEventListener?.('change', revealAll)

    return () => {
      mutations?.disconnect()
      observer.disconnect()
      reducedMotion?.removeEventListener?.('change', revealAll)
    }
  }, [routeKey])

  return (
    <div
      ref={frameRef}
      key={routeKey}
      className={`route-transition-frame${supportsNativeViewTransition ? '' : ' route-transition-frame--fallback'}`}
    >
      {children}
    </div>
  )
}
