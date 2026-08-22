import { useState, useEffect } from 'react'

/**
 * Media query reactive (PHA 4 — audit A5).
 * Dùng để vô hiệu hóa control không hợp lệ theo viewport, ví dụ chặn
 * force-desktop trên màn hình < 768px (sidebar 260px + padding chừa ~65px
 * nội dung ở 375px — không dùng được).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    // jsdom / môi trường không có matchMedia → trả false thay vì throw
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
