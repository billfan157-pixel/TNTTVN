import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  DESKTOP_TAB_PATHS,
  MOBILE_TAB_PATHS,
  ROUTE_POLICIES,
  canRoleAccessRoute,
  getMobilePreloadPaths,
  getRoutePolicy,
} from '../constants/routePolicy'

describe('frontend route policy SSOT (ADR-072)', () => {
  it('keeps parent and staff workspaces mutually isolated', () => {
    for (const path of ['/students', '/grades', '/attendance', '/reports'] as const) {
      expect(canRoleAccessRoute(path, 'phuhuynh')).toBe(false)
      expect(canRoleAccessRoute(path, 'admin')).toBe(true)
      expect(canRoleAccessRoute(path, 'chunhiem')).toBe(true)
      expect(canRoleAccessRoute(path, 'phuta')).toBe(true)
    }

    expect(canRoleAccessRoute('/parent', 'phuhuynh')).toBe(true)
    expect(canRoleAccessRoute('/parent', 'admin')).toBe(false)
    expect(canRoleAccessRoute('/parent', 'chunhiem')).toBe(false)
    expect(canRoleAccessRoute('/parent', 'phuta')).toBe(false)
  })

  it('gives every protected route an explicit non-empty role set and title', () => {
    for (const [path, policy] of Object.entries(ROUTE_POLICIES)) {
      expect(policy.mobileTitle, `${path} title`).not.toBe('')
      if (policy.requiresAuth) expect(policy.roles.length, `${path} roles`).toBeGreaterThan(0)
    }
  })

  it('derives every desktop and mobile tab destination from the same policy', () => {
    for (const path of Object.values(DESKTOP_TAB_PATHS)) {
      expect(getRoutePolicy(path)?.desktopTab, path).toBeTruthy()
    }
    for (const [tab, path] of Object.entries(MOBILE_TAB_PATHS)) {
      expect(getRoutePolicy(path)?.mobileTab, path).toBe(tab)
    }
  })

  it('prefetches only role-visible mobile destinations', () => {
    expect(getMobilePreloadPaths('phuhuynh')).toEqual(['/dashboard', '/parent'])
    expect(getMobilePreloadPaths('phuta')).toEqual([
      '/dashboard',
      '/attendance',
      '/grades',
      '/students',
      '/reports',
    ])
    expect(getMobilePreloadPaths(null)).toEqual([])
  })

  it('wires every protected policy into the router guard', () => {
    const routerSource = fs.readFileSync(path.resolve(__dirname, '../router.tsx'), 'utf8')
    for (const [routePath, policy] of Object.entries(ROUTE_POLICIES)) {
      if (!policy.requiresAuth) continue
      expect(routerSource, routePath).toContain(`beforeLoad: requireRouteAccess('${routePath}')`)
    }
  })
})
