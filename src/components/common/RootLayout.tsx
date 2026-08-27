import React, { Suspense } from 'react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { HeaderBar } from './HeaderBar'
import { DesktopSidebar, type DesktopTab } from '../desktop/DesktopSidebar'
import { MobileAppShell } from '../mobile/MobileAppShell'
import { StudentModal } from './StudentModal'
import { StudentReportModal } from './StudentReportModal'
import { InstallPrompt } from './InstallPrompt'
import { PhotoCard } from './PhotoCard'
import { Certificate } from './Certificate'
import { ForcePasswordChangeModal } from './ForcePasswordChangeModal'
import { useSundayReminder } from '../../hooks/useSundayReminder'
import { useUIStore } from '../../stores/uiStore'
import { useFilterStore } from '../../stores/filterStore'
import { useFilterSearchSync } from '../../stores/useFilterSearchSync'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { useEffectiveMode } from '../../hooks/useEffectiveMode'
import { useSyncEngine } from '../../hooks/useSyncEngine'
import { useStoreErrorWatcher } from '../../hooks/useStoreErrorWatcher'
import { useClassStore } from '../../stores/classStore'
import { useAuthStore } from '../../stores/authStore'
import { ErrorBoundary } from './ErrorBoundary'
import { PageTransition } from './PageTransition'
import { BRANCHES } from '../../constants/branches'
import type { MobileTab } from '../mobile/MobileBottomNav'

export const PageSuspense = ({ children }: { children: React.ReactNode }) => (
  <ErrorBoundary>
    <Suspense fallback={
      <div className="app-page-loader" role="status" aria-live="polite">
        <span className="app-page-loader__mark" aria-hidden="true" />
        <span>Đang chuẩn bị nội dung…</span>
      </div>
    }>
      {children}
    </Suspense>
  </ErrorBoundary>
)

// PHA 2 (audit A15): SSOT tab→path cho desktop — sidebar setActiveTab và
// routeToTab cùng dẫn xuất từ đây, không còn `as any` lệch route.
const DESKTOP_TAB_PATHS = {
  dashboard: '/dashboard',
  students: '/students',
  grades: '/grades',
  attendance: '/attendance',
  reports: '/reports',
  calendar: '/calendar',
  notices: '/notices',
  users: '/users',
  classes: '/classes',
  'academic-years': '/academic-years',
  catechists: '/catechists',
  'audit-logs': '/audit-logs',
  settings: '/settings',
  management: '/management',
  parent: '/parent',
  finances: '/finances',
} as const satisfies Record<DesktopTab, `/${string}`>

// PHA 2 (audit A12): /users, /classes, /academic-years là deep-link của các tab
// trong /management (không có item riêng trên sidebar) → highlight "Quản Lý Hệ Thống"
// thay vì không highlight gì.
const routeToTab: Record<string, DesktopTab> = {
  '/dashboard': 'dashboard',
  '/students': 'students',
  '/grades': 'grades',
  '/attendance': 'attendance',
  '/reports': 'reports',
  '/calendar': 'calendar',
  '/notices': 'notices',
  '/users': 'management',
  '/classes': 'management',
  '/audit-logs': 'audit-logs',
  '/academic-years': 'management',
  '/catechists': 'catechists',
  '/settings': 'settings',
  '/management': 'management',
  '/parent': 'parent',
  '/leave-requests': 'attendance',
  '/finances': 'finances',
}

const mobileRouteToTab = {
  '/dashboard': 'home',
  '/students': 'students',
  '/grades': 'grades',
  '/attendance': 'attendance',
  '/reports': 'reports',
  '/notices': 'notices',
  '/settings': 'settings',
  '/parent': 'parent',
} as const satisfies Record<string, string>

