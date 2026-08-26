import {
  Home,
  CheckSquare,
  FileSpreadsheet,
  Users,
  PieChart,
  HeartHandshake,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

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
  activeTab: MobileTab
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
    ...(role === 'phuhuynh' ? [] : [{ id: 'attendance' as const, label: 'Điểm danh', icon: CheckSquare }]),
    ...(role === 'phuhuynh' ? [] : [{ id: 'grades' as const, label: 'Bảng điểm', icon: FileSpreadsheet }]),
    ...(role === 'phuhuynh'
      ? [{ id: 'parent' as const, label: 'Con tôi', icon: HeartHandshake }]
      : [{ id: 'students' as const, label: 'Thiếu nhi', icon: Users }]),
    ...(role === 'phuhuynh' || role === 'phuta'
      ? []
      : [{ id: 'reports' as const, label: 'Báo cáo', icon: PieChart }]),
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
              className={`mobile-bottom-nav__item${isActive ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
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
