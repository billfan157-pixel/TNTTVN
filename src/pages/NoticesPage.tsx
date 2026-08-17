import React, { useEffect } from 'react'
import { DesktopNotices } from '../components/desktop/DesktopNotices'
import { MobileNoticesView } from '../components/mobile/MobileNoticesView'
import { useEffectiveMode } from '../hooks/useEffectiveMode'

export function NoticesPage() {
  const effectiveMode = useEffectiveMode()

  if (effectiveMode === 'desktop') {
    return <DesktopNotices />
  }

  return (
    <MobileNoticesView />
  )
}

export default NoticesPage