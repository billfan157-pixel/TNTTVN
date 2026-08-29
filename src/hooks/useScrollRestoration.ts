import { useEffect, useRef } from 'react'

/**
 * Lightweight scroll restoration for mobile page transitions.
 *
 * Saves the scroll position of the mobile-app-main container when navigating
 * away, and restores it when navigating back (via browser history).
 *
 * Uses `sessionStorage` keyed by pathname so positions survive React
 * component unmounts but are cleared on tab close.
 *
 * Only active on mobile — desktop uses its own overflow-hidden container
 * with per-page scroll state.
 */
const STORAGE_PREFIX = 'tntt_scroll_'

export function useScrollRestoration(pathname: string, mode: 'desktop' | 'mobile') {
  const prevPathRef = useRef(pathname)
  const isPopRef = useRef(false)

  // Track popstate (Back/Forward) vs programmatic navigation
  useEffect(() => {
    if (mode !== 'mobile') return

    const onPopState = () => { isPopRef.current = true }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [mode])

  useEffect(() => {
    if (mode !== 'mobile') return

    const scrollContainer = document.getElementById('main-content')
    if (!scrollContainer) return

    // Save previous page position before route change
    if (prevPathRef.current !== pathname) {
      try {
        sessionStorage.setItem(
          STORAGE_PREFIX + prevPathRef.current,
          String(scrollContainer.scrollTop || window.scrollY)
        )
      } catch {}
    }

    // Restore if this is a back/forward navigation
    if (isPopRef.current) {
      const saved = sessionStorage.getItem(STORAGE_PREFIX + pathname)
      if (saved) {
        const y = parseInt(saved, 10)
        // Defer to after paint so content has rendered
        requestAnimationFrame(() => {
          scrollContainer.scrollTo(0, y)
          // Fallback for when main-content doesn't scroll (body scrolls)
          if (scrollContainer.scrollTop === 0 && y > 0) {
            window.scrollTo(0, y)
          }
        })
      }
    } else {
      // Programmatic navigation: scroll to top
      scrollContainer.scrollTo(0, 0)
      window.scrollTo(0, 0)
    }

    prevPathRef.current = pathname
    isPopRef.current = false
  }, [pathname, mode])
}
