import { DesktopLeaveRequests } from '../components/desktop/DesktopLeaveRequests'
import { MobileLeaveRequests } from '../components/mobile/MobileLeaveRequests'
import { useEffectiveMode } from '../hooks/useEffectiveMode'

export function LeaveRequestsPage() {
  const effectiveMode = useEffectiveMode()

  if (effectiveMode === 'desktop') {
    return <DesktopLeaveRequests />
  }

  return <MobileLeaveRequests />
}

export default LeaveRequestsPage
