import { DesktopDashboard } from '../components/desktop/DesktopDashboard'
import { MobileHomeView } from '../components/mobile/MobileHomeView'
import { useUIStore } from '../stores/uiStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'

export function DashboardPage() {
  const effectiveMode = useEffectiveMode()
  const { openAddStudent } = useUIStore()

  if (effectiveMode === 'desktop') {
    return <DesktopDashboard onOpenAddStudent={openAddStudent} />
  }

  return (
    <MobileHomeView
      onNavigateTab={() => {}}
      onOpenAddStudent={openAddStudent}
    />
  )
}

export default DashboardPage
