import { useCallback, useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  MOBILE_TAB_PATHS,
  canRoleAccessRoute,
  getMobilePreloadPaths,
  type MobileRouteTab,
} from '../constants/routePolicy'
import type { Role } from '../types'

type EffectiveMode = 'desktop' | 'mobile'

/**
 * Warms role-visible mobile route chunks without creating a parse burst.
 *
 * Routes are loaded one at a time during idle periods. Pointer/focus preloading
 * remains available for a destination that the idle queue has not reached yet.
 */
export function useMobileRoutePreload(mode: EffectiveMode, role: Role | null | undefined) {
  const router = useRouter()

  const preloadTab = useCallback((tab: MobileRouteTab) => {
    const path = MOBILE_TAB_PATHS[tab]
    if (!role || !canRoleAccessRoute(path, role)) return
    void router.preloadRoute({ to: path }).catch(() => {})
  }, [role, router])

  useEffect(() => {
    if (mode !== 'mobile' || !role || typeof window === 'undefined') return

    const targets = getMobilePreloadPaths(role)
      .filter(path => path !== window.location.pathname)
    let nextIndex = 0
    let cancelled = false
    let idleId: number | undefined
    let timerId: ReturnType<typeof setTimeout> | undefined

    const scheduleNext = () => {
      if (cancelled || nextIndex >= targets.length) return

      const run = () => {
        if (cancelled) return
        const path = targets[nextIndex++]
        void router.preloadRoute({ to: path })
          .catch(() => {})
          .finally(scheduleNext)
      }

      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(run, { timeout: 1_500 })
      } else {
        timerId = setTimeout(run, 600)
      }
    }

    scheduleNext()
    return () => {
      cancelled = true
      if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId)
      if (timerId !== undefined) clearTimeout(timerId)
    }
  }, [mode, role, router])

  return preloadTab
}
