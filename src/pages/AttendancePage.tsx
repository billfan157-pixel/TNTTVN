import React, { Suspense } from 'react'
import { MobileAttendanceView } from '../components/mobile/MobileAttendanceView'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import { SkeletonTable } from '../components/common/StateFeedback'

// Desktop grid stays out of the mobile bundle: it loads on demand only when
// actually rendered (same pattern as StudentsPage).
const DesktopAttendanceGrid = lazyWithRetry(() => import('../components/desktop/DesktopAttendanceGrid'), 'DesktopAttendanceGrid')

export function AttendancePage() {
  const effectiveMode = useEffectiveMode()

  if (effectiveMode === 'desktop') {
    return <Suspense fallback={<SkeletonTable rows={8} cols={6} />}><DesktopAttendanceGrid /></Suspense>
  }

  return <MobileAttendanceView />
}

export default AttendancePage
