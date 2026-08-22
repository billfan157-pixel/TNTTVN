import { useState, useEffect } from 'react'
import { useFilterStore } from '../stores/filterStore'
import { Capacitor } from '@capacitor/core'

/**
 * Mode hiệu lực của app shell.
 *
 * P0.10 (audit desktop 2026-08-22): trước đây forced `viewMode='mobile'` được
 * trả về vô điều kiện kể cả khi viewport ≥ 768px — trong khi CSS guard ẩn
 * `.mobile-app-shell` ở ≥ 768px (index.css @media min-width:768) → app trắng trơn.
 * Giờ forced-mobile chỉ được tôn trọng khi viewport thực sự nhỏ; trên màn rộng
 * fallback về desktop để JS mode đồng bộ với CSS.
 */
export function useEffectiveMode(): 'desktop' | 'mobile' {
  const viewMode = useFilterStore(s => s.viewMode)
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 768
  })

  useEffect(() => {
    // Native (Capacitor) luôn trả 'mobile' bên dưới — không cần theo dõi resize
    if (Capacitor.isNativePlatform()) return
    const onResize = () => setIsMobileViewport(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (Capacitor.isNativePlatform()) return 'mobile'
  if (viewMode === 'mobile' && !isMobileViewport) return 'desktop'
  if (viewMode !== 'auto') return viewMode
  return isMobileViewport ? 'mobile' : 'desktop'
}
