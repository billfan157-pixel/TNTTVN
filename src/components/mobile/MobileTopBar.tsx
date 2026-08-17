import React, { useEffect, useState } from 'react'
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
  WifiOff
} from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../hooks/useTheme'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { resetAllStoresToDefault } from '../../stores/resetStores'
import { useSyncStore } from '../../stores/syncStore'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { SystemDiagnosticsModal } from '../desktop/SystemDiagnosticsModal'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Tổng quan giáo xứ',
  '/students': 'Danh sách thiếu nhi',
  '/grades': 'Bảng điểm giáo lý',
  '/attendance': 'Điểm danh chuyên cần',
  '/reports': 'Báo cáo & kết quả học tập',
  '/notices': 'Thông báo giáo xứ',
  '/parent': 'Con của tôi',
  '/settings': 'Cài đặt',
}

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

  const title = pageTitles[location.pathname] || 'Sổ điểm giáo lý'
  const isParent = currentUser?.role === 'phuhuynh'
  const eyebrow = isParent ? `CỔNG PHỤ HUYNH · ${academicYearDisplay}` : `GIÁO XỨ GIA TÔN · ${academicYearDisplay}`
  const summary = isParent ? 'Theo dõi việc học của gia đình' : `${students.length} thiếu nhi đang quản lý`

  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  const handleLogout = () => {
    useAuthStore.getState().logout()
    navigate({ to: '/login' })
  }

  const closeMenu = () => setIsOpen(false)

  return (
    <>
      <header className="mobile-top-bar">
        <div className="mobile-top-bar__content">
          <div className="mobile-top-bar__identity">
            <div className="mobile-top-bar__brand-mark" aria-hidden="true">GL</div>
            <div className="mobile-top-bar__copy">
              <div className="mobile-top-bar__eyebrow">{eyebrow}</div>
              <h1>{title}</h1>
              <p>{summary}</p>
            </div>
          </div>

          <div className="mobile-top-bar__actions flex items-center gap-2">
            {/* Mini Sync/Offline Badge */}
            {(() => {
              const isOnline = useOnlineStatus();
              const status = useSyncStore(s => s.status);
              const pendingCount = useSyncStore(s => s.pendingCount);
              const isSyncing = status === 'syncing';

              if (!isOnline) {
                return (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-400" title="Đang offline">
                    <WifiOff size={16} />
                  </div>
                );
              }
              if (isSyncing) {
                return (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/20 text-sky-400" title="Đang đồng bộ...">
                    <RefreshCw size={16} className="animate-spin" />
                  </div>
                );
              }
              if (pendingCount > 0) {
                return (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 relative" title={`${pendingCount} thay đổi chưa đồng bộ`}>
                    <WifiOff size={16} />
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                      {pendingCount}
                    </span>
                  </div>
                );
              }
              return null; // Fully online & synced -> show nothing
            })()}

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
              className="mobile-sheet-trigger w-11 h-11 flex items-center justify-center"
              onClick={() => setIsOpen(value => !value)}
              aria-expanded={isOpen}
              aria-controls="mobile-control-sheet"
              aria-label={isOpen ? 'Đóng bảng điều khiển' : 'Mở bảng điều khiển'}
            >
              {isOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>

        {isOpen && (
          <>
            <button
              type="button"
              className="mobile-control-sheet__scrim"
              onClick={closeMenu}
              aria-label="Đóng bảng điều khiển"
            />
            <div id="mobile-control-sheet" className="mobile-control-sheet">
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
                <span className="mobile-control-search">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
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
              <button type="button" className="mobile-control-icon" onClick={() => setShowDiagnostics(true)} aria-label="Mở chẩn đoán hệ thống">
                <Activity size={17} />
              </button>
              <button type="button" className="mobile-control-icon" onClick={() => setShowResetConfirm(true)} aria-label="Khôi phục dữ liệu mặc định">
                <RefreshCw size={17} />
              </button>
            </div>

            <div className="mobile-control-sheet__actions">
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
          </>
        )}
      </header>

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Khôi phục dữ liệu gốc"
        message="Bạn có chắc muốn khôi phục dữ liệu Giáo xứ mặc định? Thao tác này sẽ đặt lại dữ liệu mẫu gốc."
        confirmText="Khôi phục"
        cancelText="Hủy"
        variant="warning"
        onConfirm={() => {
          resetAllStoresToDefault()
          setShowResetConfirm(false)
          closeMenu()
        }}
        onCancel={() => setShowResetConfirm(false)}
      />

      <SystemDiagnosticsModal isOpen={showDiagnostics} onClose={() => setShowDiagnostics(false)} />
    </>
  )
}