export function RootLayout() {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  useFilterSearchSync()
  useSyncEngine()
  useSundayReminder()
  useStoreErrorWatcher()

  const activeTab: DesktopTab = routeToTab[pathname] || 'dashboard'
  const activeMobileTab: MobileTab = ((mobileRouteToTab as Record<string, string>)[pathname] as MobileTab) || 'home'

  const selectedBranchId = useFilterStore(s => s.selectedBranchId)
  const setSelectedBranchId = useFilterStore(s => s.setSelectedBranchId)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)

  const selectedSemester = useFilterStore(s => s.selectedSemester)
  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester)
  const { restricted: semesterRestricted, openSemester, ready: semesterReady } = useSemesterAccess()

  React.useEffect(() => {
    if (semesterRestricted && semesterReady && selectedSemester !== openSemester) {
      setSelectedSemester(openSemester)
    }
  }, [semesterRestricted, semesterReady, openSemester, selectedSemester, setSelectedSemester])

  // Non-admin users (chunhiem/phuta/phuhuynh) are scoped to their assigned
  // classes server-side, so filters must stay at 'all' to avoid stale
  // persisted class/branch selections rendering empty lists.
  const currentUser = useAuthStore(s => s.user)
  const authReady = useAuthStore(s => s.authReady)
  React.useEffect(() => {
    if (currentUser && currentUser.role !== 'admin') {
      if (selectedClassId !== 'all') setSelectedClassId('all')
      if (selectedBranchId !== 'all') setSelectedBranchId('all')
    }
  }, [currentUser, selectedClassId, setSelectedClassId, selectedBranchId, setSelectedBranchId])

  const {
    isStudentModalOpen,
    studentToEdit,
    isReportModalOpen,
    studentForReport,
    reportPrintRequested,
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

  const mode = useEffectiveMode()
  const classList = useClassStore(s => s.getClassList)()

  if (!authReady) {
    return (
      <div className="min-h-screen bg-surface-app flex items-center justify-center text-text-muted text-sm">
        Đang xác thực phiên làm việc...
      </div>
    )
  }

  const isAuthRoute = pathname === '/login' || pathname.startsWith('/login/') || !currentUser

  if (isAuthRoute) {
    return (
      <div className="min-h-screen bg-surface-app font-sans">
        <PageTransition routeKey={pathname}>
          <PageSuspense>
            <Outlet />
          </PageSuspense>
        </PageTransition>
        <InstallPrompt />
      </div>
    )
  }

  if (mode === 'mobile') {
    return (
      <>
        <a href="#main-content" className="skip-link">Bỏ qua đến nội dung chính</a>
        <MobileAppShell
          activeTab={activeMobileTab}
          setActiveTab={(tab) => navigate({ to: tab === 'home' ? '/dashboard' : (`/${tab}` as any) })}
        >
          <HeaderBar />
          <PageTransition routeKey={pathname}>
            <PageSuspense>
              <Outlet />
            </PageSuspense>
          </PageTransition>
          <InstallPrompt />
          <ForcePasswordChangeModal />
        </MobileAppShell>
        {isStudentModalOpen && (
          <StudentModal
            isOpen={isStudentModalOpen}
            onClose={closeStudentModal}
            studentToEdit={studentToEdit}
          />
        )}
        {isReportModalOpen && studentForReport && (
          <StudentReportModal
            isOpen={isReportModalOpen}
            onClose={closeReport}
            student={studentForReport}
            autoPrint={reportPrintRequested}
          />
        )}
        {isPhotoCardOpen && photoCardStudent && (
          <PhotoCard
            isOpen={isPhotoCardOpen}
            onClose={closePhotoCard}
            student={photoCardStudent}
          />
        )}
        {isCertificateOpen && certificateStudent && (
          <Certificate
            isOpen={isCertificateOpen}
            onClose={closeCertificate}
            student={certificateStudent}
            type={certificateType}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-surface-app overflow-hidden font-sans">
      <a href="#main-content" className="skip-link">Bỏ qua đến nội dung chính</a>
      {/* UI-POLISH 2026-08-25: HeaderBar lên span full-width — trước đây header nằm
          trong cột phải (sau sidebar) nên góc trên-trái tạo khoảng trống sáng lệch
          với header tối, đồng thời sidebar sticky top lệch khỏi mép header do
          OfflineStatusBanner đẩy header xuống. Header full-width = sidebar + content
          start cùng một mép trên, header có thêm ~260px chống overflow (audit A7). */}
      <HeaderBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <DesktopSidebar
          activeTab={activeTab}
          setActiveTab={(tab) => navigate({ to: DESKTOP_TAB_PATHS[tab] })}
          selectedBranchId={selectedBranchId}
          setSelectedBranchId={setSelectedBranchId}
          selectedClassId={selectedClassId}
          setSelectedClassId={setSelectedClassId}
          classes={classList as any}
          branches={BRANCHES}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <main id="main-content" className="app-main-content">
            <PageTransition routeKey={pathname}>
              <PageSuspense>
                <Outlet />
              </PageSuspense>
            </PageTransition>
          </main>

          {isStudentModalOpen && (
            <StudentModal
              isOpen={isStudentModalOpen}
              onClose={closeStudentModal}
              studentToEdit={studentToEdit}
            />
          )}
          {isReportModalOpen && studentForReport && (
            <StudentReportModal
              isOpen={isReportModalOpen}
              onClose={closeReport}
              student={studentForReport}
              autoPrint={reportPrintRequested}
            />
          )}
          {isPhotoCardOpen && photoCardStudent && (
            <PhotoCard
              isOpen={isPhotoCardOpen}
              onClose={closePhotoCard}
              student={photoCardStudent}
            />
          )}
          {isCertificateOpen && certificateStudent && (
            <Certificate
              isOpen={isCertificateOpen}
              onClose={closeCertificate}
              student={certificateStudent}
              type={certificateType}
            />
          )}
          <InstallPrompt />
          <ForcePasswordChangeModal />
        </div>
      </div>
    </div>
  )
}
