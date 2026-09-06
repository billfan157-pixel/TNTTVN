import { Suspense, useState } from 'react'
import { useStudentStore } from '../../stores/studentStore'
import { useFilterStore } from '../../stores/filterStore'
import { useEffectiveMode } from '../../hooks/useEffectiveMode'
import { resetAllStoresToDefault } from '../../stores/resetStores'
import { useTheme } from '../../hooks/useTheme'
import { ConfirmDialog } from './ConfirmDialog'
import { lazyWithRetry } from '../../utils/lazyWithRetry'
import { OfflineStatusBanner } from './OfflineStatusBanner'
import logo from '../../assets/logo-gia-ton.png'
import { Monitor, Smartphone, Moon, Sun, RefreshCw, LogOut, UserCheck, Activity } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useNavigate } from '@tanstack/react-router'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { MobileTopBar } from '../mobile/MobileTopBar'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import type { WorkspaceId } from '../../constants/routePolicy'

interface HeaderBarProps {
  activeWorkspace?: WorkspaceId
  onWorkspaceChange?: (workspace: WorkspaceId) => void
}

const SystemDiagnosticsModal = lazyWithRetry(
  () => import('../desktop/SystemDiagnosticsModal'),
  'SystemDiagnosticsModal',
)

export const HeaderBar: React.FC<HeaderBarProps> = ({ activeWorkspace = 'academic', onWorkspaceChange }) => {
  const students = useStudentStore((s) => s.students)
  const viewMode = useFilterStore((s) => s.viewMode)
  const setViewMode = useFilterStore((s) => s.setViewMode)
  const selectedSemester = useFilterStore((s) => s.selectedSemester)
  const setSelectedSemester = useFilterStore((s) => s.setSelectedSemester)
  const { restricted: semesterRestricted, openSemester } = useSemesterAccess()
  const effectiveMode = useEffectiveMode()
  // Tablet dùng mobile shell; desktop sidebar chỉ bật từ 1024px để giữ vùng
  // chạm và bề rộng nội dung đủ dùng.
  const isNarrowViewport = useMediaQuery('(max-width: 1023.9px)')
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const academicYearDisplay = useAcademicYearStore((s) => s.currentYear)

  const currentUser = useAuthStore((s) => s.user)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const handleReset = () => {
    setShowResetConfirm(true)
  }

  const handleLogout = () => {
    useAuthStore.getState().logout()
    navigate({ to: '/login' })
  }

  return (
    <>
      <OfflineStatusBanner />
      {effectiveMode === 'mobile' ? (
        <MobileTopBar activeWorkspace={activeWorkspace} onWorkspaceChange={onWorkspaceChange} />
      ) : (
        <header className="app-header">
          <div className="app-header__inner">
            {/* Logo & Title Section */}
            <div className="app-header__brand">
              <div className="app-header__mark">
                <img src={logo} alt="Logo Xứ Đoàn Đức Mẹ Fatima" className="app-header__logo" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="app-header__title">Catevia</h1>
                  <span className="app-header__parish-badge">
                    {activeWorkspace === 'organization' ? 'Xứ đoàn & Giáo xứ' : activeWorkspace === 'parent' ? 'Phụ huynh' : 'Thiếu nhi & Học vụ'}
                  </span>
                </div>
                <div className="app-header__meta">
                  <span className="flex items-center gap-1.5">
                    <span className="app-header__status-dot"></span>
                    {activeWorkspace === 'academic' ? `Niên Học ${academicYearDisplay}` : 'Xứ Đoàn Đức Mẹ Fatima'}
                  </span>
                  {activeWorkspace === 'academic' && <><span aria-hidden="true">•</span><span>{students.length} Thiếu Nhi</span></>}
                </div>
              </div>
            </div>

            {/* Controls Section */}
            <div className="app-header__controls">
              {/* Semester Selector */}
              {activeWorkspace === 'academic' && <div className="app-header__control-group">
                {semesterRestricted ? (
                  <span className="app-header__segment text-white">
                    Học Kỳ {openSemester === 2 ? 'II' : 'I'}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedSemester(1)}
                      className={`app-header__segment ${selectedSemester === 1 ? 'is-active' : ''}`}
                      aria-pressed={selectedSemester === 1}
                    >
                      HK I
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSemester(2)}
                      className={`app-header__segment ${selectedSemester === 2 ? 'is-active' : ''}`}
                      aria-pressed={selectedSemester === 2}
                    >
                      HK II
                    </button>
                  </>
                )}
              </div>}

              {/* ── Zone 2: App utilities (PHA 2 — tách khỏi data filters) ── */}
              <div className="flex items-center gap-1.5">
                {/* View Mode Switcher */}
                <div className="app-header__control-group">
                  <button
                    type="button"
                    onClick={() => setViewMode('desktop')}
                    disabled={isNarrowViewport}
                    title={isNarrowViewport ? 'Màn hình quá nhỏ — chế độ Desktop cần tối thiểu 1024px' : 'Chuyển sang Giao diện Desktop'}
                    aria-label="Chuyển sang Giao diện Desktop"
                    aria-pressed={viewMode === 'desktop' || (viewMode === 'auto' && effectiveMode === 'desktop')}
                    className={`app-header__segment px-0 ${viewMode === 'desktop' || (viewMode === 'auto' && effectiveMode === 'desktop') ? 'is-accent' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Monitor size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('mobile')}
                    title="Chuyển sang Giao diện Mobile"
                    aria-label="Chuyển sang Giao diện Mobile"
                    aria-pressed={viewMode === 'mobile'}
                    className={`app-header__segment px-0 ${viewMode === 'mobile' ? 'is-accent' : ''}`}
                  >
                    <Smartphone size={14} />
                  </button>
                </div>

                {/* Theme Toggle */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  title="Đổi giao diện sáng/tối"
                  aria-label="Đổi giao diện sáng/tối"
                  aria-pressed={theme === 'dark'}
                  className="app-header__icon-button"
                >
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>

                {/* System Diagnostics */}
                <button
                  type="button"
                  onClick={() => setShowDiagnostics(true)}
                  onPointerEnter={() => void SystemDiagnosticsModal.preload()}
                  onFocus={() => void SystemDiagnosticsModal.preload()}
                  title="Bảng Chẩn Đoán System Telemetry"
                  aria-label="Bảng Chẩn Đoán Hệ Thống"
                  className="app-header__icon-button text-amber-200"
                >
                  <Activity size={16} />
                </button>

                {/* Reset client cache — admin-only technical recovery action */}
                {currentUser?.role === 'admin' && <button
                  type="button"
                  onClick={handleReset}
                  title="Làm mới dữ liệu trên thiết bị"
                  aria-label="Làm mới dữ liệu trên thiết bị"
                  className="app-header__icon-button hover:text-rose-300"
                >
                  <RefreshCw size={15} />
                </button>}
              </div>

              {/* ── Zone 3: User identity (cùng phải) ── */}
              {currentUser ? (
                <div className="app-header__profile text-xs">
                  <div className="w-8 h-8 rounded-[10px] bg-amber-300/15 border border-amber-200/30 flex items-center justify-center text-amber-200 font-bold shrink-0">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div className="hidden lg:block text-left">
                    <div className="font-bold leading-tight text-white">{currentUser.fullName}</div>
                    <div className="text-xs text-amber-200/90 uppercase font-mono tracking-wider">{currentUser.role}</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Đăng xuất"
                    aria-label="Đăng xuất"
                    className="p-1.5 text-white/70 hover:text-white hover:bg-white/12 rounded-lg transition-colors ml-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate({ to: '/login' })}
                  className="px-3.5 py-1.5 bg-amber-300 hover:bg-amber-400 text-slate-900 font-bold text-xs rounded-xl transition-colors shadow-md shrink-0"
                >
                  Đăng Nhập
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      {showDiagnostics && (
        <Suspense fallback={<span role="status" className="sr-only">Đang tải chẩn đoán hệ thống</span>}>
          <SystemDiagnosticsModal isOpen onClose={() => setShowDiagnostics(false)} />
        </Suspense>
      )}

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Làm mới dữ liệu trên thiết bị"
        message="Xóa dữ liệu đệm trên thiết bị này rồi tải lại từ máy chủ. Dữ liệu đã đồng bộ trên máy chủ không bị xóa; thao tác đang chờ đồng bộ vẫn được giữ."
        confirmText="Xóa bộ nhớ đệm & tải lại"
        variant="warning"
        onConfirm={() => {
          setShowResetConfirm(false)
          resetAllStoresToDefault().then(() => {
            window.location.reload()
          })
        }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </>
  )
}
