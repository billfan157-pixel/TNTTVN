import React, { useEffect } from 'react'
import { DesktopReports } from '../components/desktop/DesktopReports'
import { MobileReportsView } from '../components/mobile/MobileReportsView'
import { useUIStore } from '../stores/uiStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'

export function ReportsPage() {
  const effectiveMode = useEffectiveMode()
  const { openReportForPrint } = useUIStore()

  if (effectiveMode === 'desktop') {
    return <DesktopReports onPrintReport={openReportForPrint} />
  }

  return (
    <MobileReportsView onPrintReport={openReportForPrint} />
  )
}

export default ReportsPage
