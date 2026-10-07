import React, { Suspense } from 'react'
import { MobileAttendanceView } from '../components/mobile/MobileAttendanceView'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import { SkeletonTable } from '../components/common/StateFeedback'

const DesktopAttendanceGrid = lazyWithRetry(
  () => import('../components/desktop/DesktopAttendanceGrid'),
  'DesktopAttendanceGrid'
)

export function AttendancePage() {
  const effectiveMode = useEffectiveMode()

  return effectiveMode === 'desktop' ? (
    <Suspense fallback={<SkeletonTable rows={8} cols={6} />}>
      <DesktopAttendanceGrid />
    </Suspense>
  ) : (
    <MobileAttendanceView />
  )
}

export default AttendancePage
