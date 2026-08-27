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
  // PHA 4 (audit A5): chặn force-desktop trên màn < 768px — sidebar 260px +
  // padding chỉ chừa ~65px nội dung ở 375px, không dùng được.
  const isNarrowViewport = useMediaQuery('(max-width: 767.9px)')
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
        <header
          className="sticky top-0 z-[var(--z-header)] transition-all duration-300 border-b border-white/15"
          style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 55%, #1D4ED8 100%)',
            boxShadow: '0 8px 24px -4px rgba(15, 23, 42, 0.3), 0 4px 6px -2px rgba(15, 23, 42, 0.1)',
          }}
        >
          <div
            className={`flex items-center justify-between flex-wrap w-full gap-3 py-3.5 ${
              effectiveMode === 'desktop' ? 'px-6' : 'px-4'
            }`}
          >
            {/* Logo & Title Section */}
            <div className="flex items-center gap-3.5">
              <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xl p-1 flex items-center justify-center border border-white/20 shadow-[0_8px_24px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] overflow-hidden">
                <img src={logo} alt="Logo Xứ Đoàn Đức Mẹ Fatima" className="w-full h-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="font-extrabold tracking-tight m-0 text-white text-lg drop-shadow-sm">
                    Xứ Đoàn Đức Mẹ Fatima
                  </h1>
                  <span className="font-bold rounded-full text-[11px] px-2.5 py-0.5 bg-amber-300 text-slate-900 shadow-sm uppercase tracking-wide">
                    Giáo Xứ Gia Tôn
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-white/85 font-medium">
                  <span className="flex items-center gap-1.5 bg-white/10 px-2.5 py-0.5 rounded-md border border-white/10 backdrop-blur-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Niên Học {academicYearDisplay}
                  </span>
                  <span className="text-white/40">•</span>
                  <span className="text-amber-200 font-semibold">{students.length} Thiếu Nhi</span>
                </div>
              </div>
            </div>

            {/* Controls Section — Option A: filters lại trong header (mega-bar), đã fix xl->lg + contrast */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Class & Search Group — Option A: giữ trong header, contrast 4.5:1 + clear */}
              <div className="flex items-center gap-2 bg-black/30 border border-white/20 rounded-2xl p-1 shadow-inner backdrop-blur-md">
                {currentUser?.role === 'admin' && (
                  <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-white">
                    <span className="text-white/70 font-medium hidden sm:inline">Lớp:</span>
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="bg-transparent text-white font-semibold outline-none cursor-pointer pr-1"
                    >
                      <option value="all" className="text-slate-900">Tất cả lớp học</option>
                      {classList.map((c) => (
                        <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-white relative">
                  <Search size={14} className="text-white/60 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên, mã..."
                    aria-label="Tìm tên, mã thiếu nhi"
                    className="bg-transparent text-white placeholder-white/70 text-xs font-medium outline-none w-28 sm:w-36 lg:w-44"
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} aria-label="Xóa tìm kiếm" className="absolute right-1 w-6 h-6 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-colors">×</button>
                  )}
                </div>
              </div>
              {/* Semester — Option A: giữ trong header */}
              <div className="flex items-center gap-1 h-11 px-1 rounded-2xl bg-black/30 border border-white/20 shadow-inner backdrop-blur-md">
                {semesterRestricted ? (
                  <span className="flex items-center px-3 h-9 text-sm font-bold rounded-lg text-white bg-white/15">Học Kỳ {openSemester === 2 ? 'II' : 'I'}</span>
                ) : (
                  <>
                    <button type="button" onClick={() => setSelectedSemester(1)} aria-pressed={selectedSemester === 1} className="flex items-center px-3 h-9 text-sm font-bold rounded-lg transition-all" style={{ background: selectedSemester === 1 ? 'white' : 'transparent', color: selectedSemester === 1 ? '#1E3A8A' : 'white' }}>HK I</button>
                    <button type="button" onClick={() => setSelectedSemester(2)} aria-pressed={selectedSemester === 2} className="flex items-center px-3 h-9 text-sm font-bold rounded-lg transition-all" style={{ background: selectedSemester === 2 ? 'white' : 'transparent', color: selectedSemester === 2 ? '#1E3A8A' : 'white' }}>HK II</button>
                  </>
                )}
              </div>
              <div className="hidden lg:block h-8 w-px bg-white/15 shrink-0" aria-hidden="true" />

              <div className="flex items-center gap-1.5">
                {/* View Mode Switcher */}
                <div className="flex items-center h-11 px-1 rounded-2xl gap-0.5 bg-black/30 border border-white/20 shadow-inner backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setViewMode('desktop')}
                    disabled={isNarrowViewport}
                    title={isNarrowViewport ? 'Màn hình quá nhỏ — chế độ Desktop cần tối thiểu 768px' : 'Chuyển sang Giao diện Desktop'}
                    aria-label="Chuyển sang Giao diện Desktop"
                    aria-pressed={viewMode === 'desktop' || (viewMode === 'auto' && effectiveMode === 'desktop')}
                    className="flex items-center justify-center w-9 h-9 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: viewMode === 'desktop' || (viewMode === 'auto' && effectiveMode === 'desktop') ? '#FDE047' : 'transparent',
                      color: viewMode === 'desktop' || (viewMode === 'auto' && effectiveMode === 'desktop') ? '#1E293B' : 'white',
                    }}
                  >
                    <Monitor size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('mobile')}
                    title="Chuyển sang Giao diện Mobile"
                    aria-label="Chuyển sang Giao diện Mobile"
                    aria-pressed={viewMode === 'mobile'}
                    className="flex items-center justify-center w-9 h-9 rounded-lg text-xs font-bold transition-all"
                    style={{
                      background: viewMode === 'mobile' ? '#FDE047' : 'transparent',
                      color: viewMode === 'mobile' ? '#1E293B' : 'white',
                    }}
                  >
                    <Smartphone size={14} />
                  </button>
                </div>

                {/* Theme Toggle — Phase 1 a11y: aria-pressed + double ring */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  title="Đổi giao diện sáng/tối"
                  aria-label="Đổi giao diện sáng/tối"
                  aria-pressed={theme === 'dark'}
                  className="h-10 w-10 flex items-center justify-center rounded-xl bg-black/30 border border-white/20 text-white hover:bg-white/20 transition-all shadow-inner backdrop-blur-md focus:shadow-[0_0_0_2px_white,0_0_0_4px_var(--color-parish-primary)] focus:ring-0"
                >
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>

                {/* System Diagnostics */}
                <button
                  type="button"
                  onClick={() => setShowDiagnostics(true)}
                  title="Bảng Chẩn Đoán System Telemetry"
                  aria-label="Bảng Chẩn Đoán Hệ Thống"
                  className="h-10 w-10 flex items-center justify-center rounded-xl bg-black/30 border border-white/20 text-amber-300 hover:bg-white/20 transition-all shadow-inner backdrop-blur-md"
                >
                  <Activity size={16} />
                </button>

                {/* Reset — destructive hint qua rose tint */}
                <button
                  type="button"
                  onClick={handleReset}
                  title="Khôi phục dữ liệu gốc"
                  aria-label="Khôi phục dữ liệu gốc"
                  className="h-10 w-10 flex items-center justify-center rounded-xl bg-black/30 border border-white/20 text-white hover:text-rose-300 hover:bg-white/20 transition-all shadow-inner backdrop-blur-md"
                >
                  <RefreshCw size={15} />
                </button>
              </div>

              {/* ── Zone 3: User identity (cùng phải) ── */}
              {currentUser ? (
                <div className="flex items-center gap-2.5 bg-black/30 px-3 py-1 rounded-2xl border border-white/20 text-xs text-white shadow-inner backdrop-blur-md">
                  <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300 font-bold shrink-0">
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
                    className="p-1.5 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors ml-1"
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
        title="Khôi phục dữ liệu gốc"
        message="Bạn có chắc chắn muốn khôi phục lại toàn bộ dữ liệu mẫu ban đầu? Thao tác này sẽ ghi đè các dữ liệu hiện tại."
        confirmText="Đồng ý khôi phục"
        variant="danger"
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
