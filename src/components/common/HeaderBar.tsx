import { useState } from 'react'
import { useStudentStore } from '../../stores/studentStore'
import { useFilterStore } from '../../stores/filterStore'
import { useEffectiveMode } from '../../hooks/useEffectiveMode'
import { resetAllStoresToDefault } from '../../stores/resetStores'
import { useTheme } from '../../hooks/useTheme'
import { ConfirmDialog } from './ConfirmDialog'
import { SystemDiagnosticsModal } from '../desktop/SystemDiagnosticsModal'
import { OfflineStatusBanner } from './OfflineStatusBanner'
import logo from '../../assets/logo-gia-ton.png'
import { Monitor, Smartphone, Moon, Sun, RefreshCw, Search, LogOut, UserCheck, Activity } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useNavigate } from '@tanstack/react-router'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { MobileTopBar } from '../mobile/MobileTopBar'
import { useMediaQuery } from '../../hooks/useMediaQuery'

export const HeaderBar: React.FC = () => {
  const students = useStudentStore((s) => s.students)
  const viewMode = useFilterStore((s) => s.viewMode)
  const setViewMode = useFilterStore((s) => s.setViewMode)
  const selectedSemester = useFilterStore((s) => s.selectedSemester)
  const setSelectedSemester = useFilterStore((s) => s.setSelectedSemester)
  const { restricted: semesterRestricted, openSemester } = useSemesterAccess()
  const selectedClassId = useFilterStore((s) => s.selectedClassId)
  const setSelectedClassId = useFilterStore((s) => s.setSelectedClassId)
  const searchQuery = useFilterStore((s) => s.searchQuery)
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery)
  const effectiveMode = useEffectiveMode()
  // Tablet dùng mobile shell; desktop sidebar chỉ bật từ 1024px để giữ vùng
  // chạm và bề rộng nội dung đủ dùng.
  const isNarrowViewport = useMediaQuery('(max-width: 1023.9px)')
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const academicYearDisplay = useAcademicYearStore((s) => s.currentYear)
  // REACT-185 (2026-08-14): KHÔNG gọi getClassList() bên trong selector — trả mảng mới
  // mỗi lần getSnapshot → vòng lặp re-render vô hạn (zustand v5 so Object.is). Pattern
  // chuẩn: selector trả về hàm (ổn định), gọi () bên ngoài (xem RootLayout.tsx:119).
  const classList = useClassStore((s) => s.getClassList)()

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
        <MobileTopBar />
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
                  <h1 className="app-header__title">
                    Xứ Đoàn Đức Mẹ Fatima
                  </h1>
                  <span className="app-header__parish-badge">
                    Giáo Xứ Gia Tôn
                  </span>
                </div>
                <div className="app-header__meta">
                  <span className="flex items-center gap-1.5">
                    <span className="app-header__status-dot"></span>
                    Niên Học {academicYearDisplay}
                  </span>
                  <span aria-hidden="true">•</span>
                  <span>{students.length} Thiếu Nhi</span>
                </div>
              </div>
            </div>

            {/* Controls Section */}
            <div className="app-header__controls">
              {/* Class & Search Group */}
              <div className="app-header__control-group app-header__search-group">
                {/* Class Switcher (admin only — GLV only sees their assigned classes) */}
                {currentUser?.role === 'admin' && (
                  <div className="flex items-center gap-1.5 text-white">
                    <span className="text-white/65 font-medium hidden sm:inline text-xs">Lớp:</span>
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="app-header__select cursor-pointer pr-1"
                      aria-label="Lớp đang xem"
                    >
                      <option value="all">
                        Tất cả lớp học
                      </option>
                      {classList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Search Input */}
                <div className="flex items-center gap-1.5 text-white">
                  <Search size={14} className="text-white/60 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên, mã..."
                    className="app-header__search"
                    aria-label="Tìm thiếu nhi theo tên hoặc mã"
                  />
                </div>
              </div>

              {/* Semester Selector */}
              <div className="app-header__control-group">
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
              </div>

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
                    <div className="text-[10px] text-amber-200/90 uppercase font-mono tracking-wider">{currentUser.role}</div>
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

      <SystemDiagnosticsModal isOpen={showDiagnostics} onClose={() => setShowDiagnostics(false)} />

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
