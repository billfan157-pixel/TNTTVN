import React, { useCallback, useEffect, useState, useId } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Activity,
  ChevronDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Sun,
  UserCheck,
  X,
  Bell,
  WifiOff,
  Download
} from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../hooks/useTheme'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { resetAllStoresToDefault } from '../../stores/resetStores'
import { useSyncStore } from '../../stores/syncStore'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ModalPortal } from '../common/ModalPortal'
import { SystemDiagnosticsModal } from '../desktop/SystemDiagnosticsModal'
import logo from '../../assets/logo-gia-ton.png'
import { getRoutePolicy } from '../../constants/routePolicy'

export const MobileTopBar: React.FC = () => {
  const navigate = useNavigate()
  const { location } = useRouterState()
  const students = useStudentStore(s => s.students)
  const currentUser = useAuthStore(s => s.user)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)
  const searchQuery = useFilterStore(s => s.searchQuery)
  const setSearchQuery = useFilterStore(s => s.setSearchQuery)
  const selectedSemester = useFilterStore(s => s.selectedSemester)
  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester)
  const academicYearDisplay = useAcademicYearStore(s => s.currentYear)
  const classList = useClassStore(s => s.getClassList)()
  const { restricted: semesterRestricted, openSemester } = useSemesterAccess()
  const { theme, toggleTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const { canInstall, install } = useInstallPrompt()

  // E1-E3: sync/online hooks must be unconditional (Rules of Hooks). Previously inside IIFE in JSX.
  const isOnline = useOnlineStatus()
  const syncStatus = useSyncStore(s => s.status)
  const pendingCount = useSyncStore(s => s.pendingCount)
  const isSyncing = syncStatus === 'syncing'
  const sheetId = useId()
  const closeMenu = useCallback(() => setIsOpen(false), [])
  const { dialogRef: sheetDialogRef } = useAccessibleDialog(isOpen, closeMenu)

  const title = getRoutePolicy(location.pathname)?.mobileTitle || 'Trang không xác định'
  const isParent = currentUser?.role === 'phuhuynh'
  const eyebrow = isParent ? 'CỔNG PHỤ HUYNH' : 'XỨ ĐOÀN ĐỨC MẸ FATIMA'
  const summary = isParent ? 'Theo dõi việc học của gia đình' : `Niên học ${academicYearDisplay} · ${students.length} thiếu nhi`

  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  const handleLogout = () => {
    useAuthStore.getState().logout()
    navigate({ to: '/login' })
  }

  return (
    <>
      <header className="mobile-top-bar">
        <div className="mobile-top-bar__content">
          <div className="mobile-top-bar__identity">
            <div className="mobile-top-bar__brand-mark">
              <img src={logo} alt="Logo Xứ Đoàn Đức Mẹ Fatima" className="mobile-top-bar__logo" />
            </div>
            <div className="mobile-top-bar__copy">
              <div className="mobile-top-bar__eyebrow">{eyebrow}</div>
              <h1>{title}</h1>
              <p>{summary}</p>
            </div>
          </div>

          <div className="mobile-top-bar__actions flex items-center gap-1.5">
            {/* Mini Sync/Offline Badge — hooks lifted to component top */}
            {!isOnline ? (
              <div role="status" className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-400" title="Đang offline" aria-label="Đang offline">
                <WifiOff aria-hidden="true" size={16} />
              </div>
            ) : isSyncing ? (
              <div role="status" className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/20 text-sky-400" title="Đang đồng bộ..." aria-label="Đang đồng bộ">
                <RefreshCw aria-hidden="true" size={16} className="animate-spin" />
              </div>
            ) : pendingCount > 0 ? (
              <div role="status" className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 relative" title={`${pendingCount} thay đổi chưa đồng bộ`} aria-label={`${pendingCount} thay đổi chưa đồng bộ`}>
                <WifiOff aria-hidden="true" size={16} />
                <span aria-hidden="true" className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 text-slate-950 rounded-full text-[9px] font-bold flex items-center justify-center">
                  {pendingCount}
                </span>
              </div>
            ) : null}

            {/* Notices Bell (Chunhiem/Admin/Phuta) */}
            {currentUser?.role !== 'phuhuynh' && (
              <button
                type="button"
                className="w-11 h-11 flex items-center justify-center text-white/80 hover:text-white"
                onClick={() => navigate({ to: '/notices' })}
                aria-label="Thông báo"
              >
                <Bell size={21} />
              </button>
            )}

            <button
              type="button"
              className="mobile-sheet-trigger w-11 h-11 flex items-center justify-center shrink-0"
              onClick={() => setIsOpen(value => !value)}
              aria-expanded={isOpen}
              aria-controls={sheetId}
              aria-label={isOpen ? 'Đóng bảng điều khiển' : 'Mở bảng điều khiển'}
            >
              {isOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>

      </header>

      {isOpen && (
        <ModalPortal>
          <div className="app-modal-layer mobile-control-sheet-layer">
            <button
              type="button"
              className="mobile-control-sheet__scrim"
              onClick={closeMenu}
              aria-label="Đóng bảng điều khiển"
              tabIndex={-1}
            />
            <div id={sheetId} ref={sheetDialogRef} role="dialog" aria-modal="true" aria-label="Bảng điều khiển" className="mobile-control-sheet">
              <div className="sheet-grabber" aria-hidden="true" />
              <div className="mobile-control-sheet__profile">
                <span className="mobile-control-sheet__avatar"><UserCheck size={17} /></span>
                <div className="min-w-0">
                  <div className="truncate font-bold">{currentUser?.fullName || 'Người dùng'}</div>
                  <div className="text-[10px] uppercase tracking-wide text-text-muted">{currentUser?.role || 'guest'}</div>
                </div>
                <button type="button" className="mobile-control-sheet__close" onClick={closeMenu} aria-label="Đóng bảng điều khiển">
                  <ChevronDown size={18} />
                </button>
              </div>

              <div className="mobile-control-sheet__grid">
                {/* Class filter: admin only — GLV only sees their assigned classes */}
                {currentUser?.role === 'admin' && (
                <label className="mobile-control-field mobile-control-field--wide">
                  <span>Lớp đang xem</span>
                  <select value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)}>
                    <option value="all">Tất cả lớp học</option>
                    {classList.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                )}

                <label className="mobile-control-field mobile-control-field--wide">
                  <span>Tìm nhanh</span>
                  <span className="mobile-control-search min-h-[44px]">
                    <Search size={15} aria-hidden="true" />
                    <input
                      type="search"
                      inputMode="search"
                      value={searchQuery}
                      onChange={event => setSearchQuery(event.target.value)}
                      placeholder="Tên hoặc mã thiếu nhi"
                      aria-label="Tìm tên hoặc mã thiếu nhi"
                    />
                  </span>
                </label>
              </div>

            <div className="mobile-control-sheet__row">
              <div className="mobile-semester-control" aria-label="Chọn học kỳ">
                {semesterRestricted ? (
                  <span>Học kỳ {openSemester === 2 ? 'II' : 'I'}</span>
                ) : (
                  [1, 2].map(semester => (
                    <button
                      key={semester}
                      type="button"
                      className={selectedSemester === semester ? 'is-active' : ''}
                      onClick={() => setSelectedSemester(semester as 1 | 2)}
                    >
                      HK {semester === 1 ? 'I' : 'II'}
                    </button>
                  ))
                )}
              </div>

              <button type="button" className="mobile-control-icon" onClick={toggleTheme} aria-label="Đổi giao diện sáng tối">
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button type="button" className="mobile-control-icon" onClick={() => { closeMenu(); setShowDiagnostics(true) }} aria-label="Mở chẩn đoán hệ thống">
                <Activity size={17} />
              </button>
              {currentUser?.role === 'admin' && <button type="button" className="mobile-control-icon" onClick={() => { closeMenu(); setShowResetConfirm(true) }} aria-label="Làm mới dữ liệu trên thiết bị">
                <RefreshCw size={17} />
              </button>}
            </div>

            <div className="mobile-control-sheet__actions">
              {canInstall && (
                <button type="button" className="btn btn-primary mobile-control-action" onClick={() => { install(); closeMenu() }}>
                  <Download size={16} /> Cài đặt ứng dụng (PWA)
                </button>
              )}
              <button type="button" className="btn btn-secondary mobile-control-action" onClick={() => { navigate({ to: '/settings' }); closeMenu() }}>
                <Settings size={16} /> Cài đặt
              </button>
              <button type="button" className="btn btn-secondary mobile-control-action" onClick={() => { useFilterStore.getState().setViewMode('desktop'); closeMenu() }}>
                <Monitor size={16} /> Giao diện desktop
              </button>
              <button type="button" className="btn btn-ghost mobile-control-action mobile-control-action--danger" onClick={handleLogout}>
                <LogOut size={16} /> Đăng xuất
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Làm mới dữ liệu trên thiết bị"
        message="Xóa dữ liệu đệm trên thiết bị này rồi tải lại từ máy chủ. Dữ liệu đã đồng bộ trên máy chủ không bị xóa; thao tác đang chờ đồng bộ vẫn được giữ."
        confirmText="Xóa bộ nhớ đệm & tải lại"
        cancelText="Hủy"
        variant="warning"
        onConfirm={async () => {
          await resetAllStoresToDefault()
          setShowResetConfirm(false)
          closeMenu()
          window.location.reload()
        }}
        onCancel={() => setShowResetConfirm(false)}
      />

      <SystemDiagnosticsModal isOpen={showDiagnostics} onClose={() => setShowDiagnostics(false)} />
    </>
  )
}

