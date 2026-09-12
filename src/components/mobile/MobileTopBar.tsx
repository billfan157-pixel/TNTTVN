import React, { Suspense, useCallback, useEffect, useState, useId } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Activity,
  ChevronDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  UserCheck,
  X,
  Bell,
  WifiOff,
  Download,
  Landmark,
  MessageSquareText,
  Users,
  Wallet,
} from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../hooks/useTheme'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { resetAllStoresToDefault } from '../../stores/resetStores'
import { useSyncStore } from '../../stores/syncStore'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ModalPortal } from '../common/ModalPortal'
import { lazyWithRetry } from '../../utils/lazyWithRetry'
import logo from '../../assets/logo-gia-ton.png'
import { WORKSPACE_DEFINITIONS, getAccessibleWorkspaces, getRoutePolicy, canRoleAccessRoute, type WorkspaceId } from '../../constants/routePolicy'

interface MobileTopBarProps {
  activeWorkspace?: WorkspaceId
  onWorkspaceChange?: (workspace: WorkspaceId) => void
}

const SystemDiagnosticsModal = lazyWithRetry(
  () => import('../desktop/SystemDiagnosticsModal'),
  'SystemDiagnosticsModal',
)

export const MobileTopBar: React.FC<MobileTopBarProps> = ({ activeWorkspace = 'academic', onWorkspaceChange }) => {
  const navigate = useNavigate()
  const { location } = useRouterState()
  const students = useStudentStore(s => s.students)
  const currentUser = useAuthStore(s => s.user)
  const academicYearDisplay = useAcademicYearStore(s => s.currentYear)
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
  const eyebrow = isParent ? 'CỔNG PHỤ HUYNH' : activeWorkspace === 'organization' ? 'XỨ ĐOÀN & GIÁO XỨ' : 'THIẾU NHI & HỌC VỤ'
  const summary = isParent ? 'Theo dõi việc học của gia đình' : activeWorkspace === 'organization' ? 'Xứ Đoàn Đức Mẹ Fatima' : `Niên học ${academicYearDisplay} · ${students.length} thiếu nhi`
  const accessibleWorkspaces = getAccessibleWorkspaces(currentUser?.role)

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
                <span aria-hidden="true" className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 rounded-full text-[10px] font-bold flex items-center justify-center">
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

              {/* Profile & Identity Header */}
              <div className="mobile-control-sheet__profile">
                <span className="mobile-control-sheet__avatar">
                  <UserCheck size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold text-base text-white">{currentUser?.fullName || 'Người dùng'}</div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-extrabold uppercase tracking-wide bg-white/15 text-amber-200">
                      {currentUser?.role === 'admin' ? 'Admin Xứ Đoàn' : currentUser?.role === 'chunhiem' ? 'GLV Chủ Nhiệm' : currentUser?.role === 'phuta' ? 'GLV Phụ Tá' : currentUser?.role === 'phuhuynh' ? 'Phụ Huynh' : (currentUser?.role || 'Khách')}
                    </span>
                    <span className="text-xs text-white/60 truncate">Xứ Đoàn Đức Mẹ Fatima</span>
                  </div>
                </div>
                <button type="button" className="mobile-control-sheet__close" onClick={closeMenu} aria-label="Đóng bảng điều khiển">
                  <ChevronDown size={20} />
                </button>
              </div>

              {/* Workspace Switcher (if multi-workspace accessible) */}
              {accessibleWorkspaces.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/60 px-1">Không gian làm việc</span>
                  <div className="mobile-workspace-switcher" role="tablist" aria-label="Chọn không gian làm việc">
                    {accessibleWorkspaces.map(workspace => (
                      <button
                        key={workspace}
                        type="button"
                        className={`mobile-workspace-item ${activeWorkspace === workspace ? 'is-active' : ''}`}
                        aria-selected={activeWorkspace === workspace}
                        role="tab"
                        onClick={() => { onWorkspaceChange?.(workspace); closeMenu() }}
                      >
                        {workspace === 'organization' ? <Landmark size={15} /> : <Monitor size={15} />}
                        <span>{WORKSPACE_DEFINITIONS[workspace].label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Utility Tiles Grid */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-white/60 px-1">Công cụ & Tiện ích</span>
                <div className="mobile-control-tiles">
                  {/* Wave 0/1: Công Việc is org bottom-nav primary; overflow holds demoted org surfaces + utilities */}
                  {canRoleAccessRoute('/catechists', currentUser?.role) && (
                    <button
                      type="button"
                      className="mobile-control-tile"
                      onClick={() => { navigate({ to: '/catechists' }); closeMenu() }}
                      aria-label="Mở trang Huynh Trưởng"
                    >
                      <span className="mobile-control-tile__icon">
                        <Users size={17} className="text-sky-300" />
                      </span>
                      <span className="mobile-control-tile__content">
                        <strong className="mobile-control-tile__title">Huynh Trưởng</strong>
                        <span className="mobile-control-tile__desc">Giáo lý viên & phân công</span>
                      </span>
                    </button>
                  )}

                  {canRoleAccessRoute('/finances', currentUser?.role) && (
                    <button
                      type="button"
                      className="mobile-control-tile"
                      onClick={() => { navigate({ to: '/finances' }); closeMenu() }}
                      aria-label="Mở trang Sổ Quỹ"
                    >
                      <span className="mobile-control-tile__icon">
                        <Wallet size={17} className="text-emerald-300" />
                      </span>
                      <span className="mobile-control-tile__content">
                        <strong className="mobile-control-tile__title">Sổ Quỹ</strong>
                        <span className="mobile-control-tile__desc">Quỹ & thu chi</span>
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="mobile-control-tile"
                    onClick={() => { navigate({ to: '/feedback' }); closeMenu() }}
                    aria-label="Mở hộp thư góp ý"
                  >
                    <span className="mobile-control-tile__icon">
                      <MessageSquareText size={17} className="text-amber-300" />
                    </span>
                    <span className="mobile-control-tile__content">
                      <strong className="mobile-control-tile__title">Thư Góp Ý</strong>
                      <span className="mobile-control-tile__desc">Gửi hoặc xem thư</span>
                    </span>
                  </button>

                  {/* Theme Toggle Tile */}
                  <button
                    type="button"
                    className="mobile-control-tile"
                    onClick={toggleTheme}
                    aria-label={`Đổi sang chế độ ${theme === 'dark' ? 'Sáng' : 'Tối'}`}
                  >
                    <span className="mobile-control-tile__icon">
                      {theme === 'dark' ? <Sun size={17} className="text-amber-300" /> : <Moon size={17} className="text-sky-300" />}
                    </span>
                    <span className="mobile-control-tile__content">
                      <strong className="mobile-control-tile__title">Giao Diện</strong>
                      <span className="mobile-control-tile__desc">{theme === 'dark' ? 'Chế độ Tối' : 'Chế độ Sáng'}</span>
                    </span>
                  </button>

                  {/* System Diagnostics Tile */}
                  <button
                    type="button"
                    className="mobile-control-tile"
                    onClick={() => { closeMenu(); setShowDiagnostics(true) }}
                    onPointerEnter={() => void SystemDiagnosticsModal.preload()}
                    onFocus={() => void SystemDiagnosticsModal.preload()}
                    aria-label="Mở chẩn đoán hệ thống"
                  >
                    <span className="mobile-control-tile__icon">
                      <Activity size={17} className="text-emerald-300" />
                    </span>
                    <span className="mobile-control-tile__content">
                      <strong className="mobile-control-tile__title">Chẩn Đoán</strong>
                      <span className="mobile-control-tile__desc">Hệ thống & DB</span>
                    </span>
                  </button>

                  {/* Reset Cache Tile (Admin only) */}
                  {currentUser?.role === 'admin' && (
                    <button
                      type="button"
                      className="mobile-control-tile"
                      onClick={() => { closeMenu(); setShowResetConfirm(true) }}
                      aria-label="Làm mới dữ liệu trên thiết bị"
                    >
                      <span className="mobile-control-tile__icon">
                        <RefreshCw size={17} className="text-amber-300" />
                      </span>
                      <span className="mobile-control-tile__content">
                        <strong className="mobile-control-tile__title">Làm mới dữ liệu</strong>
                        <span className="mobile-control-tile__desc">Tải lại từ máy chủ</span>
                      </span>
                    </button>
                  )}

                  {/* Install PWA Tile (if installable) */}
                  {canInstall && (
                    <button
                      type="button"
                      className="mobile-control-tile"
                      onClick={() => { install(); closeMenu() }}
                      aria-label="Cài đặt ứng dụng PWA"
                    >
                      <span className="mobile-control-tile__icon">
                        <Download size={17} className="text-indigo-300" />
                      </span>
                      <span className="mobile-control-tile__content">
                        <strong className="mobile-control-tile__title">Cài ứng dụng</strong>
                        <span className="mobile-control-tile__desc">Thêm ra màn hình</span>
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Action Footer */}
              <div className="mobile-control-sheet__footer">
                <button
                  type="button"
                  className="btn mobile-control-action"
                  onClick={() => { navigate({ to: '/settings' }); closeMenu() }}
                >
                  <Settings size={16} /> Cài đặt
                </button>
                <button
                  type="button"
                  className="btn mobile-control-action mobile-control-action--danger"
                  onClick={handleLogout}
                >
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

      {showDiagnostics && (
        <Suspense fallback={<span role="status" className="sr-only">Đang tải chẩn đoán hệ thống</span>}>
          <SystemDiagnosticsModal isOpen onClose={() => setShowDiagnostics(false)} />
        </Suspense>
      )}
    </>
  )
}

