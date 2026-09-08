import { useEffect, useState } from 'react'
import {
  Home,
  CheckSquare,
  FileSpreadsheet,
  Users,
  PieChart,
  HeartHandshake,
  Calendar,
  Wallet,
  Bell,
  FileText,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { canRoleAccessRoute, type MobileRouteTab, type WorkspaceId } from '../../constants/routePolicy'

export type MobileTab = MobileRouteTab

interface MobileBottomNavProps {
  activeTab: MobileTab | null
  setActiveTab: (tab: MobileTab) => void | Promise<void>
  preloadTab?: (tab: MobileTab) => void
  activeWorkspace?: WorkspaceId
}

interface MobileNavItem {
  id: MobileTab
  label: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeTab, setActiveTab, preloadTab, activeWorkspace }) => {
  const { role } = useAuth()
  const [pendingTab, setPendingTab] = useState<MobileTab | null>(null)

  useEffect(() => {
    setPendingTab(current => current === activeTab ? null : current)
  }, [activeTab])

  const orgTabs: MobileNavItem[] = [
    { id: 'parish-home', label: 'Tổng Quan', icon: Home },
    ...(canRoleAccessRoute('/catechists', role) ? [{ id: 'catechists' as const, label: 'Huynh Trưởng', icon: Users }] : []),
    ...(canRoleAccessRoute('/calendar', role) ? [{ id: 'calendar' as const, label: 'Lịch Xứ', icon: Calendar }] : []),
    ...(canRoleAccessRoute('/finances', role)
      ? [{ id: 'finances' as const, label: 'Sổ Quỹ', icon: Wallet }]
      : canRoleAccessRoute('/notices', role)
        ? [{ id: 'notices' as const, label: 'Thông Báo', icon: Bell }]
        : []),
    ...(canRoleAccessRoute('/parish-profile', role) ? [{ id: 'parish-profile' as const, label: 'Hồ Sơ Xứ', icon: FileText }] : []),
  ]

  const academicTabs: MobileNavItem[] = [
    { id: 'home', label: 'Trang Chủ', icon: Home },
    ...(canRoleAccessRoute('/attendance', role) ? [{ id: 'attendance' as const, label: 'Điểm Danh', icon: CheckSquare }] : []),
    ...(canRoleAccessRoute('/grades', role) ? [{ id: 'grades' as const, label: 'Bảng Điểm', icon: FileSpreadsheet }] : []),
    ...(canRoleAccessRoute('/parent', role)
      ? [{ id: 'parent' as const, label: 'Con Tôi', icon: HeartHandshake }]
      : canRoleAccessRoute('/students', role)
        ? [{ id: 'students' as const, label: 'Thiếu Nhi', icon: Users }]
        : []),
    ...(canRoleAccessRoute('/reports', role) ? [{ id: 'reports' as const, label: 'Báo Cáo', icon: PieChart }] : []),
  ]

  const tabs = activeWorkspace === 'organization' ? orgTabs : academicTabs

  return (
    <nav className="mobile-bottom-nav" aria-label="Điều hướng chính">
      <div className="mobile-bottom-nav__inner">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const isVisuallyActive = (pendingTab ?? activeTab) === tab.id
          const isPending = pendingTab === tab.id && !isActive

          return (
            <button
              key={tab.id}
              type="button"
              className={`mobile-bottom-nav__item touch-manipulation${isVisuallyActive ? ' is-active' : ''}${isPending ? ' is-pending' : ''}`}
              onPointerDown={() => preloadTab?.(tab.id)}
              onFocus={() => preloadTab?.(tab.id)}
              onClick={() => {
                if ('vibrate' in navigator) try { navigator.vibrate(8) } catch {}
                if (isActive) return
                setPendingTab(tab.id)
                void Promise.resolve(setActiveTab(tab.id)).catch(() => {
                  setPendingTab(current => current === tab.id ? null : current)
                })
              }}
              aria-current={isActive ? 'page' : undefined}
              aria-busy={isPending || undefined}
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
