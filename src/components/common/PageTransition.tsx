import type { ReactNode } from 'react'

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
  const supportsNativeViewTransition = typeof document !== 'undefined'
    && 'startViewTransition' in document

  return (
    <div
      key={routeKey}
      className={`route-transition-frame${supportsNativeViewTransition ? '' : ' route-transition-frame--fallback'}`}
    >
      {children}
    </div>
  )
}
