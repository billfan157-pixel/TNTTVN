import React, { useState, useEffect } from 'react'
import { useStudentStore } from '../../stores/studentStore'
import { useFilterStore } from '../../stores/filterStore'
import { useEffectiveMode } from '../../hooks/useEffectiveMode'
import { resetAllStoresToDefault } from '../../stores/resetStores'
import { useTheme } from '../../hooks/useTheme'
import { ConfirmDialog } from './ConfirmDialog'
import { SystemDiagnosticsModal } from '../desktop/SystemDiagnosticsModal'
import { OfflineBanner } from './OfflineBanner'
import logo from '../../assets/logo-tntt.png'
import { Monitor, Smartphone, Moon, Sun, RefreshCw, Search, LogOut, UserCheck, Activity } from 'lucide-react'
import { clearTokens } from '../../lib/api'
import { useNavigate } from '@tanstack/react-router'
import { MOCK_CLASSES } from '../../data/mockParishData'

export const HeaderBar: React.FC = () => {
  const students = useStudentStore((s) => s.students)
  const viewMode = useFilterStore((s) => s.viewMode)
  const setViewMode = useFilterStore((s) => s.setViewMode)
  const searchQuery = useFilterStore((s) => s.searchQuery)
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery)
  const selectedSemester = useFilterStore((s) => s.selectedSemester)
  const setSelectedSemester = useFilterStore((s) => s.setSelectedSemester)
  const selectedClassId = useFilterStore((s) => s.selectedClassId)
  const setSelectedClassId = useFilterStore((s) => s.setSelectedClassId)
  const effectiveMode = useEffectiveMode()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const [localSearch, setLocalSearch] = useState(searchQuery)
  const [currentUser, setCurrentUser] = useState<{ fullName?: string; username?: string; role?: string } | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('parish_current_user')
      if (stored) setCurrentUser(JSON.parse(stored))
    } catch {
      // Ignore
    }
  }, [])

  useEffect(() => {
    setLocalSearch(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [localSearch, setSearchQuery])

  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const handleReset = () => {
    setShowResetConfirm(true)
  }

  const handleLogout = () => {
    clearTokens()
    localStorage.removeItem('parish_current_user')
    navigate({ to: '/login' })
  }

  return (
    <>
      <OfflineBanner />
      <header
        className="sticky top-0 z-50"
        style={{
          background: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
        }}
      >
        <div
          className={`flex items-center justify-between flex-wrap w-full gap-4 ${
            effectiveMode === 'desktop' ? 'px-6' : 'px-4'
          }`}
          style={{ minHeight: effectiveMode === 'desktop' ? '80px' : '72px' }}
        >
          {/* Logo & Title */}
          <div className="flex items-center gap-4">
            <img src={logo} alt="TNTT Logo" className={`shrink-0 ${effectiveMode === 'desktop' ? 'w-10 h-10' : 'w-9 h-9'}`} />
            <div>
              <div className="flex items-center gap-3">
                <h1 className={`font-extrabold m-0 text-white ${effectiveMode === 'desktop' ? 'text-xl' : 'text-[16px]'}`}>
                  Giáo Lý Thiếu Nhi Thánh Thể
                </h1>
                <span className="font-extrabold rounded-md text-xs px-3 py-1 bg-[#FDE047] text-[#1E3A8A]">Giáo Xứ Gia Tôn</span>
              </div>
              <p className={`m-0 mt-1 font-medium text-white opacity-90 ${effectiveMode === 'desktop' ? 'text-xs' : 'text-[11px]'}`}>
                Sổ Điểm & Theo Dõi Học Tập • Niên Học 2025 - 2026 ({students.length} Thiếu Nhi)
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Class Switcher Dropdown */}
            <div className="flex items-center gap-2 bg-black/20 border border-white/20 rounded-xl px-3 py-1 text-xs text-white">
              <span className="text-white/70 hidden sm:inline">Lớp:</span>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="bg-transparent text-white font-semibold outline-hidden cursor-pointer"
              >
                <option value="all" className="text-text-main">
                  Tất cả lớp học
                </option>
                {MOCK_CLASSES.map((c) => (
                  <option key={c.id} value={c.id} className="text-text-main">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Search */}
            <div className={`relative ${effectiveMode === 'desktop' ? 'w-48' : 'w-32'}`}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên, mã..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="w-full h-8 text-xs rounded-full outline-hidden pl-9 pr-3.5 border border-white/30 bg-white/15 text-white placeholder:text-white/60"
              />
            </div>

            {/* Semester Selector */}
            <div className="flex items-center gap-1.5 h-8 px-1 rounded-xl bg-white/15">
              <button
                type="button"
                onClick={() => setSelectedSemester(1)}
                className="flex items-center px-2.5 h-6 text-xs font-bold rounded-lg transition-all"
                style={{
                  background: selectedSemester === 1 ? 'white' : 'transparent',
                  color: selectedSemester === 1 ? '#1E3A8A' : 'white',
                }}
              >
                HK I
              </button>
              <button
                type="button"
                onClick={() => setSelectedSemester(2)}
                className="flex items-center px-2.5 h-6 text-xs font-bold rounded-lg transition-all"
                style={{
                  background: selectedSemester === 2 ? 'white' : 'transparent',
                  color: selectedSemester === 2 ? '#1E3A8A' : 'white',
                }}
              >
                HK II
              </button>
            </div>

            {/* System Diagnostics Trigger (Phase 9) */}
            <button
              type="button"
              onClick={() => setShowDiagnostics(true)}
              title="Bảng Chẩn Đoán System Telemetry"
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/15 text-[#FDE047] hover:bg-white/25 transition-colors"
            >
              <Activity size={16} />
            </button>

            {/* User Profile Badge & Logout */}
            {currentUser ? (
              <div className="flex items-center gap-2 bg-white/15 px-3 py-1 rounded-xl border border-white/20 text-xs text-white">
                <UserCheck className="w-4 h-4 text-[#FDE047]" />
                <div className="hidden lg:block text-left">
                  <div className="font-bold leading-tight">{currentUser.fullName}</div>
                  <div className="text-[10px] text-white/70 uppercase font-mono">{currentUser.role}</div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Đăng xuất"
                  className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-1"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate({ to: '/login' })}
                className="px-3 py-1 bg-[#FDE047] hover:bg-[#FACC15] text-[#1E3A8A] font-bold text-xs rounded-xl transition-colors"
              >
                Đăng Nhập
              </button>
            )}

            {/* View Mode Switcher */}
            <div className="flex items-center h-8 px-1 rounded-xl gap-0 bg-black/25 border border-white/20">
              <button
                type="button"
                onClick={() => setViewMode('desktop')}
                title="Chuyển sang Giao diện Desktop"
                className="flex items-center gap-1 px-2.5 h-6 text-xs font-bold rounded-lg"
                style={{
                  background: viewMode === 'desktop' || (viewMode === 'auto' && effectiveMode === 'desktop') ? '#FEF08A' : 'transparent',
                  color: viewMode === 'desktop' || (viewMode === 'auto' && effectiveMode === 'desktop') ? '#854D0E' : 'white',
                }}
              >
                <Monitor size={14} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('mobile')}
                title="Chuyển sang Giao diện Mobile"
                className="flex items-center gap-1 px-2.5 h-6 text-xs font-bold rounded-lg"
                style={{
                  background: viewMode === 'mobile' || (viewMode === 'auto' && effectiveMode === 'mobile') ? '#FEF08A' : 'transparent',
                  color: viewMode === 'mobile' || (viewMode === 'auto' && effectiveMode === 'mobile') ? '#854D0E' : 'white',
                }}
              >
                <Smartphone size={14} />
              </button>
            </div>

            {/* Dark mode toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/15 text-white"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Reset button */}
            <button
              type="button"
              onClick={handleReset}
              title="Khôi phục dữ liệu gốc"
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25 transition-colors"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
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
        }}
        onCancel={() => setShowResetConfirm(false)}
      />

      <SystemDiagnosticsModal isOpen={showDiagnostics} onClose={() => setShowDiagnostics(false)} />
    </>
  )
}
