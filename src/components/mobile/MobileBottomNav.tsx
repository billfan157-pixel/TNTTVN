import {
  Home,
  CheckSquare,
  FileSpreadsheet,
  Users,
  PieChart,
  HeartHandshake,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { canRoleAccessRoute } from '../../constants/routePolicy'

export type MobileTab =
  | 'home'
  | 'attendance'
  | 'grades'
  | 'students'
  | 'reports'
  | 'settings'
  | 'parent'
  | 'notices'

interface MobileBottomNavProps {
  activeTab: MobileTab | null
  setActiveTab: (tab: MobileTab) => void
}

interface MobileNavItem {
  id: MobileTab
  label: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { role } = useAuth()
  const tabs: MobileNavItem[] = [
    { id: 'home', label: 'Trang chủ', icon: Home },
    ...(canRoleAccessRoute('/attendance', role) ? [{ id: 'attendance' as const, label: 'Điểm danh', icon: CheckSquare }] : []),
    ...(canRoleAccessRoute('/grades', role) ? [{ id: 'grades' as const, label: 'Bảng điểm', icon: FileSpreadsheet }] : []),
    ...(canRoleAccessRoute('/parent', role)
      ? [{ id: 'parent' as const, label: 'Con tôi', icon: HeartHandshake }]
      : canRoleAccessRoute('/students', role)
        ? [{ id: 'students' as const, label: 'Thiếu nhi', icon: Users }]
        : []),
    ...(canRoleAccessRoute('/reports', role) ? [{ id: 'reports' as const, label: 'Báo cáo', icon: PieChart }] : []),
  ]

  return (
    <nav className="mobile-bottom-nav" aria-label="Điều hướng chính">
      <div className="mobile-bottom-nav__inner">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              className={`mobile-bottom-nav__item touch-manipulation${isActive ? ' is-active' : ''}`}
              onClick={() => {
                if ('vibrate' in navigator) try { navigator.vibrate(8) } catch {}
                setActiveTab(tab.id)
              }}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
            >
              <span className="mobile-bottom-nav__icon" aria-hidden="true">
                <Icon size={21} strokeWidth={isActive ? 2.4 : 2} />
              </span>
              <span className="mobile-bottom-nav__label">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
