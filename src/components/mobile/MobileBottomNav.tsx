import { useEffect, useState } from 'react'
import {
  Home,
  CheckSquare,
  FileSpreadsheet,
  Users,
  PieChart,
  HeartHandshake,
  Calendar,
  Bell,
  FileText,
  ClipboardList,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { canRoleAccessRoute, type MobileRouteTab, type WorkspaceId } from '../../constants/routePolicy'

export type MobileTab = MobileRouteTab

interface MobileBottomNavProps {
  activeTab: MobileTab | null
  setActiveTab: (tab: MobileTab) => void | Promise<void>
  preloadTab?: (tab: MobileTab) => void
  activeWorkspace?: WorkspaceId
  /** W2.10: pending-operation count shown as a badge on the org "Công Việc" tab. */
  operationsBadge?: number
}

interface MobileNavItem {
  id: MobileTab
  label: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeTab, setActiveTab, preloadTab, activeWorkspace, operationsBadge }) => {
  const { role } = useAuth()
  const [pendingTab, setPendingTab] = useState<MobileTab | null>(null)

  useEffect(() => {
    setPendingTab(current => current === activeTab ? null : current)
  }, [activeTab])

  // Wave 0 DECIDED: Tổng Quan · Lịch · Công Việc · Thông Báo · Hồ Sơ
  // (Huynh Trưởng + Sổ Quỹ → MobileTopBar overflow / secondary routes)
  const orgTabs: MobileNavItem[] = [
    { id: 'parish-home', label: 'Tổng Quan', icon: Home },
    ...(canRoleAccessRoute('/calendar', role) ? [{ id: 'calendar' as const, label: 'Lịch Xứ', icon: Calendar }] : []),
    ...(canRoleAccessRoute('/operations', role) ? [{ id: 'operations' as const, label: 'Công Việc', icon: ClipboardList }] : []),
    ...(canRoleAccessRoute('/notices', role) ? [{ id: 'notices' as const, label: 'Thông Báo', icon: Bell }] : []),
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
          // W2.10: async dispatch/acknowledgement work is invisible until the
          // user opens the page — badge the org "Công Việc" tab with the count
          // of responses owed (0/undefined hides it; offline never badges).
          const badgeCount = tab.id === 'operations' && operationsBadge && operationsBadge > 0 ? operationsBadge : 0
          const badgeText = badgeCount > 99 ? '99+' : String(badgeCount)

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
              aria-label={badgeCount ? `${tab.label} · ${badgeCount} việc chờ phản hồi` : tab.label}
            >
              <span className="mobile-bottom-nav__icon" aria-hidden="true">
                <Icon size={21} strokeWidth={isActive ? 2.4 : 2} />
                {badgeCount > 0 && <span className="mobile-bottom-nav__badge" aria-hidden="true">{badgeText}</span>}
              </span>
              <span className="mobile-bottom-nav__label">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
