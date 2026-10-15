import { createMemoryHistory, Outlet } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { loaded } = vi.hoisted(() => ({ loaded: vi.fn() }))

vi.mock('../components/common/RootLayout', async importOriginal => ({
  ...await importOriginal<typeof import('../components/common/RootLayout')>(),
  RootLayout: () => <Outlet />,
}))
vi.mock('../pages/StudentsPage', () => {
  loaded('/students')
  return { default: () => <div>Students</div> }
})
vi.mock('../pages/GradesPage', () => {
  loaded('/grades')
  return { default: () => <div>Grades</div> }
})
vi.mock('../pages/AttendancePage', () => {
  loaded('/attendance')
  return { default: () => <div>Attendance</div> }
})
vi.mock('../pages/OrganizationDashboardPage', () => {
  loaded('/parish')
  return { default: () => <div>Organization</div> }
})
vi.mock('../pages/OperationsPage', () => {
  loaded('/operations')
  return { default: () => <div>Operations</div> }
})
vi.mock('../pages/LoginPage', () => {
  loaded('/login')
  return { default: () => <div>Login</div> }
})
vi.mock('../pages/UsersPage', () => {
  loaded('/users')
  return { default: () => <div>Users</div> }
})

import { router } from '../router'
import { preloadRouteCode } from '../utils/preloadRouteCode'

router.update({ history: createMemoryHistory({ initialEntries: ['/dashboard'] }) })

afterEach(() => localStorage.removeItem('parish_current_user'))

describe('application route chunk readiness', () => {
  it.each(['/students', '/grades', '/attendance', '/parish', '/operations', '/login'] as const)(
    'loads %s through the real router preload without mounting its page',
    async to => {
      localStorage.setItem('parish_current_user', JSON.stringify({ id: 'admin-1', role: 'admin' }))
      const pathname = router.state.location.pathname
      const cachedMatches = router.stores.cachedMatches.get()

      await preloadRouteCode(router, to)

      expect(loaded).toHaveBeenCalledWith(to)
      expect(router.stores.cachedMatches.get()).toBe(cachedMatches)

      await router.preloadRoute({ to })

      expect(loaded).toHaveBeenCalledWith(to)
      expect(router.state.location.pathname).toBe(pathname)
    },
  )

  it('does not import an admin-only page for a staff member', async () => {
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'staff-1', role: 'phuta' }))

    await router.preloadRoute({ to: '/users' })

    expect(loaded).not.toHaveBeenCalledWith('/users')
  })
})
