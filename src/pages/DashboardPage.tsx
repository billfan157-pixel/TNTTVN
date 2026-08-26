import React, {  } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { DesktopDashboard } from '../components/desktop/DesktopDashboard'
import { MobileHomeView } from '../components/mobile/MobileHomeView'
import { ParentDashboard } from '../components/common/ParentDashboard'
import { useUIStore } from '../stores/uiStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { useAuth } from '../hooks/useAuth'

export function DashboardPage() {
  const navigate = useNavigate()
  const effectiveMode = useEffectiveMode()
  const { openAddStudent } = useUIStore()
  const { isPhuhuynh } = useAuth()

  if (isPhuhuynh) {
    return <ParentDashboard />
  }

  if (effectiveMode === 'desktop') {
    return <DesktopDashboard onOpenAddStudent={openAddStudent} />
  }

  return (
    <MobileHomeView
      onNavigateTab={(tab) => navigate({ to: tab === 'home' ? '/dashboard' : `/${tab}` })}
      onOpenAddStudent={openAddStudent}
    />
  )
}

export default DashboardPage
