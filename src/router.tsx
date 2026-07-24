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
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useSyncEngine } from './hooks/useSyncEngine'
import { useSyncStore } from './stores/syncStore'
import { MOCK_CLASSES, BRANCHES } from './data/mockParishData'
import type { DesktopTab } from './components/desktop/DesktopSidebar'
import type { MobileTab } from './components/mobile/MobileBottomNav'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const StudentsPage = lazy(() => import('./pages/StudentsPage'))
const GradesPage = lazy(() => import('./pages/GradesPage'))
const AttendancePage = lazy(() => import('./pages/AttendancePage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const NoticesPage = lazy(() => import('./pages/NoticesPage'))

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
}

function RootLayout() {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  useFilterSearchSync()
  useSyncEngine()
  useSundayReminder()
  const isOnline = useOnlineStatus()
  const syncStatus = useSyncStore(s => s.status)
  const syncPending = useSyncStore(s => s.pendingCount)

  const effectiveMode = useEffectiveMode()
  const selectedBranchId = useFilterStore(s => s.selectedBranchId)
  const setSelectedBranchId = useFilterStore(s => s.setSelectedBranchId)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)

  const {
    isStudentModalOpen, studentToEdit,
    isReportModalOpen, studentForReport,
    isPhotoCardOpen, photoCardStudent,
    isCertificateOpen, certificateStudent, certificateType,
    closeStudentModal, closeReport,
    closePhotoCard, closeCertificate,
  } = useUIStore()

  const activeTab = routeToTab[pathname] || 'dashboard'

  const handleTabChange = (tab: DesktopTab) => {
    const to = `/${tab}`
    navigate({ to, replace: true })
  }

  const handleMobileTabChange = (tab: MobileTab) => {
    const routeMap: Record<string, string> = {
      home: '/dashboard',
      attendance: '/attendance',
      grades: '/grades',
      students: '/students',
      stats: '/reports',
      notices: '/notices',
    }
    const to = routeMap[tab]
    if (to) navigate({ to, replace: true })
  }

  const mobileTab: MobileTab = (() => {
    const map: Record<string, MobileTab> = {
      '/dashboard': 'home',
      '/attendance': 'attendance',
      '/grades': 'grades',
      '/students': 'students',
      '/reports': 'stats',
      '/notices': 'stats',
    }
    return map[pathname] || 'home'
  })()

  return (
    <div className="bg-surface-app text-text-main min-h-screen flex flex-col">
      {syncStatus === 'offline' && (
        <div className="text-center text-xs font-semibold px-3 py-1.5 bg-parish-secondary-light text-[#92400E]">
          Bạn đang ngoại tuyến. Dữ liệu sẽ được đồng bộ khi có kết nối lại.
          {syncPending > 0 && ` (${syncPending} thao tác chờ đồng bộ)`}
        </div>
      )}
      {syncStatus === 'syncing' && (
        <div className="text-center text-xs font-semibold px-3 py-1.5 bg-blue-100 text-blue-800">
          Đang đồng bộ dữ liệu... {syncPending > 0 && `(${syncPending} thao tác)`}
        </div>
      )}
      {syncStatus === 'retrying' && (
        <div className="text-center text-xs font-semibold px-3 py-1.5 bg-orange-100 text-orange-800">
          Đang thử lại đồng bộ...
        </div>
      )}
      {syncStatus === 'error' && (
        <div className="text-center text-xs font-semibold px-3 py-1.5 bg-red-100 text-red-800">
          Lỗi đồng bộ. Một số dữ liệu chưa được gửi lên máy chủ.
        </div>
      )}
      <HeaderBar />

      {effectiveMode === 'desktop' ? (
        <div style={{ display: 'flex', flex: 1 }}>
          <DesktopSidebar
            activeTab={activeTab}
            setActiveTab={handleTabChange}
            selectedBranchId={selectedBranchId}
            setSelectedBranchId={setSelectedBranchId}
            selectedClassId={selectedClassId}
            setSelectedClassId={setSelectedClassId}
            classes={MOCK_CLASSES}
            branches={BRANCHES}
          />
          <main style={{ flex: 1, padding: '24px', overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
            <PageSuspense><Outlet /></PageSuspense>
          </main>
        </div>
      ) : (
        <main style={{ flex: 1, paddingBottom: '72px' }}>
          <PageSuspense><Outlet /></PageSuspense>
          <MobileBottomNav
            activeTab={mobileTab}
            setActiveTab={handleMobileTabChange}
          />
        </main>
      )}

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

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardPage,
})

const studentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/students',
  component: StudentsPage,
})

const gradesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/grades',
  component: GradesPage,
})

const attendanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/attendance',
  component: AttendancePage,
})

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports',
  component: ReportsPage,
})

const noticesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notices',
  component: NoticesPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  studentsRoute,
  gradesRoute,
  attendanceRoute,
  reportsRoute,
  noticesRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
