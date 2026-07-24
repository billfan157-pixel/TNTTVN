import { DesktopGradeMatrix } from '../components/desktop/DesktopGradeMatrix'
import { MobileGradeView } from '../components/mobile/MobileGradeView'
import { useUIStore } from '../stores/uiStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'

export function GradesPage() {
  const effectiveMode = useEffectiveMode()
  const { openReport } = useUIStore()

  if (effectiveMode === 'desktop') {
    return <DesktopGradeMatrix />
  }

  return <MobileGradeView onViewReport={openReport} />
}

export default GradesPage
