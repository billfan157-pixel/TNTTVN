import { DesktopReports } from '../components/desktop/DesktopReports'
import { MobileReportsView } from '../components/mobile/MobileReportsView'
import { useUIStore } from '../stores/uiStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'

export function ReportsPage() {
  const effectiveMode = useEffectiveMode()
  const { openReport } = useUIStore()

  if (effectiveMode === 'desktop') {
    return <DesktopReports onViewReport={openReport} />
  }

  return (
    <MobileReportsView onViewReport={openReport} />
  )
}

export default ReportsPage
