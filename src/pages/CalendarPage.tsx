import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { DesktopCalendarView } from '../components/desktop/DesktopCalendarView'
import { MobileCalendarView } from '../components/mobile/MobileCalendarView'

export const CalendarPage: React.FC = () => {
  const mode = useEffectiveMode()
  return mode === 'desktop' ? <DesktopCalendarView /> : <MobileCalendarView />
}

export default CalendarPage
