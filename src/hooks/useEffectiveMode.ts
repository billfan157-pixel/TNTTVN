import { useState, useEffect } from 'react'
import { useFilterStore } from '../stores/filterStore'

export function useEffectiveMode(): 'desktop' | 'mobile' {
  const viewMode = useFilterStore(s => s.viewMode)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    if (viewMode !== 'auto') return
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [viewMode])

  if (viewMode !== 'auto') return viewMode
  return isMobile ? 'mobile' : 'desktop'
}
