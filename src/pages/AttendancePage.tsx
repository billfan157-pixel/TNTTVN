import React, { useEffect } from 'react'
import { DesktopAttendanceGrid } from '../components/desktop/DesktopAttendanceGrid'
import { MobileAttendanceView } from '../components/mobile/MobileAttendanceView'
import { useEffectiveMode } from '../hooks/useEffectiveMode'

export function AttendancePage() {
  const effectiveMode = useEffectiveMode()

  if (effectiveMode === 'desktop') {
    return <DesktopAttendanceGrid />
  }

  return <MobileAttendanceView />
}

export default AttendancePage
