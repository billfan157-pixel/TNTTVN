import { useState, useEffect } from 'react'
import { useFilterStore } from '../stores/filterStore'
import { Capacitor } from '@capacitor/core'

export function useEffectiveMode(): 'desktop' | 'mobile' {
  const viewMode = useFilterStore(s => s.viewMode)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    // Nếu chạy trên App Native (Capacitor), ép luôn sang mobile mode
    if (Capacitor.isNativePlatform()) return true
    return window.innerWidth < 768
  })

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    if (viewMode !== 'auto') return
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [viewMode])

  if (Capacitor.isNativePlatform()) return 'mobile'
  if (viewMode !== 'auto') return viewMode
  return isMobile ? 'mobile' : 'desktop'
}
