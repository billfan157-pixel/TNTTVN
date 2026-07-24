import { lazy, Suspense } from 'react'
import { createRootRoute, createRoute, createRouter, Navigate, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { HeaderBar } from './components/common/HeaderBar'
import { DesktopSidebar } from './components/desktop/DesktopSidebar'
import { MobileBottomNav } from './components/mobile/MobileBottomNav'
import { StudentModal } from './components/common/StudentModal'
import { StudentReportModal } from './components/common/StudentReportModal'
import { InstallPrompt } from './components/common/InstallPrompt'
import { PhotoCard } from './components/common/PhotoCard'
import { Certificate } from './components/common/Certificate'
import { useSundayReminder } from './hooks/useSundayReminder'
import { useUIStore } from './stores/uiStore'
import { useFilterStore } from './stores/filterStore'
import { useFilterSearchSync } from './stores/useFilterSearchSync'
import { useEffectiveMode } from './hooks/useEffectiveMode'
import { useSyncEngine } from './hooks/useSyncEngine'
import { MOCK_CLASSES, BRANCHES } from './data/mockParishData'
import type { DesktopTab } from './components/desktop/DesktopSidebar'
import type { MobileTab } from './components/mobile/MobileBottomNav'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const StudentsPage = lazy(() => import('./pages/StudentsPage'))
const GradesPage = lazy(() => import('./pages/GradesPage'))
const AttendancePage = lazy(() => import('./pages/AttendancePage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const NoticesPage = lazy(() => import('./pages/NoticesPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))

function getAccessToken(): string | null {
  try {
    return localStorage.getItem('parish_access_token')
  } catch {
    return null
  }
}

function requireAuth() {
  const token = getAccessToken()
  if (!token) {
    return { redirect: { to: '/login' as const } }
  }
}

function requireRole(...roles: string[]) {
  return () => {
    try {
      const raw = localStorage.getItem('parish_current_user')
      if (raw) {
        const user = JSON.parse(raw)
        if (roles.includes(user.role)) return
      }
    } catch {}
    return { redirect: { to: '/dashboard' as const } }
  }
}

const PageSuspense = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={
    <div className="flex items-center justify-center h-64 text-text-muted text-sm">
      Đang tải...
    </div>
  }>
    {children}
  </Suspense>
)

const routeToTab: Record<string, DesktopTab> = {
  '/dashboard': 'dashboard',
  '/students': 'students',
  '/grades': 'grades',
  '/attendance': 'attendance',
  '/reports': 'reports',
  '/notices': 'notices',
  '/users': 'users',
}

function RootLayout() {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  useFilterSearchSync()
  useSyncEngine()
  useSundayReminder()

  const activeTab: DesktopTab = routeToTab[pathname] || 'dashboard'
  const activeMobileTab: MobileTab = (routeToTab[pathname] as MobileTab) || 'home'

  const selectedBranchId = useFilterStore(s => s.selectedBranchId)
  const setSelectedBranchId = useFilterStore(s => s.setSelectedBranchId)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)

  const {
    isStudentModalOpen,
    studentToEdit,
    isReportModalOpen,
    studentForReport,
    isPhotoCardOpen,
    photoCardStudent,
    isCertificateOpen,
    certificateStudent,
    certificateType,
    closeStudentModal,
    closeReport,
    closePhotoCard,
    closeCertificate,
  } = useUIStore()

  const effectiveMode = useEffectiveMode()

  if (pathname === '/login') {
    return (
      <PageSuspense>
        <Outlet />
      </PageSuspense>
    )
  }

  const handleSelectTab = (tab: DesktopTab) => {
    navigate({ to: `/${tab}` })
  }

  const handleSelectMobileTab = (tab: MobileTab) => {
    if (tab === 'home') navigate({ to: '/dashboard' })
    else navigate({ to: `/${tab}` })
  }

  return (
    <div className="min-h-screen bg-surface-app text-text-main font-sans transition-colors duration-200">
      <HeaderBar />

      {effectiveMode === 'desktop' ? (
        <div className="flex min-h-[calc(100vh-68px)]">
          <DesktopSidebar
            activeTab={activeTab}
            setActiveTab={handleSelectTab}
            selectedBranchId={selectedBranchId}
            setSelectedBranchId={setSelectedBranchId}
            selectedClassId={selectedClassId}
            setSelectedClassId={setSelectedClassId}
            classes={MOCK_CLASSES}
            branches={BRANCHES}
          />
          <main className="flex-1 p-6 overflow-y-auto">
            <PageSuspense>
              <Outlet />
            </PageSuspense>
          </main>
        </div>
      ) : (
        <div className="pb-20">
          <main className="p-4">
            <PageSuspense>
              <Outlet />
            </PageSuspense>
          </main>
          <MobileBottomNav
            activeTab={activeMobileTab}
            setActiveTab={handleSelectMobileTab}
          />
        </div>
      )}

      {/* Shared Modals */}
      <StudentModal
        isOpen={isStudentModalOpen}
        onClose={closeStudentModal}
        studentToEdit={studentToEdit}
      />
      <StudentReportModal
        isOpen={isReportModalOpen}
        onClose={closeReport}
        student={studentForReport}
      />
      <PhotoCard
        isOpen={isPhotoCardOpen}
        onClose={closePhotoCard}
        student={photoCardStudent}
      />
      <Certificate
        isOpen={isCertificateOpen}
        onClose={closeCertificate}
        student={certificateStudent}
        type={certificateType}
      />
      <InstallPrompt />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </div>
  )
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <Navigate to="/dashboard" replace />,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  beforeLoad: requireAuth,
  component: DashboardPage,
})

const studentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/students',
  beforeLoad: requireAuth,
  component: StudentsPage,
})

const gradesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/grades',
  beforeLoad: requireAuth,
  onEnter: requireRole('admin', 'chunhiem', 'phuta'),
  component: GradesPage,
})

const attendanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/attendance',
  beforeLoad: requireAuth,
  onEnter: requireRole('admin', 'chunhiem', 'phuta'),
  component: AttendancePage,
})

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports',
  beforeLoad: requireAuth,
  onEnter: requireRole('admin', 'chunhiem'),
  component: ReportsPage,
})

const noticesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notices',
  beforeLoad: requireAuth,
  component: NoticesPage,
})

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users',
  beforeLoad: requireAuth,
  onEnter: requireRole('admin'),
  component: UsersPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  dashboardRoute,
  studentsRoute,
  gradesRoute,
  attendanceRoute,
  reportsRoute,
  noticesRoute,
  usersRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
