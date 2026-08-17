import React from 'react'
import { createRootRoute, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { useAuthStore } from './stores/authStore'
import { RootLayout, PageSuspense } from './components/common/RootLayout'
import { useClassStore } from './stores/classStore'
import { setNavigateToLogin } from './lib/api'
import { lazyWithRetry } from './utils/lazyWithRetry'
import type { ClassInfo } from './types'

const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'))
const StudentsPage = lazyWithRetry(() => import('./pages/StudentsPage'))
const GradesPage = lazyWithRetry(() => import('./pages/GradesPage'))
const AttendancePage = lazyWithRetry(() => import('./pages/AttendancePage'))
const ReportsPage = lazyWithRetry(() => import('./pages/ReportsPage'))
const NoticesPage = lazyWithRetry(() => import('./pages/NoticesPage'))
const UsersPage = lazyWithRetry(() => import('./pages/UsersPage'))
const ClassesPage = lazyWithRetry(() => import('./pages/ClassesPage'))
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'))
const StaffLoginPage = lazyWithRetry(() => import('./pages/StaffLoginPage'))
const ParentLoginPage = lazyWithRetry(() => import('./pages/ParentLoginPage'))
const AuditLogPage = lazyWithRetry(() => import('./pages/AuditLogPage'))
const AcademicYearPage = lazyWithRetry(() => import('./pages/AcademicYearPage'))
const CatechistPage = lazyWithRetry(() => import('./pages/CatechistPage'))
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'))
const ManagementPage = lazyWithRetry(() => import('./pages/ManagementPage'))
const ParentPage = lazyWithRetry(() => import('./pages/ParentPage'))
const VerificationPage = lazyWithRetry(() => import('./pages/VerificationPage'))
const LeaveRequestsPage = lazyWithRetry(() => import('./pages/LeaveRequestsPage'))
const CalendarPage = lazyWithRetry(() => import('./pages/CalendarPage'))
const FinancePage = lazyWithRetry(() => import('./pages/FinancePage'))

// SECURITY (2026-08-11) — A-NEW-10 hardening: access token memory-only.
// Router guard KHÔNG còn dựa vào access token (sau reload memory rỗng) — dựa vào
// `parish_current_user` (auth state persist). Access token được bootstrap lại qua
// POST /auth/refresh (HttpOnly cookie) trong authStore.loadFromStorage(). Nếu
// refresh thất bại (cookie hết hạn/revoked) → request() 401 → redirectToLogin().
function requireAuth() {
  try {
    const raw = localStorage.getItem('parish_current_user')
    if (raw) {
      const user = JSON.parse(raw)
      if (user && user.id) return
    }
  } catch {}
  throw redirect({ to: '/login' })
}

function requireRole(...roles: string[]) {
  return () => {
    requireAuth()
    try {
      const raw = localStorage.getItem('parish_current_user')
      if (raw) {
        const user = JSON.parse(raw)
        if (roles.includes(user.role)) return
      }
    } catch {}
    throw redirect({ to: '/dashboard' })
  }
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' })
  },
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  beforeLoad: requireAuth,
  component: () => (
    <PageSuspense>
      <DashboardPage />
    </PageSuspense>
  ),
})

const studentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/students',
  beforeLoad: requireAuth,
  component: () => (
    <PageSuspense>
      <StudentsPage />
    </PageSuspense>
  ),
})

const gradesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/grades',
  beforeLoad: requireAuth,
  component: () => (
    <PageSuspense>
      <GradesPage />
    </PageSuspense>
  ),
})

const attendanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/attendance',
  beforeLoad: requireAuth,
  component: () => (
    <PageSuspense>
      <AttendancePage />
    </PageSuspense>
  ),
})

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports',
  beforeLoad: requireAuth,
  component: () => (
    <PageSuspense>
      <ReportsPage />
    </PageSuspense>
  ),
})

const noticesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notices',
  beforeLoad: requireAuth,
  component: () => (
    <PageSuspense>
      <NoticesPage />
    </PageSuspense>
  ),
})

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users',
  beforeLoad: requireRole('admin'),
  component: () => (
    <PageSuspense>
      <UsersPage />
    </PageSuspense>
  ),
})

const classesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/classes',
  beforeLoad: requireRole('admin'),
  component: () => (
    <PageSuspense>
      <ClassesPage />
    </PageSuspense>
  ),
})

const academicYearRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/academic-years',
  beforeLoad: requireRole('admin'),
  component: () => (
    <PageSuspense>
      <AcademicYearPage />
    </PageSuspense>
  ),
})

const catechistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/catechists',
  beforeLoad: requireRole('admin'),
  component: () => (
    <PageSuspense>
      <CatechistPage />
    </PageSuspense>
  ),
})

const auditLogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit-logs',
  beforeLoad: requireRole('admin'),
  component: () => (
    <PageSuspense>
      <AuditLogPage />
    </PageSuspense>
  ),
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  beforeLoad: requireAuth,
  component: () => (
    <PageSuspense>
      <SettingsPage />
    </PageSuspense>
  ),
})

const managementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/management',
  beforeLoad: requireRole('admin'),
  component: () => (
    <PageSuspense>
      <ManagementPage />
    </PageSuspense>
  ),
})

const parentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/parent',
  beforeLoad: requireRole('admin', 'phuhuynh'),
  component: () => (
    <PageSuspense>
      <ParentPage />
    </PageSuspense>
  ),
})

const leaveRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/leave-requests',
  beforeLoad: requireRole('admin', 'chunhiem', 'phuta'),
  component: () => (
    <PageSuspense>
      <LeaveRequestsPage />
    </PageSuspense>
  ),
})

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  beforeLoad: requireAuth,
  component: () => (
    <PageSuspense>
      <CalendarPage />
    </PageSuspense>
  ),
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => (
    <PageSuspense>
      <LoginPage />
    </PageSuspense>
  ),
})

const staffLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login/nhan-su',
  component: () => (
    <PageSuspense>
      <StaffLoginPage />
    </PageSuspense>
  ),
})

const parentLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login/phuhuynh',
  component: () => (
    <PageSuspense>
      <ParentLoginPage />
    </PageSuspense>
  ),
})

const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify',
  component: () => (
    <PageSuspense>
      <VerificationPage />
    </PageSuspense>
  ),
})

const financeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/finances',
  beforeLoad: requireRole('admin'),
  component: () => (
    <PageSuspense>
      <FinancePage />
    </PageSuspense>
  ),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  studentsRoute,
  gradesRoute,
  attendanceRoute,
  reportsRoute,
  noticesRoute,
  usersRoute,
  classesRoute,
  loginRoute,
  staffLoginRoute,
  parentLoginRoute,
  auditLogRoute,
  academicYearRoute,
  catechistRoute,
  settingsRoute,
  managementRoute,
  parentRoute,
  leaveRequestsRoute,
  calendarRoute,
  verifyRoute,
  financeRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Set up the API client to navigate to login on 401
setNavigateToLogin(() => {
  useAuthStore.getState().logout()
  router.navigate({ to: '/login' })
})
