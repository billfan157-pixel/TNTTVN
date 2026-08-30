import { DesktopLeaveRequests } from '../components/desktop/DesktopLeaveRequests'
import { MobileLeaveRequests } from '../components/mobile/MobileLeaveRequests'
import { useEffectiveMode } from '../hooks/useEffectiveMode'

export function LeaveRequestsPage() {
  const effectiveMode = useEffectiveMode()

  if (effectiveMode === 'desktop') {
    return <DesktopLeaveRequests />
  }

  return (
    <div className="mobile-screen">
      <MobileLeaveRequests />
    </div>
  )
}

export default LeaveRequestsPage
