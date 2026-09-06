import { useState, useEffect } from 'react'
import { useFilterStore } from '../stores/filterStore'

/**
 * Mode hiệu lực của app shell.
 *
 * P0.10 (audit desktop 2026-08-22): trước đây forced `viewMode='mobile'` được
 * trả về vô điều kiện kể cả khi viewport ≥ 1024px — trong khi CSS guard ẩn
 * `.mobile-app-shell` ở ≥ 1024px → app trắng trơn. Tablet giữ mobile shell để
 * có vùng chạm và mật độ phù hợp; desktop bắt đầu từ 1024px.
 * Giờ forced-mobile chỉ được tôn trọng khi viewport thực sự nhỏ; trên màn rộng
 * fallback về desktop để JS mode đồng bộ với CSS.
 */
export function useEffectiveMode(): 'desktop' | 'mobile' {
  const viewMode = useFilterStore(s => s.viewMode)
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 1024
  })

  useEffect(() => {
    // jsdom, WebView cũ hoặc trình duyệt nhúng có thể không triển khai matchMedia.
    // Giữ một fallback resize nhỏ để app shell vẫn chọn đúng mode thay vì crash.
    if (typeof window.matchMedia !== 'function') {
      const onResize = () => setIsMobileViewport(window.innerWidth < 1024)
      onResize()
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }
    // matchMedia chỉ fire khi thực sự cross breakpoint (1 lần) thay vì mỗi pixel resize
    const mql = window.matchMedia('(max-width: 1023.9px)')
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => setIsMobileViewport(e.matches)
    onChange(mql)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  if (isMobileViewport) return 'mobile'
  if (viewMode === 'mobile') return 'desktop'
  return viewMode === 'auto' ? 'desktop' : viewMode
}
