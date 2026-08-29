import React, { Suspense } from 'react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { HeaderBar } from './HeaderBar'
import { DesktopSidebar, type DesktopTab } from '../desktop/DesktopSidebar'
import { MobileAppShell } from '../mobile/MobileAppShell'
import { InstallPrompt } from './InstallPrompt'
import { lazyWithRetry } from '../../utils/lazyWithRetry'

const StudentModal = lazyWithRetry(() => import('./StudentModal'), 'StudentModal')
const StudentReportModal = lazyWithRetry(() => import('./StudentReportModal'), 'StudentReportModal')
const PhotoCard = lazyWithRetry(() => import('./PhotoCard'), 'PhotoCard')
const Certificate = lazyWithRetry(() => import('./Certificate'), 'Certificate')
const ForcePasswordChangeModal = lazyWithRetry(() => import('./ForcePasswordChangeModal'), 'ForcePasswordChangeModal')

import { useSundayReminder } from '../../hooks/useSundayReminder'
import { useUIStore } from '../../stores/uiStore'
import { useFilterStore } from '../../stores/filterStore'
import { useFilterSearchSync } from '../../stores/useFilterSearchSync'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { useEffectiveMode } from '../../hooks/useEffectiveMode'
import { useSyncEngine } from '../../hooks/useSyncEngine'
import { useStoreErrorWatcher } from '../../hooks/useStoreErrorWatcher'
import { useScrollRestoration } from '../../hooks/useScrollRestoration'
import { useClassStore } from '../../stores/classStore'
import { useAuthStore } from '../../stores/authStore'
import { ErrorBoundary } from './ErrorBoundary'
import { PageTransition } from './PageTransition'
import { BRANCHES } from '../../constants/branches'
import type { MobileTab } from '../mobile/MobileBottomNav'
import { DESKTOP_TAB_PATHS, MOBILE_TAB_PATHS, getRoutePolicy } from '../../constants/routePolicy'

const PageSkeleton = () => (
  <div className="animate-pulse space-y-4 p-1" aria-hidden="true">
    <div className="h-6 w-48 rounded-lg bg-surface-hover" />
    <div className="h-4 w-72 rounded bg-surface-hover" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
      <div className="h-24 rounded-xl bg-surface-hover" />
      <div className="h-24 rounded-xl bg-surface-hover" />
      <div className="h-24 rounded-xl bg-surface-hover hidden sm:block" />
    </div>
    <div className="h-64 rounded-xl bg-surface-hover" />
  </div>
)

export const PageSuspense = ({ children }: { children: React.ReactNode }) => (
  <ErrorBoundary>
    <Suspense fallback={
      <div className="min-h-[50vh] flex flex-col gap-4 p-2" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Đang chuẩn bị nội dung…</span>
        <PageSkeleton />
      </div>
    }>
      {children}
    </Suspense>
  </ErrorBoundary>
)

export function RootLayout() {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  useFilterSearchSync()
  useSyncEngine()
  useSundayReminder()
  useStoreErrorWatcher()

  const routePolicy = getRoutePolicy(pathname)
  const activeTab: DesktopTab = routePolicy?.desktopTab || 'dashboard'
  const activeMobileTab: MobileTab | null = routePolicy?.mobileTab || null

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
  useScrollRestoration(pathname, mode)
  const classList = useClassStore(s => s.getClassList)()

  if (!authReady) {
    return (
      <div className="min-h-screen bg-surface-app flex items-center justify-center text-text-muted text-sm">
        Đang xác thực phiên làm việc...
      </div>
    )
  }

  const isAuthRoute = pathname === '/login' || pathname.startsWith('/login/') || pathname === '/verify' || !currentUser

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
          setActiveTab={(tab) => navigate({ to: MOBILE_TAB_PATHS[tab] })}
        >
          <HeaderBar />
          <PageTransition routeKey={pathname}>
            <PageSuspense>
              <Outlet />
            </PageSuspense>
          </PageTransition>
          <InstallPrompt />
          <Suspense fallback={null}><ForcePasswordChangeModal /></Suspense>
        </MobileAppShell>
        {isStudentModalOpen && (
          <Suspense fallback={null}>
            <StudentModal
              isOpen={isStudentModalOpen}
              onClose={closeStudentModal}
              studentToEdit={studentToEdit}
            />
          </Suspense>
        )}
        {isReportModalOpen && studentForReport && (
          <Suspense fallback={null}>
            <StudentReportModal
              isOpen={isReportModalOpen}
              onClose={closeReport}
              student={studentForReport}
              autoPrint={reportPrintRequested}
            />
          </Suspense>
        )}
        {isPhotoCardOpen && photoCardStudent && (
          <Suspense fallback={null}>
            <PhotoCard
              isOpen={isPhotoCardOpen}
              onClose={closePhotoCard}
              student={photoCardStudent}
            />
          </Suspense>
        )}
        {isCertificateOpen && certificateStudent && (
          <Suspense fallback={null}>
            <Certificate
              isOpen={isCertificateOpen}
              onClose={closeCertificate}
              student={certificateStudent}
              type={certificateType}
            />
          </Suspense>
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
            <Suspense fallback={null}>
              <StudentModal
                isOpen={isStudentModalOpen}
                onClose={closeStudentModal}
                studentToEdit={studentToEdit}
              />
            </Suspense>
          )}
          {isReportModalOpen && studentForReport && (
            <Suspense fallback={null}>
              <StudentReportModal
                isOpen={isReportModalOpen}
                onClose={closeReport}
                student={studentForReport}
                autoPrint={reportPrintRequested}
              />
            </Suspense>
          )}
          {isPhotoCardOpen && photoCardStudent && (
            <Suspense fallback={null}>
              <PhotoCard
                isOpen={isPhotoCardOpen}
                onClose={closePhotoCard}
                student={photoCardStudent}
              />
            </Suspense>
          )}
          {isCertificateOpen && certificateStudent && (
            <Suspense fallback={null}>
              <Certificate
                isOpen={isCertificateOpen}
                onClose={closeCertificate}
                student={certificateStudent}
                type={certificateType}
              />
            </Suspense>
          )}
          <InstallPrompt />
          <Suspense fallback={null}><ForcePasswordChangeModal /></Suspense>
        </div>
      </div>
    </div>
  )
}
