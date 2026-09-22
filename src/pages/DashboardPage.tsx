import React, { Suspense, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MobileHomeView } from '../components/mobile/MobileHomeView'
import { useUIStore } from '../stores/uiStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { useAuth } from '../hooks/useAuth'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import { SkeletonCardGrid } from '../components/common/StateFeedback'

// Desktop + parent dashboards stay out of the initial dashboard chunk; they
// load on demand only when actually rendered. Parent users (mobile-majority)
// get their chunk warmed during idle so login never pays a roundtrip.
const DesktopDashboard = lazyWithRetry(() => import('../components/desktop/DesktopDashboard'), 'DesktopDashboard')
const ParentDashboard = lazyWithRetry(() => import('../components/common/ParentDashboard'), 'ParentDashboard')

export function DashboardPage() {
  const navigate = useNavigate()
  const effectiveMode = useEffectiveMode()
  const { openAddStudent } = useUIStore()
  const { isPhuhuynh } = useAuth()

  useEffect(() => {
    if (!isPhuhuynh || typeof window === 'undefined') return
    const warm = () => { void ParentDashboard.preload().catch(() => {}) }
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(warm, { timeout: 1_500 })
      return () => window.cancelIdleCallback(idleId)
    }
    const timerId = setTimeout(warm, 600)
    return () => clearTimeout(timerId)
  }, [isPhuhuynh])

  if (isPhuhuynh) {
    return <Suspense fallback={<SkeletonCardGrid count={3} />}><ParentDashboard /></Suspense>
  }

  if (effectiveMode === 'desktop') {
    return (
      <Suspense fallback={<SkeletonCardGrid count={3} />}>
        <DesktopDashboard onOpenAddStudent={openAddStudent} />
      </Suspense>
    )
  }

  return (
    <MobileHomeView
      onNavigateTab={(tab) => navigate({ to: tab === 'home' ? '/dashboard' : `/${tab}` })}
      onOpenAddStudent={openAddStudent}
    />
  )
}

export default DashboardPage
