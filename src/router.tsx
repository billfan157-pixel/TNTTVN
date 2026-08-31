import { createRootRoute, createRoute, createRouter,  redirect } from '@tanstack/react-router'
import { useAuthStore } from './stores/authStore'
import { RootLayout, PageSuspense } from './components/common/RootLayout'
import { setNavigateToLogin } from './lib/api'
import { lazyWithRetry } from './utils/lazyWithRetry'
import { ROUTE_POLICIES, type ProtectedRoutePath } from './constants/routePolicy'

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

const patchedViewTransitionDocuments = new WeakSet<Document>()
const expectedViewTransitionInterruptions = new Set([
  'AbortError',
  'InvalidStateError',
  'TimeoutError',
])

export function isExpectedViewTransitionInterruption(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && typeof error.name === 'string'
    && expectedViewTransitionInterruptions.has(error.name)
}

/**
 * TanStack Router intentionally does not await the ViewTransition object.
 * Chromium may reject `ready`/`finished` when rapid SPA navigation supersedes
 * an in-flight transition; observe those expected interruptions so they do not
 * become global unhandled rejections. `updateCallbackDone` is deliberately left
 * untouched so application/update errors remain visible to the error boundary.
 */
export function installSafeViewTransitionHandling(doc: Document) {
  if (patchedViewTransitionDocuments.has(doc) || typeof doc.startViewTransition !== 'function') return

  const nativeStartViewTransition = doc.startViewTransition.bind(doc)
  doc.startViewTransition = (callbackOptions) => {
    const transition = nativeStartViewTransition(callbackOptions)
    const observeInterruption = (promise: Promise<void>) => {
      void promise.catch(error => {
        if (isExpectedViewTransitionInterruption(error)) return
        queueMicrotask(() => { throw error })
      })
    }

    observeInterruption(transition.ready)
    observeInterruption(transition.finished)
    return transition
  }
  patchedViewTransitionDocuments.add(doc)
}

const userPrefersReducedMotion = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const nativeRouteMotionEnabled = typeof document !== 'undefined'
  && 'startViewTransition' in document
  && !userPrefersReducedMotion

if (nativeRouteMotionEnabled) installSafeViewTransitionHandling(document)

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

function requireRouteAccess(path: ProtectedRoutePath) {
  return requireRole(...ROUTE_POLICIES[path].roles)
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
  beforeLoad: requireRouteAccess('/dashboard'),
  component: () => (
    <PageSuspense>
      <DashboardPage />
    </PageSuspense>
  ),
})

const studentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/students',
  beforeLoad: requireRouteAccess('/students'),
  component: () => (
    <PageSuspense>
      <StudentsPage />
    </PageSuspense>
  ),
})

const gradesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/grades',
  beforeLoad: requireRouteAccess('/grades'),
  component: () => (
    <PageSuspense>
      <GradesPage />
    </PageSuspense>
  ),
})

const attendanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/attendance',
  beforeLoad: requireRouteAccess('/attendance'),
  component: () => (
    <PageSuspense>
      <AttendancePage />
    </PageSuspense>
  ),
})

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports',
  beforeLoad: requireRouteAccess('/reports'),
  component: () => (
    <PageSuspense>
      <ReportsPage />
    </PageSuspense>
  ),
})

const noticesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notices',
  beforeLoad: requireRouteAccess('/notices'),
  component: () => (
    <PageSuspense>
      <NoticesPage />
    </PageSuspense>
  ),
})

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users',
  beforeLoad: requireRouteAccess('/users'),
  component: () => (
    <PageSuspense>
      <UsersPage />
    </PageSuspense>
  ),
})

const classesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/classes',
  beforeLoad: requireRouteAccess('/classes'),
  component: () => (
    <PageSuspense>
      <ClassesPage />
    </PageSuspense>
  ),
})

const academicYearRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/academic-years',
  beforeLoad: requireRouteAccess('/academic-years'),
  component: () => (
    <PageSuspense>
      <AcademicYearPage />
    </PageSuspense>
  ),
})

const catechistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/catechists',
  beforeLoad: requireRouteAccess('/catechists'),
  component: () => (
    <PageSuspense>
      <CatechistPage />
    </PageSuspense>
  ),
})

const auditLogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit-logs',
  beforeLoad: requireRouteAccess('/audit-logs'),
  component: () => (
    <PageSuspense>
      <AuditLogPage />
    </PageSuspense>
  ),
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  beforeLoad: requireRouteAccess('/settings'),
  component: () => (
    <PageSuspense>
      <SettingsPage />
    </PageSuspense>
  ),
})

const managementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/management',
  beforeLoad: requireRouteAccess('/management'),
  component: () => (
    <PageSuspense>
      <ManagementPage />
    </PageSuspense>
  ),
})

const parentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/parent',
  beforeLoad: requireRouteAccess('/parent'),
  component: () => (
    <PageSuspense>
      <ParentPage />
    </PageSuspense>
  ),
})

const leaveRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/leave-requests',
  beforeLoad: requireRouteAccess('/leave-requests'),
  component: () => (
    <PageSuspense>
      <LeaveRequestsPage />
    </PageSuspense>
  ),
})

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  beforeLoad: requireRouteAccess('/calendar'),
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
  beforeLoad: requireRouteAccess('/finances'),
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
  // Links can request viewport/intent preload. Mobile button navigation additionally
  // uses useMobileRoutePreload so role-visible chunks warm sequentially during idle.
  defaultPreload: 'viewport',
  defaultPreloadStaleTime: 10_000,
  // Avoid flash of loader for fast (<200ms) transitions; keep loader min 300ms to prevent flicker.
  defaultPendingMs: 150,
  defaultPendingMinMs: 300,
  // Native View Transition when supported; CSS fallback owns older browsers.
  // Search/filter-only updates stay motionless to preserve workspace continuity.
  defaultViewTransition: nativeRouteMotionEnabled
    ? { types: ({ pathChanged }) => pathChanged ? ['app-page-change'] : false }
    : false,
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
